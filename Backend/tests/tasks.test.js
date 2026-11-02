const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { app, request, hasTestDb, resetDb, initTestDb, pool, makeTestToken } = require("./helpers");
const {
    rebalanceColumn,
    REBALANCE_GAP_THRESHOLD,
    moveTask,
} = require("../src/controllers/taskController");

describe("Tasks Management, Permissions & Ordering", () => {
    before(async () => {
        if (hasTestDb) {
            await initTestDb();
            await resetDb();
        }
    });

    after(async () => {
        await pool.end().catch(() => {});
    });

    // ── Unit Tests: Validation and Rebalancing logic ─────────────────────────
    describe("Task validation and rebalance unit tests", () => {
        test("REBALANCE_GAP_THRESHOLD is set to 0.001", () => {
            assert.strictEqual(REBALANCE_GAP_THRESHOLD, 0.001);
        });

        test("moveTask rejects non-numeric or non-finite position", async () => {
            const req = {
                body: { column_id: "00000000-0000-4000-8000-000000000001", position: "not-a-number" },
                params: { taskId: "00000000-0000-4000-8000-000000000002" },
                board: { id: "00000000-0000-4000-8000-000000000003" },
            };
            let caught = null;
            await moveTask(req, {}, (err) => {
                caught = err;
            });
            assert.ok(caught);
            assert.strictEqual(caught.statusCode, 400);
            assert.match(caught.message, /position must be a finite number/i);
        });

        test("rebalanceColumn re-spaces tasks into 1000, 2000, 3000 increments", async () => {
            const mockTasks = [
                { id: "task-1", position: 1000.0001 },
                { id: "task-2", position: 1000.0002 },
                { id: "task-3", position: 1000.0003 },
            ];

            const executedQueries = [];
            const mockClient = {
                query: async (sql, params) => {
                    executedQueries.push({ sql, params });
                    if (sql.includes("SELECT id FROM tasks")) {
                        return { rows: mockTasks.map((t) => ({ id: t.id })) };
                    }
                    return { rows: [] };
                },
            };

            const result = await rebalanceColumn(
                mockClient,
                "col-uuid-1",
                "board-uuid-1"
            );

            assert.strictEqual(result.length, 3);
            assert.strictEqual(result[0].position, 1000);
            assert.strictEqual(result[1].position, 2000);
            assert.strictEqual(result[2].position, 3000);

            // Verify UPDATE queries were executed for each task
            const updates = executedQueries.filter((q) =>
                q.sql.includes("UPDATE tasks SET position = $1 WHERE id = $2")
            );
            assert.strictEqual(updates.length, 3);
            assert.deepStrictEqual(updates[0].params, [1000, "task-1"]);
            assert.deepStrictEqual(updates[1].params, [2000, "task-2"]);
            assert.deepStrictEqual(updates[2].params, [3000, "task-3"]);
        });
    });

    // ── DB-backed Tests (runs when DATABASE_URL_TEST is set) ─────────────────
    test("Assignee validation and dynamic PATCH semantics", async (t) => {
        if (!hasTestDb) {
            t.skip("Skipping DB tests: DATABASE_URL_TEST is not configured");
            return;
        }

        // 1. Setup users
        const reg = async (name, email) => {
            const res = await request(app)
                .post("/api/auth/register")
                .send({ name, email, password: "Password123!" });
            return res.body;
        };

        const owner = await reg("Task Owner", `towner_${Date.now()}@example.com`);
        const member = await reg("Board Member", `tmember_${Date.now()}@example.com`);
        const outsider = await reg("Outsider", `tout_${Date.now()}@example.com`);

        // 2. Create board, column, and add member
        const boardRes = await request(app)
            .post("/api/boards")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ title: "Task Test Board" });
        const boardId = boardRes.body.board.id;

        await request(app)
            .post(`/api/boards/${boardId}/members`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ email: member.user.email, role: "member" });

        const colRes = await request(app)
            .post(`/api/boards/${boardId}/columns`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ title: "In Progress" });
        const columnId = colRes.body.column.id;

        // 3. Attempt to assign task to non-member (outsider) -> 400
        const badAssigneeRes = await request(app)
            .post(`/api/boards/${boardId}/tasks`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({
                column_id: columnId,
                title: "Bad Assignee Task",
                assignee_id: outsider.user.id,
            });
        assert.strictEqual(badAssigneeRes.status, 400);
        assert.match(badAssigneeRes.body.error, /assignee must be a board member/i);

        // 4. Create task assigned to member with description and due_date
        const createRes = await request(app)
            .post(`/api/boards/${boardId}/tasks`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({
                column_id: columnId,
                title: "Original Task",
                description: "Original Description",
                due_date: new Date().toISOString(),
                assignee_id: member.user.id,
            });
        assert.strictEqual(createRes.status, 201);
        const taskId = createRes.body.task.id;
        assert.strictEqual(createRes.body.task.assignee_id, member.user.id);

        // 5. PATCH task: omit assignee_id -> existing assignee_id is kept!
        const patchOmit = await request(app)
            .patch(`/api/boards/${boardId}/tasks/${taskId}`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ title: "Updated Title Only" });
        assert.strictEqual(patchOmit.status, 200);
        assert.strictEqual(patchOmit.body.task.title, "Updated Title Only");
        assert.strictEqual(patchOmit.body.task.assignee_id, member.user.id);

        // 6. PATCH task: explicit null clears assignee_id
        const patchClearAssignee = await request(app)
            .patch(`/api/boards/${boardId}/tasks/${taskId}`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ assignee_id: null });
        assert.strictEqual(patchClearAssignee.status, 200);
        assert.strictEqual(patchClearAssignee.body.task.assignee_id, null);

        // 7. PATCH task: explicit null clears description and due_date
        const patchClearDesc = await request(app)
            .patch(`/api/boards/${boardId}/tasks/${taskId}`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ description: null, due_date: null });
        assert.strictEqual(patchClearDesc.status, 200);
        assert.strictEqual(patchClearDesc.body.task.description, null);
        assert.strictEqual(patchClearDesc.body.task.due_date, null);
    });
});
