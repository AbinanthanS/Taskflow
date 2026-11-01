/**
 * src/config/env.js
 *
 * Validates required environment variables at startup.
 * Call this before requiring any other module that uses env vars.
 */

require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

const missing = [];
const warnings = [];

// JWT_SECRET: required; must be >= 32 chars in production
if (!process.env.JWT_SECRET) {
    missing.push("JWT_SECRET");
} else if (isProduction && process.env.JWT_SECRET.length < 32) {
    missing.push("JWT_SECRET (must be at least 32 characters in production)");
}

// DATABASE_URL: always required
if (!process.env.DATABASE_URL) {
    missing.push("DATABASE_URL");
}

// GEMINI_API_KEY: warn but don't crash (AI features degrade gracefully)
if (!process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY === "your_gemini_api_key" ||
    process.env.GEMINI_API_KEY === "your-gemini-api-key") {
    warnings.push("GEMINI_API_KEY is not set — AI features will return 503");
}

if (missing.length > 0) {
    console.error("[startup] FATAL — missing required environment variables:");
    for (const m of missing) console.error(`  • ${m}`);
    process.exit(1);
}

for (const w of warnings) {
    console.warn(`[startup] WARNING: ${w}`);
}

module.exports = {};
