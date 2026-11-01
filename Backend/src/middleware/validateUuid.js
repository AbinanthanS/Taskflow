const ApiError = require("../utils/ApiError");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true if the string is a valid UUID v4-style id.
 */
const isUuid = (val) => typeof val === "string" && UUID_RE.test(val);

/**
 * Middleware factory: validate that the listed route params are valid UUIDs.
 * Usage: validateUuidParams("boardId", "taskId")
 */
const validateUuidParams = (...paramNames) => (req, _res, next) => {
    for (const name of paramNames) {
        const val = req.params[name];
        if (val !== undefined && !isUuid(val)) {
            return next(ApiError.badRequest("Invalid id"));
        }
    }
    next();
};

module.exports = { validateUuidParams, isUuid, UUID_RE };
