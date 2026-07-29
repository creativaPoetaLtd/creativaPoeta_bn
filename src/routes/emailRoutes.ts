import express from "express";
import {
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

router.use(authenticateUser, adminOnly);

router.get("/", getEmails);
router.post("/sync", syncEmails);
router.get("/outbound", getOutboundEmails);
router.post("/outbound/draft", saveDraftEmail);
router.put("/outbound/:id/draft", updateDraftEmail);
router.post("/outbound/send", sendComposedEmail);
router.post("/outbound/:id/send", sendDraftEmail);
router.delete("/outbound/:id", deleteOutboundEmail);
router.get("/:id", getEmail);
router.post("/:id/reply", replyToEmail);
router.put("/:id/status", updateEmailStatus);
router.delete("/:id", deleteEmail);

export default router;
