import express from "express";
import { authenticateUser } from "../middleware/authMiddleware";
import { trashManagerOnly } from "../middleware/trashAccessMiddleware";
import { criticalActionRateLimit } from "../middleware/criticalActionRateLimit";
import {
  getAuditHistory,
  listAuditEvents,
  listTrashItems,
  permanentlyDeleteTrashItem,
  restoreTrashItem,
  rollbackAuditEvent,
} from "../controllers/trashController";

const router = express.Router();

router.use(authenticateUser, trashManagerOnly);
router.get("/", listTrashItems);
router.get("/audit", listAuditEvents);
router.get("/:entityType/:id/history", getAuditHistory);
router.post("/:entityType/:id/rollback/:eventId", criticalActionRateLimit({ action: "trash-rollback", limit: 12, windowMs: 60 * 60_000 }), rollbackAuditEvent);
router.post("/:entityType/:id/restore", criticalActionRateLimit({ action: "trash-restore", limit: 20, windowMs: 60 * 60_000 }), restoreTrashItem);
router.delete("/:entityType/:id", criticalActionRateLimit({ action: "trash-purge", limit: 5, windowMs: 60 * 60_000 }), permanentlyDeleteTrashItem);

export default router;
