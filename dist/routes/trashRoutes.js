"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const trashAccessMiddleware_1 = require("../middleware/trashAccessMiddleware");
const criticalActionRateLimit_1 = require("../middleware/criticalActionRateLimit");
const trashController_1 = require("../controllers/trashController");
const router = express_1.default.Router();
router.use(authMiddleware_1.authenticateUser, trashAccessMiddleware_1.trashManagerOnly);
router.get("/", trashController_1.listTrashItems);
router.get("/audit", trashController_1.listAuditEvents);
router.get("/:entityType/:id/history", trashController_1.getAuditHistory);
router.post("/:entityType/:id/rollback/:eventId", (0, criticalActionRateLimit_1.criticalActionRateLimit)({ action: "trash-rollback", limit: 12, windowMs: 60 * 60000 }), trashController_1.rollbackAuditEvent);
router.post("/:entityType/:id/restore", (0, criticalActionRateLimit_1.criticalActionRateLimit)({ action: "trash-restore", limit: 20, windowMs: 60 * 60000 }), trashController_1.restoreTrashItem);
router.delete("/:entityType/:id", (0, criticalActionRateLimit_1.criticalActionRateLimit)({ action: "trash-purge", limit: 5, windowMs: 60 * 60000 }), trashController_1.permanentlyDeleteTrashItem);
exports.default = router;
