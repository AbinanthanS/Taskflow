const { query } = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

const searchUsers = asyncHandler(async (req, res) => {
    const q = (req.query.q || "").trim();

    // Require at least 3 chars to prevent full-user-table enumeration.
    if (q.length < 3) return res.json({ users: [] });

    // Exact email match always returns regardless of shared boards.
    const emailExact = q.includes("@") ? q.toLowerCase() : null;

    const { rows } = await query(
        `SELECT DISTINCT u.id, u.name, u.email, u.avatar_url
           FROM users u
          WHERE (
                 -- exact email match
                 ($2::text IS NOT NULL AND LOWER(u.email) = $2)
                 OR
                 -- share at least one board with requester
                 EXISTS (
                     SELECT 1 FROM board_members bm1
                     JOIN board_members bm2 ON bm1.board_id = bm2.board_id
                     WHERE bm1.user_id = $1 AND bm2.user_id = u.id
                 )
                 OR EXISTS (
                     SELECT 1 FROM boards b
                     WHERE b.owner_id = $1
                     AND (
                       EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = u.id)
                       OR b.owner_id = u.id
                     )
                 )
                )
            AND (u.name ILIKE $3 OR u.email ILIKE $3)
            AND u.id != $1
          ORDER BY u.name ASC
          LIMIT 10`,
        [req.user.id, emailExact, `%${q}%`]
    );
    res.json({ users: rows });
});

module.exports = { searchUsers };