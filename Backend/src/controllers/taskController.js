const { query, withTransaction } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { emitToBoard, logActivity } = require("../realtime");
const { isUuid } = require("../middleware/validateUuid");
const PRIORITIES = ["low", "medium", "high", "urgent"];

const REBALANCE_GAP_THRESHOLD = 0.001;

const fetchTask = async (taskId, client) => {
    const q = client || { query: (text, params) => query(text, params) };
    const { rows } = await q.query(
        `SELECT t.*,
                a.name AS assignee_name, a.email AS assignee_email, a.avatar_url AS assignee_avatar
            FROM tasks t
            LEFT JOIN users a ON a.id = t.assignee_id
            WHERE t.id = $1`,
            [taskId]
    );
    return rows[0];
};

const ensureColumnInBoard = async (columnId, boardId, client) => {
    const fn = client
        ? (text, params) => client.query(text, params)
        : (text, params) => query(text, params);
    const { rows } = await fn(
        "SELECT id FROM columns WHERE id = $1 AND board_id = $2",
        [columnId, boardId]
    );
    if (!rows.length) throw ApiError.badRequest("Column does not belong to this board");
};

/**
 * Validate that assignee_id is the board owner or a board member.
 * Only called when assignee_id is a non-null value.
 */
const ensureAssigneeIsMember = async (assigneeId, boardId, ownerId) => {
    if (String(assigneeId) === String(ownerId)) return;
    const { rows } = await query(
        "SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2",
        [boardId, assigneeId]
    );
    if (!rows.length) throw ApiError.badRequest("Assignee must be a board member");
};

/**
 * Escape ILIKE special characters %, _, \ in a search string.
 */
const escapeLike = (s) => s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

/**
 * Renumber all tasks in a column to 1000, 2000, 3000, ...
 * Called when positions get too close together.
 * Emits column:rebalanced after commit so clients can resync.
 */
const rebalanceColumn = async (client, columnId, boardId, io) => {
    const { rows } = await client.query(
        "SELECT id FROM tasks WHERE column_id = $1 ORDER BY position ASC",
        [columnId]
    );
    for (let i = 0; i < rows.length; i++) {
        await client.query(
            "UPDATE tasks SET position = $1 WHERE id = $2",
            [(i + 1) * 1000, rows[i].id]
        );
    }
    // Return updated positions to emit after commit
    return rows.map((r, i) => ({ id: r.id, position: (i + 1) * 1000 }));
};

