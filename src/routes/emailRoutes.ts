import express from "express";
import {
  deleteEmail,
  getEmail,
  getEmails,
  syncEmails,
  updateEmailStatus,
} from "../controllers/emailController";
import { adminOnly, authenticateUser } from "../middleware/authMiddleware";

const router = express.Router();

router.use(authenticateUser, adminOnly);

router.get("/", getEmails);
router.post("/sync", syncEmails);
router.get("/:id", getEmail);
router.put("/:id/status", updateEmailStatus);
router.delete("/:id", deleteEmail);

export default router;
