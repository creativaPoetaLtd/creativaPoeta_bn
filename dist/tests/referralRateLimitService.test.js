"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const referralRateLimitService_1 = require("../services/referralRateLimitService");
(0, node_test_1.default)("public referral rate limits stay disabled until explicitly enabled", async () => {
    const previous = process.env.REFERRAL_RATE_LIMIT_ENABLED;
    delete process.env.REFERRAL_RATE_LIMIT_ENABLED;
    try {
        const allowed = await (0, referralRateLimitService_1.consumeReferralRateLimit)({}, { setHeader: () => { throw new Error("disabled limiter must not write rate-limit headers"); } }, "partner_application");
        strict_1.default.equal(allowed, true);
    }
    finally {
        if (previous === undefined)
            delete process.env.REFERRAL_RATE_LIMIT_ENABLED;
        else
            process.env.REFERRAL_RATE_LIMIT_ENABLED = previous;
    }
});
