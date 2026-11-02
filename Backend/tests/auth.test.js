const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { app, request, hasTestDb, resetDb, initTestDb, pool } = require("./helpers");

describe("Authentication & Password Policy", () => {
    before(async () => {
        if (hasTestDb) {
            await initTestDb();
            await resetDb();
        }
    });

    after(async () => {
        await pool.end().catch(() => {});
    });

    // ── Input Validation (works with or without DB) ───────────────────────────
    test("POST /api/auth/register rejects password shorter than 8 chars with 400", async () => {
        const res = await request(app)
            .post("/api/auth/register")
            .send({
                name: "Short Pass",
                email: "short@example.com",
                password: "short",
            });

        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /at least 8 characters/i);
    });

    test("POST /api/auth/register rejects password longer than 72 chars with 400", async () => {
        const longPassword = "a".repeat(73);
        const res = await request(app)
            .post("/api/auth/register")
            .send({
                name: "Long Pass",
                email: "long@example.com",
                password: longPassword,
            });

        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /at most 72 characters/i);
    });

    test("POST /api/auth/register rejects missing fields with 400", async () => {
        const res = await request(app)
            .post("/api/auth/register")
            .send({ email: "missing@example.com" });

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
    });

    test("POST /api/auth/login rejects missing email or password with 400", async () => {
        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "user@example.com" });

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
    });

    // ── DB-backed Tests (runs if DATABASE_URL_TEST is set) ────────────────────
    test("Register, login, and enumeration-safe auth", async (t) => {
        if (!hasTestDb) {
            t.skip("Skipping DB tests: DATABASE_URL_TEST is not configured");
            return;
        }

        const email = `testuser_${Date.now()}@example.com`;
        const password = "ValidPassword123!";

        // 1. Successful register
        const regRes = await request(app)
            .post("/api/auth/register")
            .send({
                name: "Auth Test User",
                email,
                password,
            });

        assert.strictEqual(regRes.status, 201);
        assert.ok(regRes.body.token, "Should return JWT token");
        assert.strictEqual(regRes.body.user.email, email);

        // 2. Duplicate registration
        const dupRes = await request(app)
            .post("/api/auth/register")
            .send({
                name: "Auth Test User",
                email,
                password,
            });

        assert.strictEqual(dupRes.status, 409);
        assert.ok(dupRes.body.error);

        // 3. Login with wrong password -> enumeration-safe 401
        const wrongPassRes = await request(app)
            .post("/api/auth/login")
            .send({
                email,
                password: "WrongPassword999!",
            });

        assert.strictEqual(wrongPassRes.status, 401);
        assert.strictEqual(wrongPassRes.body.error, "Invalid email or password");

        // 4. Login with non-existent user -> identical enumeration-safe 401
        const nonExistentRes = await request(app)
            .post("/api/auth/login")
            .send({
                email: "nonexistent_random_user@example.com",
                password: "AnyPassword123!",
            });

        assert.strictEqual(nonExistentRes.status, 401);
        assert.strictEqual(nonExistentRes.body.error, "Invalid email or password");

        // 5. Successful login
        const loginRes = await request(app)
            .post("/api/auth/login")
            .send({ email, password });

        assert.strictEqual(loginRes.status, 200);
        assert.ok(loginRes.body.token);
        assert.strictEqual(loginRes.body.user.email, email);
    });
});
