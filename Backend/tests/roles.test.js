const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { app, request, hasTestDb, resetDb, initTestDb, pool, makeTestToken } = require("./helpers");
const { requireRole } = require("../src/middleware/boardAccess");

describe("Role Matrix & Permission Enforcement", () => {
    before(async () => {
        if (hasTestDb) {
            await initTestDb();
            await resetDb();
        }
    });

    after(async () => {
        await pool.end().catch(() => {});
    });

    // ── Middleware Unit Tests (runs independently of DB) ──────────────────────
    describe("requireRole middleware unit checks", () => {
        test("requireRole('admin') blocks 'member' with 403 Forbidden", () => {
            const middleware = requireRole("admin");
            const req = { board: { role: "member" } };
            assert.throws(
                () => middleware(req, {}, () => {}),
                (err) => err.statusCode === 403 && err.message.includes("admin")
            );
        });

        test("requireRole('admin') allows 'admin' and 'owner'", () => {
            const middleware = requireRole("admin");
            let calledAdmin = false;
            middleware({ board: { role: "admin" } }, {}, (err) => {
                assert.ifError(err);
                calledAdmin = true;
            });
            assert.strictEqual(calledAdmin, true);

            let calledOwner = false;
            middleware({ board: { role: "owner" } }, {}, (err) => {
                assert.ifError(err);
                calledOwner = true;
            });
            assert.strictEqual(calledOwner, true);
        });

        test("requireRole('owner') blocks 'admin' and 'member' with 403 Forbidden", () => {
            const middleware = requireRole("owner");
            assert.throws(
                () => middleware({ board: { role: "admin" } }, {}, () => {}),
                (err) => err.statusCode === 403 && err.message.includes("owner")
            );
            assert.throws(
                () => middleware({ board: { role: "member" } }, {}, () => {}),
                (err) => err.statusCode === 403 && err.message.includes("owner")
            );
        });
    });

    // ── DB-backed Role Tests (runs when DATABASE_URL_TEST is set) ─────────────
    test("Role matrix: member cannot delete columns or update board, admin cannot alter owner", async (t) => {
        if (!hasTestDb) {
            t.skip("Skipping DB tests: DATABASE_URL_TEST is not configured");
            return;
        }

        // 1. Create owner, admin, and member users
        const registerUser = async (name, email) => {
            const res = await request(app)
                .post("/api/auth/register")
                .send({ name, email, password: "Password123!" });
            return res.body;
        };

        const owner = await registerUser("Owner User", `owner_${Date.now()}@example.com`);
        const admin = await registerUser("Admin User", `admin_${Date.now()}@example.com`);
        const member = await registerUser("Member User", `member_${Date.now()}@example.com`);

        // 2. Owner creates a board
        const boardRes = await request(app)
            .post("/api/boards")
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ title: "Roles Test Board" });
        const boardId = boardRes.body.board.id;

        // 3. Owner adds admin and member
        await request(app)
            .post(`/api/boards/${boardId}/members`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ email: admin.user.email, role: "admin" });

        await request(app)
            .post(`/api/boards/${boardId}/members`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ email: member.user.email, role: "member" });

        // 4. Owner creates a column
        const colRes = await request(app)
            .post(`/api/boards/${boardId}/columns`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ title: "Backlog" });
        const columnId = colRes.body.column.id;

        // 5. Member CANNOT update board (403)
        const memberUpdate = await request(app)
            .patch(`/api/boards/${boardId}`)
            .set("Authorization", `Bearer ${member.token}`)
            .send({ title: "Member Trying To Update" });
        assert.strictEqual(memberUpdate.status, 403);

        // 6. Member CANNOT delete columns (403)
        const memberDelCol = await request(app)
            .delete(`/api/boards/${boardId}/columns/${columnId}`)
            .set("Authorization", `Bearer ${member.token}`);
        assert.strictEqual(memberDelCol.status, 403);

        // 7. Admin CANNOT remove or demote the owner
        const adminRemoveOwner = await request(app)
            .delete(`/api/boards/${boardId}/members/${owner.user.id}`)
            .set("Authorization", `Bearer ${admin.token}`);
        assert.strictEqual(adminRemoveOwner.status, 400);
        assert.match(adminRemoveOwner.body.error, /owner/i);

        // 8. Owner CAN update board
        const ownerUpdate = await request(app)
            .patch(`/api/boards/${boardId}`)
            .set("Authorization", `Bearer ${owner.token}`)
            .send({ title: "Owner Updated Title" });
        assert.strictEqual(ownerUpdate.status, 200);
        assert.strictEqual(ownerUpdate.body.board.title, "Owner Updated Title");
    });
});
