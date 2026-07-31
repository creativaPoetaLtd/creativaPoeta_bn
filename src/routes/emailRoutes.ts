import express from "express";
import multer from "multer";
import {
  claimEmail,
  cronSyncEmails,
  deleteEmail,
  deleteOutboundEmail,
  forwardEmail,
  getEmail,
  getEmailSummary,
  getEmails,
  getOutboundEmails,
  releaseEmail,
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
router.get("/summary", getEmailSummary);
router.post("/sync", syncEmails);
router.get("/outbound", getOutboundEmails);
router.post("/outbound/draft", saveDraftEmail);
router.put("/outbound/:id/draft", updateDraftEmail);
router.post("/outbound/send", emailAttachmentUpload.array("attachments", 8), sendComposedEmail);
router.post("/outbound/:id/send", sendDraftEmail);
router.delete("/outbound/:id", deleteOutboundEmail);
router.get("/:id", getEmail);
router.post("/:id/claim", claimEmail);
router.post("/:id/release", releaseEmail);
router.post("/:id/reply", replyToEmail);
router.post("/:id/forward", emailAttachmentUpload.array("attachments", 8), forwardEmail);
router.put("/:id/status", updateEmailStatus);
router.delete("/:id", deleteEmail);

export default router;

