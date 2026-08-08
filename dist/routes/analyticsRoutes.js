"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const analyticsController_1 = require("../controllers/analyticsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const permissionMiddleware_1 = require("../middleware/permissionMiddleware");
const router = express_1.default.Router();
const canReadAnalytics = (0, permissionMiddleware_1.authorizeAdminPermission)("analytics:read", [
    "admin_1",
    "admin_2",
    "admin_4",
]);
router.post("/collect", analyticsController_1.collectAnalyticsEvents);
router.get("/health", authMiddleware_1.authenticateUser, canReadAnalytics, analyticsController_1.getAnalyticsCollectionHealth);
exports.default = router;
