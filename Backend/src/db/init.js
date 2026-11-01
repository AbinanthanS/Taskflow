require("dotenv").config();
const { pool } = require("../config/db");
const { runMigrations } = require("./migrate");

(async () => {
    try {
        console.log("Initializing database by running migrations...");
        await runMigrations();
        console.log("Database initialized successfully.");
    } catch (err) {
        console.error("Failed to initialize database:", err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();