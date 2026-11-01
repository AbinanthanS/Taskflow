const { query } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Middleware: load board + caller's membership into req.board.
 * Sets req.board = { id, owner_id, role }  where role is
 * "owner" | "admin" | "member".
 */
const requireBoardAccess = asyncHandler(async (req, _res, next) => {
    const boardId = req.params.boardId || req.params.id || req.params.board_id || req.query.board_id;

    if (!boardId) throw ApiError.badRequest("board id is required");

    const { rows } = await query(
        `SELECT b.id, b.owner_id, m.role
            FROM boards b
            LEFT JOIN board_members m
              ON m.board_id = b.id AND m.user_id = $2
            WHERE b.id = $1`,
        [boardId, req.user.id]
    );

    const board = rows[0];
    if (!board) throw ApiError.notFound("Board not found");

    const isOwner = board.owner_id === req.user.id;
    if (!isOwner && !board.role) {
        throw ApiError.forbidden("You do not have access to this board");
    }

    req.board = {
        id: board.id,
        owner_id: board.owner_id,
        role: isOwner ? "owner" : board.role,
    };
    next();
});

/**
 * Middleware factory: require that the caller's role is at least `minRole`.
 * Role hierarchy: owner > admin > member.
 * Usage:  requireRole("admin")  — owner and admin pass; member is rejected.
 *         requireRole("owner")  — only owner passes.
 *
 * Must be used AFTER requireBoardAccess (req.board must exist).
 */
const ROLE_RANK = { owner: 3, admin: 2, member: 1 };

const requireRole = (minRole) => (req, _res, next) => {
    const callerRank = ROLE_RANK[req.board?.role] ?? 0;
    const needed = ROLE_RANK[minRole] ?? 99;
    if (callerRank < needed) {
        throw ApiError.forbidden(`This action requires the '${minRole}' role or higher`);
    }
    next();
};

module.exports = { requireBoardAccess, requireRole };