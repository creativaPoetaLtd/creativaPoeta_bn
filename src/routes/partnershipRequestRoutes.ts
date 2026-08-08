import express from "express";
import {
  claimPartnershipRequest,
  createPartnershipRequest,
  deletePartnershipRequest,
  getPartnershipRequest,
  getPartnershipRequests,
  getPartnershipRequestSummary,
  releasePartnershipRequest,
  replyToPartnershipRequest,
  updatePartnershipRequestStatus,
} from "../controllers/partnershipRequestController";
import { authenticateUser } from "../middleware/authMiddleware";
import { authorizeAdminPermission } from "../middleware/permissionMiddleware";

const router = express.Router();
const canManagePartnerships = authorizeAdminPermission(
  "requests:partnerships",
  ["admin_1"]
);

router.post("/", createPartnershipRequest);
router.get("/", authenticateUser, canManagePartnerships, getPartnershipRequests);
router.get("/summary", authenticateUser, canManagePartnerships, getPartnershipRequestSummary);
router.get("/:id", authenticateUser, canManagePartnerships, getPartnershipRequest);
router.post("/:id/claim", authenticateUser, canManagePartnerships, claimPartnershipRequest);
router.post("/:id/release", authenticateUser, canManagePartnerships, releasePartnershipRequest);
router.post("/:id/reply", authenticateUser, canManagePartnerships, replyToPartnershipRequest);
router.patch("/:id/status", authenticateUser, canManagePartnerships, updatePartnershipRequestStatus);
router.delete("/:id", authenticateUser, canManagePartnerships, deletePartnershipRequest);

export default router;
