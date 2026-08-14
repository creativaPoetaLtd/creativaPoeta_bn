"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumeReferralRateLimit = void 0;
const referralProgramPolicy_1 = require("../domain/referralProgramPolicy");
const ReferralRateLimit_1 = __importDefault(require("../models/ReferralRateLimit"));
const getClientIp = (req) => String(req.ip || req.socket.remoteAddress || "unknown").slice(0, 200);
const consumeReferralRateLimit = async (req, res, action) => {
    // Early-stage growth mode: keep the tested limiter available for later, but
    // do not reject legitimate applications or client introductions by default.
    // Set REFERRAL_RATE_LIMIT_ENABLED=true to reactivate the stored policy.
    if (String(process.env.REFERRAL_RATE_LIMIT_ENABLED || "").toLowerCase() !== "true") {
        return true;
    }
    const now = Date.now();
    const policy = referralProgramPolicy_1.REFERRAL_RATE_LIMITS[action];
    const secret = process.env.REFERRAL_RATE_LIMIT_SALT || process.env.JWT_SECRET || "cprpp-rate-limit-v1";
    const bucket = (0, referralProgramPolicy_1.buildReferralRateLimitKey)(getClientIp(req), action, now, secret);
    let record;
    try {
        record = await ReferralRateLimit_1.default.findOneAndUpdate({ key: bucket.key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(bucket.resetAt + policy.windowMs) } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) !== 11000)
            throw error;
        record = await ReferralRateLimit_1.default.findOneAndUpdate({ key: bucket.key }, { $inc: { count: 1 } }, { new: true });
    }
    const count = (record === null || record === void 0 ? void 0 : record.count) || 1;
    const decision = (0, referralProgramPolicy_1.getReferralRateLimitDecision)(action, count);
    res.setHeader("RateLimit-Limit", String(decision.limit));
    res.setHeader("RateLimit-Remaining", String(decision.remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (decision.allowed)
        return true;
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    return false;
};
exports.consumeReferralRateLimit = consumeReferralRateLimit;
