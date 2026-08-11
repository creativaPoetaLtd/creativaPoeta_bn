import crypto from "crypto";
import { ReferralRewardStatus } from "../models/ReferralReward";

export type ReferralPublicAction = "partner_application" | "partner_lead" | "direct_referral" | "prospect_referral";

export const REFERRAL_RATE_LIMITS: Record<ReferralPublicAction, { limit: number; windowMs: number }> = {
  partner_application: { limit: 4, windowMs: 60 * 60_000 },
  partner_lead: { limit: 20, windowMs: 60 * 60_000 },
  direct_referral: { limit: 6, windowMs: 60 * 60_000 },
  prospect_referral: { limit: 8, windowMs: 60 * 60_000 },
};

export const rewardTransitions: Readonly<Record<ReferralRewardStatus, readonly ReferralRewardStatus[]>> = {
  waiting_client_payment: ["earned", "cancelled"],
  earned: ["approved", "cancelled"],
  approved: ["scheduled", "cancelled"],
  scheduled: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export const canTransitionReferralReward = (from: ReferralRewardStatus, to: ReferralRewardStatus) =>
  rewardTransitions[from].includes(to);

export const calculateReferralReward = (
  eligibleRevenueCents: number,
  rateBasisPoints = 1000,
  capCents = 0
) => {
  const revenue = Number.isFinite(eligibleRevenueCents) ? Math.max(0, Math.round(eligibleRevenueCents)) : 0;
  const rate = Number.isFinite(rateBasisPoints) ? Math.min(10000, Math.max(0, Math.round(rateBasisPoints))) : 1000;
  const cap = Number.isFinite(capCents) ? Math.max(0, Math.round(capCents)) : 0;
  const calculated = Math.round((revenue * rate) / 10000);
  return cap > 0 ? Math.min(cap, calculated) : calculated;
};

export const buildReferralRateLimitKey = (
  ipAddress: string,
  action: ReferralPublicAction,
  now: number,
  secret: string
) => {
  const { windowMs } = REFERRAL_RATE_LIMITS[action];
  const bucketStart = Math.floor(now / windowMs) * windowMs;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(`${action}:${ipAddress || "unknown"}:${bucketStart}`)
    .digest("hex");
  return { key: `${action}:${digest}`, bucketStart, resetAt: bucketStart + windowMs };
};

export const getReferralRateLimitDecision = (action: ReferralPublicAction, count: number) => {
  const limit = REFERRAL_RATE_LIMITS[action].limit;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), limit };
};

export const buildPrivatePartnerAccessUrl = (frontendUrl: string, partnerId: string, accessSecret: string) =>
  `${frontendUrl.replace(/\/$/, "")}/referral-partners#partner=${encodeURIComponent(partnerId)}&access=${encodeURIComponent(accessSecret)}`;
