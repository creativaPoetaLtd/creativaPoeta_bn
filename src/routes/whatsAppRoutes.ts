import express from "express";
import {
  addWhatsAppConversationNote,
  claimWhatsAppConversation,
  getWhatsAppConversation,
  getWhatsAppConversations,
  getWhatsAppSummary,
  receiveWhatsAppWebhook,
  releaseWhatsAppConversation,
  replyToWhatsAppConversation,
  updateWhatsAppConversationStatus,
  verifyWhatsAppWebhook,
} from "../controllers/whatsAppController";
import { authenticateUser } from "../middleware/authMiddleware";
import { authorizeAdminPermission } from "../middleware/permissionMiddleware";

const router = express.Router();
const canRead = authorizeAdminPermission("whatsapp:read", ["admin_0", "admin_1", "admin_3"]);
const canReply = authorizeAdminPermission("whatsapp:reply", ["admin_0", "admin_1", "admin_3"]);

router.get("/webhook", verifyWhatsAppWebhook);
router.post("/webhook", receiveWhatsAppWebhook);

router.get("/summary", authenticateUser, canRead, getWhatsAppSummary);
router.get("/conversations", authenticateUser, canRead, getWhatsAppConversations);
router.get("/conversations/:id", authenticateUser, canRead, getWhatsAppConversation);
router.post("/conversations/:id/claim", authenticateUser, canReply, claimWhatsAppConversation);
router.post("/conversations/:id/release", authenticateUser, canReply, releaseWhatsAppConversation);
router.patch("/conversations/:id/status", authenticateUser, canReply, updateWhatsAppConversationStatus);
router.post("/conversations/:id/notes", authenticateUser, canReply, addWhatsAppConversationNote);
router.post("/conversations/:id/reply", authenticateUser, canReply, replyToWhatsAppConversation);

export default router;
