import express from "express";
import {
  archiveAdminNotification,
  getAdminNotificationSummary,
  listAdminNotifications,
  markAdminNotificationRead,
  resolvePasswordResetNotification,
} from "../controllers/adminNotificationController";
import { authenticateUser, adminUserManagerOnly } from "../middleware/authMiddleware";

const adminNotificationRouter = express.Router();

adminNotificationRouter.use(authenticateUser, adminUserManagerOnly);
adminNotificationRouter.get("/", listAdminNotifications);
adminNotificationRouter.get("/summary", getAdminNotificationSummary);
adminNotificationRouter.patch("/:id/read", markAdminNotificationRead);
adminNotificationRouter.post("/:id/resolve-password-reset", resolvePasswordResetNotification);
adminNotificationRouter.patch("/:id/archive", archiveAdminNotification);

export default adminNotificationRouter;
