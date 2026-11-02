require("dotenv").config();
const request = require("supertest");
const jwt = require("jsonwebtoken");
const { pool, query } = require("../src/config/db");
const { runMigrations } = require("../src/db/migrate");
const app = require("../src/app");

const TEST_DB_URL = process.env.DATABASE_URL_TEST;
const hasTestDb = Boolean(TEST_DB_URL);

if (!hasTestDb) {
    console.log(
        "\n========================================================================\n" +
        "  NOTICE: DATABASE_URL_TEST is not set.\n" +
        "  Tests requiring a PostgreSQL test database will be skipped cleanly.\n" +
        "  To run full database integration tests, set DATABASE_URL_TEST in .env\n" +
        "========================================================================\n"
    );
}

// Generate valid test JWT token for any user payload
const makeTestToken = (payload = {}) => {
    const user = {
        id: payload.id || "00000000-0000-4000-8000-000000000001",
        email: payload.email || "testuser@example.com",
        name: payload.name || "Test User",
        ...payload,
    };
    const secret = process.env.JWT_SECRET || "fallback_test_secret_for_jwt_signing_min_32_chars";
    return jwt.sign(user, secret, { expiresIn: "1h" });
};

// Reset tables between DB-backed tests
const resetDb = async () => {
    if (!hasTestDb) return;
    await query(`
        TRUNCATE users, boards, board_members, columns, tasks, activities CASCADE;
    `);
};

// Initialize DB schema on test startup if test DB is configured
let dbInitialized = false;
const initTestDb = async () => {
    if (!hasTestDb || dbInitialized) return;
    try {
        await runMigrations();
        dbInitialized = true;
    } catch (err) {
        console.error("Failed to run migrations on test DB:", err.message);
    }
};

module.exports = {
    app,
    request,
    hasTestDb,
    makeTestToken,
    resetDb,
    initTestDb,
    pool,
};
