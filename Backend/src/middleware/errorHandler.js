const errorHandler = (err, _req, res, _next) => {
    // Postgres: invalid UUID / invalid input syntax -> 400
    if (err.code === "22P02") return res.status(400).json({ error: "Invalid id" });
    // Postgres: foreign key violation -> 400
    if (err.code === "23503") return res.status(400).json({ error: "Referenced resource does not exist" });
    // Postgres: unique constraint -> 409
    if (err.code === "23505") return res.status(409).json({ error: "Resource already exists" });

    const status = err.statusCode || 500;
    if (status >= 500) console.error("Server error: ", err);
    res.status(status).json({
        error: status >= 500 ? "Internal server error" : err.message,
    });
};

const notFoundHandler = (_req, res) => {
    res.status(404).json({ error: "Route not found" });
};

module.exports = { errorHandler, notFoundHandler };