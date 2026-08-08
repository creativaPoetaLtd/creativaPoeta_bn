import express from "express";
import {
  collectAnalyticsEvents,
  getAnalyticsCollectionHealth,
} from "../controllers/analyticsController";
import { authenticateUser } from "../middleware/authMiddleware";
import { authorizeAdminPermission } from "../middleware/permissionMiddleware";

const router = express.Router();
const canReadAnalytics = authorizeAdminPermission("analytics:read", [
  "admin_1",
  "admin_2",
  "admin_4",
]);

router.post("/collect", collectAnalyticsEvents);
router.get("/health", authenticateUser, canReadAnalytics, getAnalyticsCollectionHealth);

export default router;
