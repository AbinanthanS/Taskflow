const { Server } = require("socket.io");
const { verifyToken } = require("../utils/jwt");
const { query } = require("../config/db");
const { setIo, boardRoom, userRoom } = require("../realtime");
const { isUuid } = require("../middleware/validateUuid");

const userCanAccessBoard = async (userId, boardId) => {
    if (!isUuid(boardId)) return false;
    const { rows } = await query(
        `SELECT 1 FROM boards b
           LEFT JOIN board_members m ON m.board_id = b.id AND m.user_id = $2
          WHERE b.id = $1 AND (b.owner_id = $2 OR m.user_id = $2)`,
        [boardId, userId]
    );
    return rows.length > 0;
};

const initSocket = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:5173",
            methods: ["GET", "POST"],
            credentials: true,
        },
    });

    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error("Authentication required"));
            const decoded = verifyToken(token);
            socket.user = { id: decoded.id, name: decoded.name, email: decoded.email };
            socket.data.user = socket.user;
            next();
        } catch {
            next(new Error("Invalid token"));
        }
    });

    io.on("connection", (socket) => {
        const { user } = socket;

        // Each socket joins a personal room so user-targeted operations work
        socket.join(userRoom(user.id));

        // ── board:join ────────────────────────────────────────────────────────
        socket.on("board:join", async (boardId, ack) => {
            const sendAck = (response) => {
                if (typeof ack === "function") ack(response);
            };

            try {
                if (!boardId || typeof boardId !== "string" || !isUuid(boardId)) {
                    return sendAck({ ok: false, error: "Invalid board id" });
                }

                const canAccess = await userCanAccessBoard(user.id, boardId);
                if (!canAccess) {
                    return sendAck({ ok: false, error: "No access to this board" });
                }

                const room = boardRoom(boardId);
                const wasInRoom = socket.rooms.has(room);

                // Check if other sockets for this user are already in the room
                const socketsInRoom = await io.in(room).fetchSockets();
                const userAlreadyPresent = socketsInRoom.some(
                    (s) => s.data?.user?.id === user.id
                );

                if (!wasInRoom) {
                    socket.join(room);
                }

                // Only emit presence:join if this is user's first socket entering room
                if (!userAlreadyPresent) {
                    socket.to(room).emit("presence:join", {
                        user: { id: user.id, name: user.name },
                        boardId,
                    });
                }

                // Sync current distinct viewers in room
                const allSockets = await io.in(room).fetchSockets();
                const seen = new Set();
                const viewers = [];
                for (const s of allSockets) {
                    const u = s.data?.user;
                    if (!u || seen.has(u.id)) continue;
                    seen.add(u.id);
                    viewers.push({ id: u.id, name: u.name });
                }

                socket.emit("presence:sync", { boardId, users: viewers });
                sendAck({ ok: true });
            } catch (err) {
                console.error("Error in board:join:", err);
                sendAck({ ok: false, error: "Failed to join board" });
            }
        });

        // ── board:leave ───────────────────────────────────────────────────────
        socket.on("board:leave", async (boardId) => {
            try {
                if (!boardId || typeof boardId !== "string" || !isUuid(boardId)) return;
                const room = boardRoom(boardId);
                if (!socket.rooms.has(room)) return;

                socket.leave(room);

                // Per-user presence: only emit presence:leave if no other sockets for this user remain in room
                const remaining = await io.in(room).fetchSockets();
                const stillPresent = remaining.some(
                    (s) => s.data?.user?.id === user.id
                );

                if (!stillPresent) {
                    socket.to(room).emit("presence:leave", {
                        user: { id: user.id, name: user.name },
                        boardId,
                    });
                }
            } catch (err) {
                console.error("Error in board:leave:", err);
            }
        });

        // ── presence:cursor ───────────────────────────────────────────────────
        socket.on("presence:cursor", (payload) => {
            try {
                if (!payload || typeof payload !== "object") return;
                const { boardId, x, y } = payload;
                if (!boardId || typeof boardId !== "string" || !isUuid(boardId)) return;

                const room = boardRoom(boardId);
                // Only forward if the socket is currently in that board's room
                if (!socket.rooms.has(room)) return;

                // Server-side throttle: drop events from same socket within 50ms
                const now = Date.now();
                if (socket.lastCursorTime && now - socket.lastCursorTime < 50) return;
                socket.lastCursorTime = now;

                // Clamp x/y to valid numbers
                const numX = Number(x);
                const numY = Number(y);
                if (!Number.isFinite(numX) || !Number.isFinite(numY)) return;

                socket.to(room).emit("presence:cursor", {
                    user: { id: user.id, name: user.name },
                    x: numX,
                    y: numY,
                });
            } catch (err) {
                console.error("Error in presence:cursor:", err);
            }
        });

        // ── disconnecting ─────────────────────────────────────────────────────
        socket.on("disconnecting", async () => {
            try {
                for (const room of socket.rooms) {
                    if (room === socket.id || room.startsWith("user:")) continue;

                    if (room.startsWith("board:")) {
                        const boardId = room.slice("board:".length);
                        // Check if another socket of this user remains in the room
                        const socketsInRoom = await io.in(room).fetchSockets();
                        const otherSockets = socketsInRoom.filter(
                            (s) => s.id !== socket.id && s.data?.user?.id === user.id
                        );

                        if (otherSockets.length === 0) {
                            socket.to(room).emit("presence:leave", {
                                user: { id: user.id, name: user.name },
                                boardId,
                            });
                        }
                    }
                }
            } catch (err) {
                console.error("Error in disconnecting handler:", err);
            }
        });
    });

    setIo(io);
    return io;
};

module.exports = { initSocket };