import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { boardApi, taskApi, columnApi } from "../lib/api";
import { connectSocket } from "../lib/socket";

/**
 * Loads a board and keeps it in sync via Socket.IO. Returns board state plus
 * mutation helpers that update optimistically and persist to the API.
 */
export const useBoard = (boardId) => {
  const navigate = useNavigate();

  const [board, setBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [presence, setPresence] = useState([]);

  // Refs holding latest state for optimistic updates and rollbacks without capturing in closures
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const membersRef = useRef(members);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const upsertTask = useCallback((task) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id);
      if (idx === -1) return [...prev, task];
      const next = [...prev];
      next[idx] = task;
      return next;
    });
  }, []);

  const removeTaskLocal = useCallback((id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fetch full board snapshot
  const fetchBoard = useCallback(
    async (isInitial = false) => {
      if (isInitial) setLoading(true);
      try {
        const data = await boardApi.get(boardId);
        setBoard(data.board);
        setColumns(data.columns);
        setTasks(data.tasks);
        setMembers(data.members);
        setRole(data.role);
        setError(null);
      } catch (err) {
        if (isInitial) setError(err.message);
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [boardId]
  );

  // Initial load
  useEffect(() => {
    fetchBoard(true);
  }, [fetchBoard]);

  // Real-time sync
  useEffect(() => {
    const socket = connectSocket();

    const joinBoard = () => {
      socket.emit("board:join", boardId, (ack) => {
        if (ack && !ack.ok) {
          toast.error(ack.error || "Failed to join board");
        }
      });
    };

    // If socket is already connected, emit join immediately
    if (socket.connected) {
      joinBoard();
    }

    // On every socket connect / reconnect: re-emit board:join and refetch snapshot
    const onConnect = () => {
      joinBoard();
      fetchBoard(false);
    };

    const onCreated = (t) => upsertTask(t);
    const onUpdated = (t) => upsertTask(t);
    const onMoved = (t) => upsertTask(t);
    const onDeleted = ({ id }) => removeTaskLocal(id);

    const onColCreated = (c) =>
      setColumns((p) => [...p, c].sort((a, b) => a.position - b.position));
    const onColUpdated = (c) =>
      setColumns((p) =>
        p.map((x) => (x.id === c.id ? c : x)).sort((a, b) => a.position - b.position)
      );
    const onColDeleted = ({ id }) => {
      setColumns((p) => p.filter((x) => x.id !== id));
      setTasks((p) => p.filter((t) => t.column_id !== id));
    };
    const onColRebalanced = ({ tasks: rebalancedTasks }) => {
      if (!rebalancedTasks) return;
      const posMap = new Map(rebalancedTasks.map((t) => [t.id, t.position]));
      setTasks((p) =>
        p.map((t) => (posMap.has(t.id) ? { ...t, position: posMap.get(t.id) } : t))
      );
    };

    const onBoardUpdated = (b) => setBoard(b);

    const onMemberAdded = (member) => {
      setMembers((p) => {
        const filtered = p.filter((m) => m.id !== member.id);
        return [...filtered, member];
      });
    };

    const onMemberRemoved = ({ userId }) => {
      setMembers((p) => p.filter((m) => m.id !== userId));
      // Clear assignee locally if tasks were assigned to removed member
      setTasks((p) =>
        p.map((t) =>
          t.assignee_id === userId
            ? { ...t, assignee_id: null, assignee_name: null, assignee_avatar: null }
            : t
        )
      );
    };

    const onAccessRevoked = ({ boardId: revokedId }) => {
      if (revokedId === boardId) {
        toast.error("Your access to this board has been revoked");
        navigate("/dashboard");
      }
    };

    const onPresenceSync = ({ users }) => setPresence(users || []);
    const onPresenceJoin = ({ user }) =>
      setPresence((p) => (p.find((u) => u.id === user.id) ? p : [...p, user]));
    const onPresenceLeave = ({ user }) =>
      setPresence((p) => p.filter((u) => u.id !== user.id));

    socket.on("connect", onConnect);
    socket.on("task:created", onCreated);
    socket.on("task:updated", onUpdated);
    socket.on("task:moved", onMoved);
    socket.on("task:deleted", onDeleted);
    socket.on("column:created", onColCreated);
    socket.on("column:updated", onColUpdated);
    socket.on("column:deleted", onColDeleted);
    socket.on("column:rebalanced", onColRebalanced);
    socket.on("board:updated", onBoardUpdated);
    socket.on("member:added", onMemberAdded);
    socket.on("member:removed", onMemberRemoved);
    socket.on("board:access-revoked", onAccessRevoked);
    socket.on("presence:sync", onPresenceSync);
    socket.on("presence:join", onPresenceJoin);
    socket.on("presence:leave", onPresenceLeave);

    return () => {
      socket.emit("board:leave", boardId);
      socket.off("connect", onConnect);
      socket.off("task:created", onCreated);
      socket.off("task:updated", onUpdated);
      socket.off("task:moved", onMoved);
      socket.off("task:deleted", onDeleted);
      socket.off("column:created", onColCreated);
      socket.off("column:updated", onColUpdated);
      socket.off("column:deleted", onColDeleted);
      socket.off("column:rebalanced", onColRebalanced);
      socket.off("board:updated", onBoardUpdated);
      socket.off("member:added", onMemberAdded);
      socket.off("member:removed", onMemberRemoved);
      socket.off("board:access-revoked", onAccessRevoked);
      socket.off("presence:sync", onPresenceSync);
      socket.off("presence:join", onPresenceJoin);
      socket.off("presence:leave", onPresenceLeave);
      setPresence([]);
    };
  }, [boardId, fetchBoard, navigate, removeTaskLocal, upsertTask]);

  /* ----------------------------- mutations ----------------------------- */

  const createTask = useCallback(
    async (data) => {
      try {
        const task = await taskApi.create(boardId, data);
        upsertTask(task);
        return task;
      } catch (err) {
        toast.error(err.message);
        throw err;
      }
    },
    [boardId, upsertTask]
  );

  const updateTask = useCallback(
    async (taskId, data) => {
      const prev = tasksRef.current.find((t) => t.id === taskId);
      const assignee =
        data.assignee_id !== undefined
          ? membersRef.current.find((m) => m.id === data.assignee_id)
          : null;

      // Optimistic update via functional setState (does not capture tasks)
      setTasks((current) =>
        current.map((t) =>
          t.id === taskId
            ? {
                ...t,
                ...data,
                ...(data.assignee_id !== undefined
                  ? {
                      assignee_name: assignee?.name ?? null,
                      assignee_avatar: assignee?.avatar_url ?? null,
                    }
                  : {}),
              }
            : t
        )
      );

      try {
        const task = await taskApi.update(boardId, taskId, data);
        setTasks((current) =>
          current.map((t) => (t.id === taskId ? task : t))
        );
        return task;
      } catch (err) {
        // Rollback only the affected task
        if (prev) {
          setTasks((current) =>
            current.map((t) => (t.id === taskId ? prev : t))
          );
        }
        toast.error(err.message);
        throw err;
      }
    },
    [boardId]
  );

  const deleteTask = useCallback(
    async (taskId) => {
      const prev = tasksRef.current.find((t) => t.id === taskId);
      // Optimistic delete: remove only this task
      setTasks((current) => current.filter((t) => t.id !== taskId));

      try {
        await taskApi.remove(boardId, taskId);
        toast.success("Task deleted");
      } catch (err) {
        // Rollback only the affected task
        if (prev) {
          setTasks((current) => {
            if (current.some((t) => t.id === taskId)) return current;
            return [...current, prev];
          });
        }
        toast.error(err.message);
      }
    },
    [boardId]
  );

  // Apply a local move immediately, then persist.
  const moveTask = useCallback(
    async (taskId, columnId, position) => {
      const prev = tasksRef.current.find((t) => t.id === taskId);
      if (!prev) return;

      // Optimistic move: update only this task
      setTasks((current) =>
        current.map((t) =>
          t.id === taskId ? { ...t, column_id: columnId, position } : t
        )
      );

      try {
        await taskApi.move(boardId, taskId, { column_id: columnId, position });
      } catch (err) {
        // Rollback only the affected task
        setTasks((current) =>
          current.map((t) => (t.id === taskId ? prev : t))
        );
        toast.error(err.message);
      }
    },
    [boardId]
  );

  const addColumn = useCallback(
    async (title) => {
      try {
        const col = await columnApi.create(boardId, { title });
        setColumns((p) => [...p, col].sort((a, b) => a.position - b.position));
      } catch (err) {
        toast.error(err.message);
      }
    },
    [boardId]
  );

  const renameColumn = useCallback(
    async (columnId, title) => {
      setColumns((p) => p.map((c) => (c.id === columnId ? { ...c, title } : c)));
      try {
        await columnApi.update(boardId, columnId, { title });
      } catch (err) {
        toast.error(err.message);
      }
    },
    [boardId]
  );

  const deleteColumn = useCallback(
    async (columnId) => {
      try {
        await columnApi.remove(boardId, columnId);
        setColumns((p) => p.filter((c) => c.id !== columnId));
        setTasks((p) => p.filter((t) => t.column_id !== columnId));
      } catch (err) {
        toast.error(err.message);
      }
    },
    [boardId]
  );

  return {
    board,
    columns,
    tasks,
    members,
    role,
    loading,
    error,
    presence,
    setBoard,
    setMembers,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    upsertTask,
    addColumn,
    renameColumn,
    deleteColumn,
  };
};
