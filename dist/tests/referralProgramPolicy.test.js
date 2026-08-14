"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const referralProgramPolicy_1 = require("../domain/referralProgramPolicy");
const ReferralPartner_1 = __importDefault(require("../models/ReferralPartner"));
(0, node_test_1.default)("standard referral reward is 10% without a default cap", () => {
    strict_1.default.equal((0, referralProgramPolicy_1.calculateReferralReward)(30000), 3000);
    strict_1.default.equal((0, referralProgramPolicy_1.calculateReferralReward)(150000), 15000);
    strict_1.default.equal((0, referralProgramPolicy_1.calculateReferralReward)(300000), 30000);
    strict_1.default.equal((0, referralProgramPolicy_1.calculateReferralReward)(10000000), 1000000);
    strict_1.default.equal((0, referralProgramPolicy_1.calculateReferralReward)(-500), 0);
});
(0, node_test_1.default)("reward calculation supports an explicit optional cap and clamps unsafe values", () => {
    strict_1.default.equal((0, referralProgramPolicy_1.calculateReferralReward)(10000, 20000, 50000), 10000);
    strict_1.default.equal((0, referralProgramPolicy_1.calculateReferralReward)(300000, 1000, 20000), 20000);
    strict_1.default.equal((0, referralProgramPolicy_1.calculateReferralReward)(Number.NaN, 1000, 0), 0);
    strict_1.default.equal((0, referralProgramPolicy_1.calculateReferralReward)(10000, 1000, -1), 1000);
});
(0, node_test_1.default)("reward workflow only allows the controlled forward sequence", () => {
    strict_1.default.equal((0, referralProgramPolicy_1.canTransitionReferralReward)("waiting_client_payment", "earned"), true);
    strict_1.default.equal((0, referralProgramPolicy_1.canTransitionReferralReward)("earned", "approved"), true);
    strict_1.default.equal((0, referralProgramPolicy_1.canTransitionReferralReward)("approved", "scheduled"), true);
    strict_1.default.equal((0, referralProgramPolicy_1.canTransitionReferralReward)("scheduled", "paid"), true);
    strict_1.default.equal((0, referralProgramPolicy_1.canTransitionReferralReward)("waiting_client_payment", "approved"), false);
    strict_1.default.equal((0, referralProgramPolicy_1.canTransitionReferralReward)("earned", "paid"), false);
    strict_1.default.equal((0, referralProgramPolicy_1.canTransitionReferralReward)("paid", "cancelled"), false);
});
(0, node_test_1.default)("rate-limit keys are scoped, stable per window and never expose the IP", () => {
    const now = Date.UTC(2026, 7, 10, 12, 15);
    const first = (0, referralProgramPolicy_1.buildReferralRateLimitKey)("203.0.113.42", "partner_application", now, "test-secret");
    const sameWindow = (0, referralProgramPolicy_1.buildReferralRateLimitKey)("203.0.113.42", "partner_application", now + 1000, "test-secret");
    const otherAction = (0, referralProgramPolicy_1.buildReferralRateLimitKey)("203.0.113.42", "prospect_referral", now, "test-secret");
    strict_1.default.equal(first.key, sameWindow.key);
    strict_1.default.notEqual(first.key, otherAction.key);
    strict_1.default.equal(first.key.includes("203.0.113.42"), false);
    strict_1.default.equal(referralProgramPolicy_1.REFERRAL_RATE_LIMITS.partner_application.limit, 4);
    strict_1.default.equal(referralProgramPolicy_1.REFERRAL_RATE_LIMITS.direct_referral.limit, 6);
    strict_1.default.equal(referralProgramPolicy_1.REFERRAL_RATE_LIMITS.career_application.limit, 5);
});
(0, node_test_1.default)("rate-limit policy rejects the first request above the configured threshold", () => {
    strict_1.default.deepEqual((0, referralProgramPolicy_1.getReferralRateLimitDecision)("partner_application", 4), { allowed: true, remaining: 0, limit: 4 });
    strict_1.default.deepEqual((0, referralProgramPolicy_1.getReferralRateLimitDecision)("partner_application", 5), { allowed: false, remaining: 0, limit: 4 });
    strict_1.default.equal((0, referralProgramPolicy_1.getReferralRateLimitDecision)("partner_lead", 20).allowed, true);
    strict_1.default.equal((0, referralProgramPolicy_1.getReferralRateLimitDecision)("partner_lead", 21).allowed, false);
    strict_1.default.equal((0, referralProgramPolicy_1.getReferralRateLimitDecision)("career_application", 5).allowed, true);
    strict_1.default.equal((0, referralProgramPolicy_1.getReferralRateLimitDecision)("career_application", 6).allowed, false);
});
(0, node_test_1.default)("private access secrets stay in the URL fragment and are removed from JSON", () => {
    const secret = "private-secret-value";
    const accessUrl = (0, referralProgramPolicy_1.buildPrivatePartnerAccessUrl)("https://creativapoeta.com", "CP-RP-ABC123", secret);
    const fragmentIndex = accessUrl.indexOf("#");
    strict_1.default.ok(fragmentIndex > 0);
    strict_1.default.equal(accessUrl.slice(0, fragmentIndex).includes(secret), false);
    strict_1.default.equal(new URL(accessUrl).search.includes(secret), false);
    const partner = new ReferralPartner_1.default({
        name: "Test Partner",
        email: "partner@example.com",
        country: "BE",
        locale: "fr",
        profileType: "consultant",
        program: "referral",
        termsVersion: "test",
        termsAcceptedAt: new Date(),
        accessSecretHash: "must-not-leak",
    });
    strict_1.default.equal(Object.prototype.hasOwnProperty.call(partner.toJSON(), "accessSecretHash"), false);
});
(0, node_test_1.default)("a referral partner application can use a phone number without an email address", () => {
    const partner = new ReferralPartner_1.default({
        name: "Phone-only Partner",
        phone: "+32473297112",
        preferredContact: "whatsapp",
        country: "BE",
        locale: "nl",
        profileType: "individual",
        program: "referral",
        termsVersion: "test",
        termsAcceptedAt: new Date(),
    });
    strict_1.default.equal(partner.email, undefined);
    strict_1.default.equal(partner.phone, "+32473297112");
    strict_1.default.equal(partner.validateSync(), undefined);
});
