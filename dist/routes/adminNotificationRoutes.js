"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const adminNotificationController_1 = require("../controllers/adminNotificationController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const adminNotificationRouter = express_1.default.Router();
adminNotificationRouter.use(authMiddleware_1.authenticateUser, authMiddleware_1.adminUserManagerOnly);
adminNotificationRouter.get("/", adminNotificationController_1.listAdminNotifications);
adminNotificationRouter.get("/summary", adminNotificationController_1.getAdminNotificationSummary);
adminNotificationRouter.patch("/:id/read", adminNotificationController_1.markAdminNotificationRead);
adminNotificationRouter.post("/:id/resolve-password-reset", adminNotificationController_1.resolvePasswordResetNotification);
adminNotificationRouter.patch("/:id/archive", adminNotificationController_1.archiveAdminNotification);
exports.default = adminNotificationRouter;
