import express from "express";
import {
  createInternalConversation,
  getInternalMessageSummary,
  listInternalConversations,
  markInternalConversationRead,
  sendInternalMessage,
} from "../controllers/internalMessageController";
import { authenticateUser, adminOnly } from "../middleware/authMiddleware";

const router = express.Router();

router.use(authenticateUser, adminOnly);

router.get("/", listInternalConversations);
router.get("/summary", getInternalMessageSummary);
router.post("/", createInternalConversation);
router.post("/:id/messages", sendInternalMessage);
router.patch("/:id/read", markInternalConversationRead);

export default router;
