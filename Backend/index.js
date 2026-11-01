require("dotenv").config();

const http = require("http");
const app = require("./src/app");
const { initSocket } = require("./src/socket");
const { pool } = require("./src/config/db");

const server = http.createServer(app);
const io = initSocket(server);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = (signal) => {
    console.log(`\n[${signal}] Gracefully shutting down…`);
    server.close(async () => {
        try {
            io.close();
            await pool.end();
            console.log("Shutdown complete.");
        } catch (err) {
            console.error("Error during shutdown:", err.message);
        }
        process.exit(0);
    });

    // Force exit after 10 seconds if graceful close stalls
    setTimeout(() => {
        console.error("Forced exit after timeout.");
        process.exit(1);
    }, 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));