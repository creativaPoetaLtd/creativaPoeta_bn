import express from "express";
import multer from "multer";
import {
  cronSyncEmails,
  deleteEmail,
  deleteOutboundEmail,
  getEmail,
  getEmails,
  getOutboundEmails,
  replyToEmail,
  saveDraftEmail,
  sendComposedEmail,
  sendDraftEmail,
  syncEmails,
  updateDraftEmail,
  updateEmailStatus,
} from "../controllers/emailController";
import { adminOnly, authenticateUser } from "../middleware/authMiddleware";

const router = express.Router();
const emailAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 8,
    fileSize: 8 * 1024 * 1024,
  },
});

router.post("/cron-sync", cronSyncEmails);
router.get("/cron-sync", cronSyncEmails);

router.use(authenticateUser, adminOnly);

router.get("/", getEmails);
router.post("/sync", syncEmails);
router.get("/outbound", getOutboundEmails);
router.post("/outbound/draft", saveDraftEmail);
router.put("/outbound/:id/draft", updateDraftEmail);
router.post("/outbound/send", emailAttachmentUpload.array("attachments", 8), sendComposedEmail);
router.post("/outbound/:id/send", sendDraftEmail);
router.delete("/outbound/:id", deleteOutboundEmail);
router.get("/:id", getEmail);
router.post("/:id/reply", replyToEmail);
router.put("/:id/status", updateEmailStatus);
router.delete("/:id", deleteEmail);

export default router;