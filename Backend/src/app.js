/**
 * src/app.js
 *
 * Builds and exports the Express app (without creating the HTTP server).
 * Separating app from server makes the app independently testable.
 */
require("./config/env"); // fail-fast config validation

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { rateLimit } = require("express-rate-limit");

const apiRoutes = require("./routes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

const app = express();

// ── Trust proxy in production (needed for correct IP behind load balancer) ──
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        credentials: true,
    })
);

// ── Request logging ───────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));

// ── Rate limiters ─────────────────────────────────────────────────────────────

// General API limiter: 300 req / 15 min per IP
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
});

// Auth limiter: 10 req / 15 min per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts, please try again later" },
});

app.use("/api", generalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", uptime: process.uptime() })
);

// ── Root info ─────────────────────────────────────────────────────────────────
app.get("/", (_req, res) =>
    res.json({ name: "AI-Taskflow API", status: "running" })
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", apiRoutes);

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
