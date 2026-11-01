const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireBoardAccess, requireRole } = require("../middleware/boardAccess");
const { validateUuidParams } = require("../middleware/validateUuid");
const board = require("../controllers/boardController");
const column = require("../controllers/columnController");
const task = require("../controllers/taskController");
const ai = require("../controllers/aiController");

const router = express.Router();

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

// AI routes
router.post("/:boardId/ai/generate-tasks", vBoard, requireBoardAccess, ai.generateTasks);
router.post("/:boardId/ai/breakdown", vBoard, requireBoardAccess, ai.breakdownTask);
router.post("/:boardId/ai/summary", vBoard, requireBoardAccess, ai.summarizeBoard);

module.exports = router;