const { query } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { emitToBoard, logActivity } = require("../realtime");
const PRIORITIES = ["low", "medium", "high", "urgent"];

const fetchTask = async (taskId) => {
    const { rows } = await query(
        `SELECT t.*,
                a.name AS assignee_name, a.email AS assignee_email, a.avatar_url AS assignee_avatar
            FROM tasks t
            LEFT JOIN users a ON a.id = t.assignee_id
            WHERE t.id = $1`,
            [taskId]
    );
    return rows[0];
};

const ensureColumnInBoard = async (columnId, boardId) => {
    const { rows } = await query(
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
    if (String(assigneeId) === String(ownerId)) return; // owner is always valid
    const { rows } = await query(
        "SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2",
        [boardId, assigneeId]
    );
    if (!rows.length) throw ApiError.badRequest("Assignee must be a board member");
};

const listTasks = asyncHandler(async (req, res) => {
    const filters = ["t.board_id = $1"];
    const params = [req.board.id];

    if (req.query.priority) {
        params.push(req.query.priority);
        filters.push(`t.priority = $${params.length}`);
    }
    if (req.query.assignee) {
        params.push(req.query.assignee);
        filters.push(`t.assignee_id = $${params.length}`);
    }
    if (req.query.column) {
        params.push(req.query.column);
        filters.push(`t.column_id = $${params.length}`);
    }

    if (req.query.q) {
        params.push(`%${req.query.q}%`);
        filters.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
    }

    const { rows } = await query(
        `SELECT t.*,
            a.name AS assignee_name, a.email AS assignee_email, a.avatar_url AS assignee_avatar
          FROM tasks t
          LEFT JOIN users a ON a.id = t.assignee_id
          WHERE ${filters.join(" AND ")}
          ORDER BY t.position ASC`,
          params
    );
    res.json({ tasks: rows });
});

const createTask = asyncHandler(async (req, res) => {
    const { column_id, title: rawTitle, description, due_date, assignee_id } = req.body;
    const title = (rawTitle || "").trim();
    const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : "medium";

    if (!title) throw ApiError.badRequest("Task title is required");
    if (!column_id) throw ApiError.badRequest("column_id is required");
    await ensureColumnInBoard(column_id, req.board.id);

    // Validate assignee if provided
    if (assignee_id != null) {
        await ensureAssigneeIsMember(assignee_id, req.board.id, req.board.owner_id);
    }

    const posRes = await query(
        "SELECT COALESCE(MAX(position), 0) + 1000 AS pos FROM tasks WHERE column_id = $1",
        [column_id]
    );

    const { rows } = await query(
        `INSERT INTO tasks (board_id, column_id, title, description, priority, due_date, assignee_id, position, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
            req.board.id,
            column_id,
            title,
            description || null,
            priority,
            due_date || null,
            assignee_id || null,
            posRes.rows[0].pos,
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
    }
    if (priority !== undefined && !PRIORITIES.includes(priority))
        throw ApiError.badRequest("Invalid priority");

    // Validate assignee if present and non-null
    if (assignee_id !== undefined && assignee_id !== null) {
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

    const pos = Number(position);
    if (!Number.isFinite(pos))
        throw ApiError.badRequest("position must be a finite number");

    await ensureColumnInBoard(column_id, req.board.id);

    const prevRes = await query(
        "SELECT t.column_id, c.title FROM tasks t JOIN columns c ON c.id = t.column_id WHERE t.id = $1 AND t.board_id = $2",
        [req.params.taskId, req.board.id]
    );
    if (!prevRes.rows.length) throw ApiError.notFound("Task not found");
    const movedColumns = prevRes.rows[0].column_id !== column_id;

    const { rows } = await query(
        `UPDATE tasks
            SET column_id = $3, position = $4, updated_at = now()
          WHERE id = $1 AND board_id = $2
          RETURNING id`,
          [req.params.taskId, req.board.id, column_id, pos]
    );

    if (!rows.length) throw ApiError.notFound("Task not found");

    const task = await fetchTask(rows[0].id);
    emitToBoard(req.board.id, "task:moved", task);

    if (movedColumns) {
        const colRes = await query("SELECT title FROM columns WHERE id = $1", [column_id]);
        await logActivity({
            boardId: req.board.id,
            userId: req.user.id,
            action: "task.moved",
            message: `${req.user.name} moved "${task.title}" to ${colRes.rows[0].title}`,
            metadata: { taskId: task.id, columnId: column_id },
        });
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

module.exports = { listTasks, createTask, updateTask, moveTask, deleteTask };