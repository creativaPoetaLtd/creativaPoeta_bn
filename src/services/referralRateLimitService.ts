import { Request, Response } from "express";
import { buildReferralRateLimitKey, getReferralRateLimitDecision, REFERRAL_RATE_LIMITS, ReferralPublicAction } from "../domain/referralProgramPolicy";
import ReferralRateLimit from "../models/ReferralRateLimit";

const getClientIp = (req: Request) => String(req.ip || req.socket.remoteAddress || "unknown").slice(0, 200);

export const consumeReferralRateLimit = async (req: Request, res: Response, action: ReferralPublicAction) => {
  // Early-stage growth mode: keep the tested limiter available for later, but
  // do not reject legitimate applications or client introductions by default.
  // Set REFERRAL_RATE_LIMIT_ENABLED=true to reactivate the stored policy.
  if (String(process.env.REFERRAL_RATE_LIMIT_ENABLED || "").toLowerCase() !== "true") {
    return true;
  }

  const now = Date.now();
  const policy = REFERRAL_RATE_LIMITS[action];
  const secret = process.env.REFERRAL_RATE_LIMIT_SALT || process.env.JWT_SECRET || "cprpp-rate-limit-v1";
  const bucket = buildReferralRateLimitKey(getClientIp(req), action, now, secret);

  let record;
  try {
    record = await ReferralRateLimit.findOneAndUpdate(
      { key: bucket.key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(bucket.resetAt + policy.windowMs) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error: unknown) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    record = await ReferralRateLimit.findOneAndUpdate({ key: bucket.key }, { $inc: { count: 1 } }, { new: true });
  }

  const count = record?.count || 1;
  const decision = getReferralRateLimitDecision(action, count);
  res.setHeader("RateLimit-Limit", String(decision.limit));
  res.setHeader("RateLimit-Remaining", String(decision.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
  if (decision.allowed) return true;

  res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
  return false;
};