const listTasks = asyncHandler(async (req, res) => {
    const filters = ["t.board_id = $1"];
    const params = [req.board.id];

    if (req.query.priority) {
        if (!PRIORITIES.includes(req.query.priority))
            throw ApiError.badRequest("Invalid priority filter");
        params.push(req.query.priority);
        filters.push(`t.priority = $${params.length}`);
    }
    if (req.query.assignee) {
        if (!isUuid(req.query.assignee))
            throw ApiError.badRequest("Invalid id");
        params.push(req.query.assignee);
        filters.push(`t.assignee_id = $${params.length}`);
    }
    if (req.query.column) {
        if (!isUuid(req.query.column))
            throw ApiError.badRequest("Invalid id");
        params.push(req.query.column);
        filters.push(`t.column_id = $${params.length}`);
    }

    if (req.query.q) {
        const escaped = escapeLike(req.query.q);
        params.push(`%${escaped}%`);
        filters.push(
            `(t.title ILIKE $${params.length} ESCAPE '\\' OR t.description ILIKE $${params.length} ESCAPE '\\')`
        );
    }

    // Pagination
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    params.push(limit, offset);

    const { rows } = await query(
        `SELECT t.*,
            a.name AS assignee_name, a.email AS assignee_email, a.avatar_url AS assignee_avatar
          FROM tasks t
          LEFT JOIN users a ON a.id = t.assignee_id
          WHERE ${filters.join(" AND ")}
          ORDER BY t.position ASC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
    );
    res.json({ tasks: rows });
});

const createTask = asyncHandler(async (req, res) => {
    const { column_id, title: rawTitle, description, due_date, assignee_id } = req.body;
    const title = (rawTitle || "").trim();
    const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : "medium";

    if (!title) throw ApiError.badRequest("Task title is required");
    if (title.length > 200) throw ApiError.badRequest("Task title must be 200 characters or fewer");
    if (description && description.length > 5000)
        throw ApiError.badRequest("Task description must be 5000 characters or fewer");
    if (!column_id) throw ApiError.badRequest("column_id is required");
    if (!isUuid(column_id)) throw ApiError.badRequest("Invalid id");

    await ensureColumnInBoard(column_id, req.board.id);

    // Validate assignee if provided
    if (assignee_id != null) {
        if (!isUuid(String(assignee_id))) throw ApiError.badRequest("Invalid id");
        await ensureAssigneeIsMember(assignee_id, req.board.id, req.board.owner_id);
    }

    // Validate due_date
    if (due_date != null && isNaN(Date.parse(due_date)))
        throw ApiError.badRequest("Invalid due_date");

    // Atomically compute position via INSERT...SELECT
    const { rows } = await query(
        `INSERT INTO tasks (board_id, column_id, title, description, priority, due_date, assignee_id, position, created_by)
        SELECT $1, $2, $3, $4, $5, $6, $7,
               COALESCE(MAX(position), 0) + 1000,
               $8
        FROM tasks WHERE column_id = $2
        RETURNING id`,
        [
            req.board.id,
            column_id,
            title,
            description || null,
            priority,
            due_date || null,
            assignee_id || null,
            req.user.id,
        ]
    );

    const task = await fetchTask(rows[0].id);
    emitToBoard(req.board.id, "task:created", task);
    await logActivity({
        boardId: req.board.id,
        userId: req.user.id,
        action: "task.created",
        message: `${req.user.name} created "${task.title}"`,
        metadata: { taskId: task.id },
    });
    res.status(201).json({ task });
});


const updateTask = asyncHandler(async (req, res) => {
    const body = req.body;
    const { title, description, priority, due_date, assignee_id } = body;

    if (title !== undefined) {
        const t = (title || "").trim();
        if (!t) throw ApiError.badRequest("Task title cannot be empty");
        if (t.length > 200) throw ApiError.badRequest("Task title must be 200 characters or fewer");
    }
    if (description !== undefined && description !== null && description.length > 5000)
        throw ApiError.badRequest("Task description must be 5000 characters or fewer");
    if (priority !== undefined && !PRIORITIES.includes(priority))
        throw ApiError.badRequest("Invalid priority");
    if (due_date !== undefined && due_date !== null && isNaN(Date.parse(due_date)))
        throw ApiError.badRequest("Invalid due_date");

    // Validate assignee if present and non-null
    if (assignee_id !== undefined && assignee_id !== null) {
        if (!isUuid(String(assignee_id))) throw ApiError.badRequest("Invalid id");
        await ensureAssigneeIsMember(assignee_id, req.board.id, req.board.owner_id);
    }

    // Build SET clause dynamically — only include fields that are present in the body.
    const updates = [];
    const params = [req.params.taskId, req.board.id];

    const addField = (col, val) => {
        params.push(val);
        updates.push(`${col} = $${params.length}`);
    };

    if (title !== undefined) addField("title", (title || "").trim());
    if (description !== undefined) addField("description", description ?? null);
    if (priority !== undefined) addField("priority", priority);
    if (due_date !== undefined) addField("due_date", due_date ?? null);
    // assignee_id: explicit null clears it; undefined means omit (keep existing)
    if (assignee_id !== undefined) addField("assignee_id", assignee_id ?? null);

    if (!updates.length) throw ApiError.badRequest("No fields to update");

    updates.push("updated_at = now()");

    const { rows } = await query(
        `UPDATE tasks SET ${updates.join(", ")} WHERE id = $1 AND board_id = $2 RETURNING id`,
        params
    );
    if (!rows.length) throw ApiError.notFound("Task not found");

    const task = await fetchTask(rows[0].id);
    emitToBoard(req.board.id, "task:updated", task);
    res.json({ task });
});

const moveTask = asyncHandler(async (req, res) => {
    const { column_id, position } = req.body;
    if (!column_id || position === undefined)
        throw ApiError.badRequest("column_id and position are required");

    if (!isUuid(column_id)) throw ApiError.badRequest("Invalid id");

    const pos = Number(position);
    if (!Number.isFinite(pos))
        throw ApiError.badRequest("position must be a finite number");

    let rebalanced = null;

    const task = await withTransaction(async (client) => {
        await ensureColumnInBoard(column_id, req.board.id, client);

        const prevRes = await client.query(
            "SELECT t.column_id, c.title FROM tasks t JOIN columns c ON c.id = t.column_id WHERE t.id = $1 AND t.board_id = $2",
            [req.params.taskId, req.board.id]
        );
        if (!prevRes.rows.length) throw ApiError.notFound("Task not found");
        const movedColumns = prevRes.rows[0].column_id !== column_id;

        const { rows } = await client.query(
            `UPDATE tasks
                SET column_id = $3, position = $4, updated_at = now()
              WHERE id = $1 AND board_id = $2
              RETURNING id`,
              [req.params.taskId, req.board.id, column_id, pos]
        );

        if (!rows.length) throw ApiError.notFound("Task not found");

        // Check if we need to rebalance (gap too small or position not finite)
        const neighbourRes = await client.query(
            `SELECT position FROM tasks
              WHERE column_id = $1 AND id != $2
              ORDER BY ABS(position - $3) ASC
              LIMIT 2`,
            [column_id, req.params.taskId, pos]
        );
        const positions = neighbourRes.rows.map((r) => Number(r.position));
        const minGap = positions.length > 1
            ? Math.abs(positions[0] - positions[1])
            : (positions.length === 1 ? Math.abs(positions[0] - pos) : Infinity);

        if (minGap < REBALANCE_GAP_THRESHOLD) {
            rebalanced = await rebalanceColumn(client, column_id, req.board.id);
        }

        const t = await fetchTask(rows[0].id, client);

        if (movedColumns) {
            const colRes = await client.query("SELECT title FROM columns WHERE id = $1", [column_id]);
            await logActivity({
                boardId: req.board.id,
                userId: req.user.id,
                action: "task.moved",
                message: `${req.user.name} moved "${t.title}" to ${colRes.rows[0]?.title}`,
                metadata: { taskId: t.id, columnId: column_id },
            });
        }
        return t;
    });

    emitToBoard(req.board.id, "task:moved", task);
    if (rebalanced) {
        emitToBoard(req.board.id, "column:rebalanced", { columnId: column_id, tasks: rebalanced });
    }
    res.json({ task });
});


const deleteTask = asyncHandler(async (req, res) => {
    const { rows } = await query(
        "DELETE FROM tasks WHERE id = $1 AND board_id = $2 RETURNING title",
        [req.params.taskId, req.board.id],
    );
    if (!rows.length) throw ApiError.notFound("Task not found");

    emitToBoard(req.board.id, "task:deleted", { id: req.params.taskId });
    await logActivity({
        boardId: req.board.id,
        userId: req.user.id,
        action: "task.deleted",
        message: `${req.user.name} deleted "${rows[0].title}"`,
        metadata: { taskId: req.params.taskId },
    });
    res.json({ success: true });
});

module.exports = {
    listTasks,
    createTask,
    updateTask,
    moveTask,
    deleteTask,
    rebalanceColumn,
    REBALANCE_GAP_THRESHOLD,
    ensureAssigneeIsMember,
};