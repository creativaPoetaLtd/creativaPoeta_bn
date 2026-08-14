import express from "express";
import {
  applyToReferralProgram,
  requestPartnerAccessRecovery,
  claimReferralLead,
  createManualReferralEntry,
  submitDirectReferral,
  getReferralLeads,
  getReferralPartners,
  getReferralProgramSummary,
  getReferralRewards,
  markReferralRewardPaid,
  submitReferralLead,
  submitProspectReferral,
  updateReferralLead,
  updateReferralPartner,
  updateReferralRewardStatus,
  upsertReferralReward,
} from "../controllers/referralProgramController";
import { authenticateUser } from "../middleware/authMiddleware";
import { authorizeAdminPermission } from "../middleware/permissionMiddleware";

const router = express.Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
const canRead = authorizeAdminPermission("referrals:read", ["admin_1", "admin_4"]);
const canManage = authorizeAdminPermission("referrals:manage", ["admin_1"]);
const canApprovePartners = authorizeAdminPermission("partners:approve", ["admin_1"]);
const canReadRewards = authorizeAdminPermission("rewards:read", ["admin_1", "admin_4"]);
const canApproveRewards = authorizeAdminPermission("rewards:approve", ["admin_0"]);
const canPayRewards = authorizeAdminPermission("rewards:pay", ["admin_0"]);

router.post("/partners", applyToReferralProgram);
router.post("/partners/recover-access", requestPartnerAccessRecovery);
router.post("/leads", submitReferralLead);
router.post("/direct-referrals", submitDirectReferral);
router.post("/prospect-referrals", submitProspectReferral);

router.get("/summary", authenticateUser, canRead, getReferralProgramSummary);
router.post("/manual-entries", authenticateUser, canManage, createManualReferralEntry);
router.get("/partners", authenticateUser, canRead, getReferralPartners);
router.patch("/partners/:id", authenticateUser, canApprovePartners, updateReferralPartner);
router.get("/leads", authenticateUser, canRead, getReferralLeads);
router.patch("/leads/:id", authenticateUser, canManage, updateReferralLead);
router.post("/leads/:id/claim", authenticateUser, canManage, claimReferralLead);
router.get("/rewards", authenticateUser, canReadRewards, getReferralRewards);
router.put("/leads/:leadId/reward", authenticateUser, canApproveRewards, upsertReferralReward);
router.patch("/rewards/:id/status", authenticateUser, canApproveRewards, updateReferralRewardStatus);
router.patch("/rewards/:id/pay", authenticateUser, canPayRewards, markReferralRewardPaid);

export default router;
