"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPrivatePartnerAccessUrl = exports.getReferralRateLimitDecision = exports.buildReferralRateLimitKey = exports.calculateReferralReward = exports.canTransitionReferralReward = exports.rewardTransitions = exports.REFERRAL_RATE_LIMITS = void 0;
const crypto_1 = __importDefault(require("crypto"));
exports.REFERRAL_RATE_LIMITS = {
    partner_application: { limit: 4, windowMs: 60 * 60000 },
    partner_lead: { limit: 20, windowMs: 60 * 60000 },
    prospect_referral: { limit: 8, windowMs: 60 * 60000 },
};
exports.rewardTransitions = {
    waiting_client_payment: ["earned", "cancelled"],
    earned: ["approved", "cancelled"],
    approved: ["scheduled", "cancelled"],
    scheduled: ["paid", "cancelled"],
    paid: [],
    cancelled: [],
};
const canTransitionReferralReward = (from, to) => exports.rewardTransitions[from].includes(to);
exports.canTransitionReferralReward = canTransitionReferralReward;
const calculateReferralReward = (eligibleRevenueCents, rateBasisPoints = 1000, capCents = 20000) => {
    const revenue = Number.isFinite(eligibleRevenueCents) ? Math.max(0, Math.round(eligibleRevenueCents)) : 0;
    const rate = Number.isFinite(rateBasisPoints) ? Math.min(10000, Math.max(0, Math.round(rateBasisPoints))) : 1000;
    const cap = Number.isFinite(capCents) ? Math.max(0, Math.round(capCents)) : 20000;
    return Math.min(cap, Math.round((revenue * rate) / 10000));
};
exports.calculateReferralReward = calculateReferralReward;
const buildReferralRateLimitKey = (ipAddress, action, now, secret) => {
    const { windowMs } = exports.REFERRAL_RATE_LIMITS[action];
    const bucketStart = Math.floor(now / windowMs) * windowMs;
    const digest = crypto_1.default
        .createHmac("sha256", secret)
        .update(`${action}:${ipAddress || "unknown"}:${bucketStart}`)
        .digest("hex");
    return { key: `${action}:${digest}`, bucketStart, resetAt: bucketStart + windowMs };
};
exports.buildReferralRateLimitKey = buildReferralRateLimitKey;
const getReferralRateLimitDecision = (action, count) => {
    const limit = exports.REFERRAL_RATE_LIMITS[action].limit;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), limit };
};
exports.getReferralRateLimitDecision = getReferralRateLimitDecision;
const buildPrivatePartnerAccessUrl = (frontendUrl, partnerId, accessSecret) => `${frontendUrl.replace(/\/$/, "")}/referral-partners#partner=${encodeURIComponent(partnerId)}&access=${encodeURIComponent(accessSecret)}`;
exports.buildPrivatePartnerAccessUrl = buildPrivatePartnerAccessUrl;
