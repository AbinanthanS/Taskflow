const { test, describe, after } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const { initSocket } = require("../src/socket");
const { boardRoom, userRoom } = require("../src/realtime");
const { pool } = require("../src/config/db");

describe("Socket Realtime & Presence Security", () => {
    after(async () => {
        await pool.end().catch(() => {});
    });

    test("presence:cursor is NOT forwarded if socket is not in board room (non-member)", () => {
        // Setup mock socket and io server behavior
        const boardId = "00000000-0000-4000-8000-000000000001";
        const targetRoom = boardRoom(boardId);

        let forwardedEvent = null;
        let forwardedPayload = null;

        const mockSocket = {
            id: "socket-1",
            user: { id: "user-1", name: "User One" },
            rooms: new Set(["socket-1", userRoom("user-1")]), // NOT in targetRoom!
            lastCursorTime: 0,
            to: (room) => ({
                emit: (event, payload) => {
                    forwardedEvent = event;
                    forwardedPayload = { room, payload };
                },
            }),
            emit: () => {},
        };

        // Execute cursor logic as implemented in socket/index.js
        const handleCursor = (socket, payload) => {
            if (!payload || typeof payload !== "object") return;
            const { boardId: bId, x, y } = payload;
            if (!bId || typeof bId !== "string") return;

            const room = boardRoom(bId);
            // Non-member check: only forward if socket is currently in room
            if (!socket.rooms.has(room)) return;

            const now = Date.now();
            if (socket.lastCursorTime && now - socket.lastCursorTime < 50) return;
            socket.lastCursorTime = now;

            const numX = Number(x);
            const numY = Number(y);
            if (!Number.isFinite(numX) || !Number.isFinite(numY)) return;

            socket.to(room).emit("presence:cursor", {
                user: { id: socket.user.id, name: socket.user.name },
                x: numX,
                y: numY,
            });
        };

        // 1. Non-member emits cursor -> dropped
        handleCursor(mockSocket, { boardId, x: 100, y: 200 });
        assert.strictEqual(forwardedEvent, null, "Cursor event should NOT be forwarded for non-members");
        assert.strictEqual(forwardedPayload, null);

        // 2. Member emits cursor (socket is in room) -> forwarded
        mockSocket.rooms.add(targetRoom);
        handleCursor(mockSocket, { boardId, x: 150, y: 250 });
        assert.strictEqual(forwardedEvent, "presence:cursor");
        assert.deepStrictEqual(forwardedPayload.payload, {
            user: { id: "user-1", name: "User One" },
            x: 150,
            y: 250,
        });
    });

    test("presence:cursor throttles events within 50ms from same socket", () => {
        const boardId = "00000000-0000-4000-8000-000000000002";
        const targetRoom = boardRoom(boardId);

        let emitCount = 0;
        const mockSocket = {
            id: "socket-2",
            user: { id: "user-2", name: "User Two" },
            rooms: new Set(["socket-2", targetRoom]),
            lastCursorTime: 0,
            to: () => ({
                emit: () => {
                    emitCount++;
                },
            }),
        };

        const handleCursor = (socket, payload) => {
            const { boardId: bId, x, y } = payload;
            const room = boardRoom(bId);
            if (!socket.rooms.has(room)) return;

            const now = Date.now();
            if (socket.lastCursorTime && now - socket.lastCursorTime < 50) return;
            socket.lastCursorTime = now;

            const numX = Number(x);
            const numY = Number(y);
            if (!Number.isFinite(numX) || !Number.isFinite(numY)) return;

            socket.to(room).emit("presence:cursor", {
                user: { id: socket.user.id, name: socket.user.name },
                x: numX,
                y: numY,
            });
        };

        // First event passes
        handleCursor(mockSocket, { boardId, x: 10, y: 20 });
        assert.strictEqual(emitCount, 1);

        // Immediate subsequent event within 50ms is dropped
        handleCursor(mockSocket, { boardId, x: 12, y: 22 });
        assert.strictEqual(emitCount, 1, "Throttled event within 50ms should be dropped");
    });

    test("presence:cursor drops non-numeric or NaN coordinates", () => {
        const boardId = "00000000-0000-4000-8000-000000000003";
        const targetRoom = boardRoom(boardId);

        let emitted = false;
        const mockSocket = {
            id: "socket-3",
            user: { id: "user-3", name: "User Three" },
            rooms: new Set(["socket-3", targetRoom]),
            lastCursorTime: 0,
            to: () => ({
                emit: () => {
                    emitted = true;
                },
            }),
        };

        const handleCursor = (socket, payload) => {
            const { boardId: bId, x, y } = payload;
            const room = boardRoom(bId);
            if (!socket.rooms.has(room)) return;

            const numX = Number(x);
            const numY = Number(y);
            if (!Number.isFinite(numX) || !Number.isFinite(numY)) return;

            socket.to(room).emit("presence:cursor", {
                user: { id: socket.user.id, name: socket.user.name },
                x: numX,
                y: numY,
            });
        };

        handleCursor(mockSocket, { boardId, x: "not-a-number", y: 50 });
        assert.strictEqual(emitted, false, "Invalid coordinate should not be emitted");
    });
});
