"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const analyticsController_1 = require("../controllers/analyticsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const permissionMiddleware_1 = require("../middleware/permissionMiddleware");
const analyticsReportController_1 = require("../controllers/analyticsReportController");
const analyticsIncidentController_1 = require("../controllers/analyticsIncidentController");
const router = express_1.default.Router();
const canReadAnalytics = (0, permissionMiddleware_1.authorizeAdminPermission)("analytics:read", [
    "admin_1",
    "admin_2",
    "admin_4",
]);
router.post("/collect", analyticsController_1.collectAnalyticsEvents);
router.get("/health", authMiddleware_1.authenticateUser, canReadAnalytics, analyticsController_1.getAnalyticsCollectionHealth);
router.get("/overview", authMiddleware_1.authenticateUser, canReadAnalytics, analyticsReportController_1.getAnalyticsOverview);
router.get("/realtime", authMiddleware_1.authenticateUser, canReadAnalytics, analyticsReportController_1.getAnalyticsRealtime);
router.get("/incidents", authMiddleware_1.authenticateUser, canReadAnalytics, analyticsIncidentController_1.listAnalyticsIncidents);
router.get("/incidents/summary", authMiddleware_1.authenticateUser, canReadAnalytics, analyticsIncidentController_1.getAnalyticsIncidentSummaryController);
router.post("/incidents/evaluate", authMiddleware_1.authenticateUser, canReadAnalytics, analyticsIncidentController_1.evaluateAnalyticsIncidentsController);
router.patch("/incidents/:id/status", authMiddleware_1.authenticateUser, canReadAnalytics, analyticsIncidentController_1.updateAnalyticsIncidentStatus);
exports.default = router;
