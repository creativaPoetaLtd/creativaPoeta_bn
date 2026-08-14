import assert from "node:assert/strict";
import test from "node:test";
import { Request, Response } from "express";
import { consumeReferralRateLimit } from "../services/referralRateLimitService";

test("public referral rate limits stay disabled until explicitly enabled", async () => {
  const previous = process.env.REFERRAL_RATE_LIMIT_ENABLED;
  delete process.env.REFERRAL_RATE_LIMIT_ENABLED;

  try {
    const allowed = await consumeReferralRateLimit(
      {} as Request,
      { setHeader: () => { throw new Error("disabled limiter must not write rate-limit headers"); } } as unknown as Response,
      "partner_application"
    );
    assert.equal(allowed, true);
  } finally {
    if (previous === undefined) delete process.env.REFERRAL_RATE_LIMIT_ENABLED;
    else process.env.REFERRAL_RATE_LIMIT_ENABLED = previous;
  }
});
