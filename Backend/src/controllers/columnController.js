const { query } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { emitToBoard } = require("../realtime");

const createColumn = asyncHandler(async (req, res) => {
    const title = (req.body.title || "").trim();
    if (!title) throw ApiError.badRequest("Column title is required");

    // Atomically compute position via INSERT...SELECT
    const { rows } = await query(
        `INSERT INTO columns (board_id, title, position)
         SELECT $1, $2, COALESCE(MAX(position), 0) + 1000
         FROM columns WHERE board_id = $1
         RETURNING *`,
        [req.board.id, title]
    );
    emitToBoard(req.board.id, "column:created", rows[0]);
    res.status(201).json({ column: rows[0] });
});

const updateColumn = asyncHandler(async (req, res) => {
    const { title, position } = req.body;

    if (title !== undefined) {
        const t = (title || "").trim();
        if (!t) throw ApiError.badRequest("Column title cannot be empty");
    }

    // Build SET clause dynamically — only update present fields
    const updates = [];
    const params = [req.params.columnId, req.board.id];

    const addField = (col, val) => {
        params.push(val);
        updates.push(`${col} = $${params.length}`);
    };

    if (title !== undefined) addField("title", (title || "").trim());
    if (position !== undefined && position !== null) addField("position", Number(position));

    if (!updates.length) throw ApiError.badRequest("No fields to update");

    const { rows } = await query(
        `UPDATE columns SET ${updates.join(", ")} WHERE id = $1 AND board_id = $2 RETURNING *`,
        params
    );
    if (!rows.length) throw ApiError.notFound("Column not found");
    emitToBoard(req.board.id, "column:updated", rows[0]);
    res.json({ column: rows[0] });
});

const deleteColumn = asyncHandler(async (req, res) => {
    const result = await query(
        "DELETE FROM columns WHERE id = $1 AND board_id = $2",
        [req.params.columnId, req.board.id],
    );
    if (!result.rowCount) throw ApiError.notFound("Column not found");
    emitToBoard(req.board.id, "column:deleted", { id: req.params.columnId });
    res.json({ success: true });
});

module.exports = { createColumn, updateColumn, deleteColumn };