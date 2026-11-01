const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireBoardAccess, requireRole } = require("../middleware/boardAccess");
const board = require("../controllers/boardController");
const column = require("../controllers/columnController");
const task = require("../controllers/taskController");
const ai = require("../controllers/aiController");

const router = express.Router();

router.use(requireAuth);

router.get("/", board.listBoards);
router.post("/", board.createBoard);

router.get("/:boardId", requireBoardAccess, board.getBoard);
// updateBoard: owner or admin only
router.patch("/:boardId", requireBoardAccess, requireRole("admin"), board.updateBoard);
// deleteBoard: owner only
router.delete("/:boardId", requireBoardAccess, board.deleteBoard);

router.get("/:boardId/activity", requireBoardAccess, board.getActivity);

// addMember / removeMember: owner or admin only (controller enforces finer rules)
router.post("/:boardId/members", requireBoardAccess, requireRole("admin"), board.addMember);
router.delete("/:boardId/members/:userId", requireBoardAccess, requireRole("admin"), board.removeMember);

// createColumn / updateColumn / deleteColumn: owner or admin only
router.post("/:boardId/columns", requireBoardAccess, requireRole("admin"), column.createColumn);
router.patch("/:boardId/columns/:columnId", requireBoardAccess, requireRole("admin"), column.updateColumn);
router.delete("/:boardId/columns/:columnId", requireBoardAccess, requireRole("admin"), column.deleteColumn);

// Tasks: all members may read, create, update, move, delete
router.get("/:boardId/tasks", requireBoardAccess, task.listTasks);
router.post("/:boardId/tasks", requireBoardAccess, task.createTask);
router.patch("/:boardId/tasks/:taskId", requireBoardAccess, task.updateTask);
router.patch("/:boardId/tasks/:taskId/move", requireBoardAccess, task.moveTask);
router.delete("/:boardId/tasks/:taskId", requireBoardAccess, task.deleteTask);

// AI routes
router.post("/:boardId/ai/generate-tasks", requireBoardAccess, ai.generateTasks);
router.post("/:boardId/ai/breakdown", requireBoardAccess, ai.breakdownTask);
router.post("/:boardId/ai/summary", requireBoardAccess, ai.summarizeBoard);

module.exports = router;