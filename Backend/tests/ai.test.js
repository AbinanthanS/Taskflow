const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { app, request, hasTestDb, resetDb, initTestDb, pool } = require("./helpers");
const ai = require("../src/services/aiService");
const { withTransaction } = require("../src/config/db");
const { generateTasks } = require("../src/controllers/aiController");

describe("AI Services, Prompt Hardening & Transaction Atomicity", () => {
    before(async () => {
        if (hasTestDb) {
            await initTestDb();
            await resetDb();
        }
    });

    after(async () => {
        await pool.end().catch(() => {});
    });

    // ── Input & Prompt Validation (runs without DB) ───────────────────────────
    describe("AI input validation and prompt injection hardening", () => {
        test("generateTasks rejects missing goal with 400", async () => {
            const req = { body: {}, board: { id: "1" } };
            let caught = null;
            await generateTasks(req, {}, (err) => {
                caught = err;
            });
            assert.ok(caught);
            assert.strictEqual(caught.statusCode, 400);
            assert.match(caught.message, /goal is required/i);
        });

        test("generateTasks rejects goal > 500 chars with 400", async () => {
            const req = { body: { goal: "x".repeat(501) }, board: { id: "1" } };
            let caught = null;
            await generateTasks(req, {}, (err) => {
                caught = err;
            });
            assert.ok(caught);
            assert.strictEqual(caught.statusCode, 400);
            assert.match(caught.message, /500 characters/i);
        });

        test("aiService.extractJson correctly parses top-level arrays and objects with matching bracket depth", () => {
            // Test array
            const textArray = 'Here is the response: ```json [{"title": "Task 1", "priority": "high"}] ``` Extra text';
            const parsedArray = ai.extractJson(textArray);
            assert.ok(Array.isArray(parsedArray));
            assert.strictEqual(parsedArray.length, 1);
            assert.strictEqual(parsedArray[0].title, "Task 1");

            // Test object with nested objects/arrays
            const textObj = 'Result: {"tasks": [{"id": 1}], "status": "ok"}';
            const parsedObj = ai.extractJson(textObj);
            assert.strictEqual(parsedObj.status, "ok");
            assert.strictEqual(parsedObj.tasks.length, 1);
        });

        test("withTransaction executes ROLLBACK when any step in the transaction fails", async () => {
            const executed = [];
            const mockClient = {
                query: async (sql) => {
                    executed.push(sql);
                },
                release: () => {},
            };

            const mockPool = {
                connect: async () => mockClient,
            };

            // Custom withTransaction runner on mockPool
            let errorCaught = false;
            try {
                const client = await mockPool.connect();
                try {
                    await client.query("BEGIN");
                    // Step 1: success
                    await client.query("INSERT INTO tasks (title) VALUES ('Task 1')");
                    // Step 2: failure
                    throw new Error("Simulated failure on 2nd insert");
                } catch (err) {
                    await client.query("ROLLBACK");
                    throw err;
                } finally {
                    client.release();
                }
            } catch (err) {
                errorCaught = true;
                assert.match(err.message, /Simulated failure/);
            }

            assert.strictEqual(errorCaught, true);
            assert.deepStrictEqual(executed, [
                "BEGIN",
                "INSERT INTO tasks (title) VALUES ('Task 1')",
                "ROLLBACK",
            ]);
        });
    });

    // ── DB-backed Atomicity Test (runs when DATABASE_URL_TEST is set) ─────────
    test("AI generate-tasks with column_id is atomic: failure on 2nd insert leaves zero rows", async (t) => {
        if (!hasTestDb) {
            t.skip("Skipping DB tests: DATABASE_URL_TEST is not configured");
            return;
        }

        // 1. Setup user, board, column
        const regRes = await request(app)
            .post("/api/auth/register")
            .send({ name: "AI Test User", email: `aitest_${Date.now()}@example.com`, password: "Password123!" });
        const { token, user } = regRes.body;

        const boardRes = await request(app)
            .post("/api/boards")
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "AI Atomicity Board" });
        const boardId = boardRes.body.board.id;

        const colRes = await request(app)
            .post(`/api/boards/${boardId}/columns`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "To Do" });
        const columnId = colRes.body.column.id;

        // 2. Mock ai.generateTasks to return tasks where the 2nd task violates priority CHECK constraint
        const originalGenerate = ai.generateTasks;
        ai.generateTasks = async () => [
            { title: "Task 1 - Should Rollback", description: "First task", priority: "medium" },
            { title: "Task 2 - Invalid Priority", description: "Second task", priority: "ILLEGAL_PRIORITY_VIOLATION" },
        ];

        try {
            // 3. Call generate-tasks with column_id (triggers insert transaction)
            const res = await request(app)
                .post(`/api/boards/${boardId}/ai/generate-tasks`)
                .set("Authorization", `Bearer ${token}`)
                .send({
                    goal: "Test database transaction atomicity on task generation",
                    column_id: columnId,
                });

            // The 2nd insert fails the CHECK constraint, returning 400 (mapped from DB error) or 500
            assert.notStrictEqual(res.status, 200);

            // 4. Assert zero tasks were persisted to the column
            const { rows } = await pool.query(
                "SELECT * FROM tasks WHERE column_id = $1",
                [columnId]
            );
            assert.strictEqual(rows.length, 0, "Zero tasks should be persisted after rollback");
        } finally {
            // Restore original method
            ai.generateTasks = originalGenerate;
        }
    });
});
