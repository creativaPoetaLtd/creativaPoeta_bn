import express from "express";
import {
  collectAnalyticsEvents,
  getAnalyticsCollectionHealth,
} from "../controllers/analyticsController";
import { authenticateUser } from "../middleware/authMiddleware";
import { authorizeAdminPermission } from "../middleware/permissionMiddleware";
import {
  getAnalyticsOverview,
  getAnalyticsRealtime,
} from "../controllers/analyticsReportController";
import {
  evaluateAnalyticsIncidentsController,
  getAnalyticsIncidentSummaryController,
  listAnalyticsIncidents,
  updateAnalyticsIncidentStatus,
} from "../controllers/analyticsIncidentController";

const router = express.Router();
const canReadAnalytics = authorizeAdminPermission("analytics:read", [
  "admin_1",
  "admin_2",
  "admin_4",
]);

router.post("/collect", collectAnalyticsEvents);
router.get("/health", authenticateUser, canReadAnalytics, getAnalyticsCollectionHealth);
router.get("/overview", authenticateUser, canReadAnalytics, getAnalyticsOverview);
router.get("/realtime", authenticateUser, canReadAnalytics, getAnalyticsRealtime);
router.get("/incidents", authenticateUser, canReadAnalytics, listAnalyticsIncidents);
router.get("/incidents/summary", authenticateUser, canReadAnalytics, getAnalyticsIncidentSummaryController);
router.post("/incidents/evaluate", authenticateUser, canReadAnalytics, evaluateAnalyticsIncidentsController);
router.patch("/incidents/:id/status", authenticateUser, canReadAnalytics, updateAnalyticsIncidentStatus);

export default router;
