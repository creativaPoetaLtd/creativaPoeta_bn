import express from "express";
import {
  deleteEmail,
  getEmail,
  getEmails,
  replyToEmail,
  syncEmails,
  updateEmailStatus,
} from "../controllers/emailController";
import { adminOnly, authenticateUser } from "../middleware/authMiddleware";

const router = express.Router();

router.use(authenticateUser, adminOnly);

router.get("/", getEmails);
router.post("/sync", syncEmails);
router.get("/:id", getEmail);
router.post("/:id/reply", replyToEmail);
router.put("/:id/status", updateEmailStatus);
router.delete("/:id", deleteEmail);

export default router;
