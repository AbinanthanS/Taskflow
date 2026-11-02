const { test, describe, after } = require("node:test");
const assert = require("node:assert");
const { app, request, makeTestToken, pool } = require("./helpers");

describe("UUID Validation & Error Handling", () => {
    const token = makeTestToken();

    after(async () => {
        await pool.end().catch(() => {});
    });

    test("GET /api/boards/:boardId rejects malformed boardId with 400 (not 500)", async () => {
        const res = await request(app)
            .get("/api/boards/not-a-valid-uuid")
            .set("Authorization", `Bearer ${token}`);

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
        assert.notStrictEqual(res.status, 500);
    });

    test("PATCH /api/boards/:boardId rejects malformed boardId with 400", async () => {
        const res = await request(app)
            .patch("/api/boards/12345")
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "Updated" });

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
    });

    test("DELETE /api/boards/:boardId rejects malformed boardId with 400", async () => {
        const res = await request(app)
            .delete("/api/boards/12345")
            .set("Authorization", `Bearer ${token}`);

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
    });

    test("GET /api/boards/:boardId/tasks rejects malformed boardId with 400", async () => {
        const res = await request(app)
            .get("/api/boards/xyz-bad-id/tasks")
            .set("Authorization", `Bearer ${token}`);

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
    });

    test("POST /api/boards/:boardId/tasks rejects malformed boardId with 400", async () => {
        const res = await request(app)
            .post("/api/boards/xyz-bad-id/tasks")
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "Task 1" });

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
    });

    test("PATCH /api/boards/:boardId/tasks/:taskId rejects malformed taskId with 400", async () => {
        const res = await request(app)
            .patch("/api/boards/11111111-1111-4111-8111-111111111111/tasks/bad-task-uuid")
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "New title" });

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
    });

    test("DELETE /api/boards/:boardId/columns/:columnId rejects malformed columnId with 400", async () => {
        const res = await request(app)
            .delete("/api/boards/11111111-1111-4111-8111-111111111111/columns/invalid-col-id")
            .set("Authorization", `Bearer ${token}`);

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
    });

    test("DELETE /api/boards/:boardId/members/:userId rejects malformed userId with 400", async () => {
        const res = await request(app)
            .delete("/api/boards/11111111-1111-4111-8111-111111111111/members/invalid-user-id")
            .set("Authorization", `Bearer ${token}`);

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
    });

    test("POST /api/boards/:boardId/ai/generate-tasks rejects malformed boardId with 400", async () => {
        const res = await request(app)
            .post("/api/boards/bad-uuid/ai/generate-tasks")
            .set("Authorization", `Bearer ${token}`)
            .send({ goal: "Build landing page" });

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
    });

    test("POST /api/boards/:boardId/ai/breakdown rejects malformed boardId with 400", async () => {
        const res = await request(app)
            .post("/api/boards/bad-uuid/ai/breakdown")
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "Task 1" });

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error);
    });
});
