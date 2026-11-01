const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { requireAuth } = require("../middleware/auth");
const { requireBoardAccess, requireRole } = require("../middleware/boardAccess");
const { validateUuidParams } = require("../middleware/validateUuid");
const board = require("../controllers/boardController");
const column = require("../controllers/columnController");
const task = require("../controllers/taskController");
const ai = require("../controllers/aiController");

const router = express.Router();

// AI rate limiter: 10 req / 10 min per authenticated user
const aiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => req.user?.id || "anonymous",
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "AI rate limit exceeded, please try again later" },
});

router.use(requireAuth);

router.get("/", board.listBoards);
router.post("/", board.createBoard);

// Board-level routes
const vBoard = validateUuidParams("boardId");
router.get("/:boardId", vBoard, requireBoardAccess, board.getBoard);
router.patch("/:boardId", vBoard, requireBoardAccess, requireRole("admin"), board.updateBoard);
router.delete("/:boardId", vBoard, requireBoardAccess, board.deleteBoard);
router.get("/:boardId/activity", vBoard, requireBoardAccess, board.getActivity);

// Member routes
const vBoardUser = validateUuidParams("boardId", "userId");
router.post("/:boardId/members", vBoard, requireBoardAccess, requireRole("admin"), board.addMember);
router.delete("/:boardId/members/:userId", vBoardUser, requireBoardAccess, requireRole("admin"), board.removeMember);

// Column routes
const vBoardCol = validateUuidParams("boardId", "columnId");
router.post("/:boardId/columns", vBoard, requireBoardAccess, requireRole("admin"), column.createColumn);
router.patch("/:boardId/columns/:columnId", vBoardCol, requireBoardAccess, requireRole("admin"), column.updateColumn);
router.delete("/:boardId/columns/:columnId", vBoardCol, requireBoardAccess, requireRole("admin"), column.deleteColumn);

// Task routes
const vBoardTask = validateUuidParams("boardId", "taskId");
router.get("/:boardId/tasks", vBoard, requireBoardAccess, task.listTasks);
router.post("/:boardId/tasks", vBoard, requireBoardAccess, task.createTask);
router.patch("/:boardId/tasks/:taskId", vBoardTask, requireBoardAccess, task.updateTask);
router.patch("/:boardId/tasks/:taskId/move", vBoardTask, requireBoardAccess, task.moveTask);
router.delete("/:boardId/tasks/:taskId", vBoardTask, requireBoardAccess, task.deleteTask);

// AI routes (rate limited per user, applied after requireAuth which is already above)
router.post("/:boardId/ai/generate-tasks", vBoard, aiLimiter, requireBoardAccess, ai.generateTasks);
router.post("/:boardId/ai/breakdown", vBoard, aiLimiter, requireBoardAccess, ai.breakdownTask);
router.post("/:boardId/ai/summary", vBoard, aiLimiter, requireBoardAccess, ai.summarizeBoard);

module.exports = router;