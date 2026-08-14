import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReferralRateLimitKey,
  buildPrivatePartnerAccessUrl,
  calculateReferralReward,
  canTransitionReferralReward,
  getReferralRateLimitDecision,
  REFERRAL_RATE_LIMITS,
} from "../domain/referralProgramPolicy";
import ReferralPartner from "../models/ReferralPartner";

test("standard referral reward is 10% without a default cap", () => {
  assert.equal(calculateReferralReward(30000), 3000);
  assert.equal(calculateReferralReward(150000), 15000);
  assert.equal(calculateReferralReward(300000), 30000);
  assert.equal(calculateReferralReward(10000000), 1000000);
  assert.equal(calculateReferralReward(-500), 0);
});

test("reward calculation supports an explicit optional cap and clamps unsafe values", () => {
  assert.equal(calculateReferralReward(10000, 20000, 50000), 10000);
  assert.equal(calculateReferralReward(300000, 1000, 20000), 20000);
  assert.equal(calculateReferralReward(Number.NaN, 1000, 0), 0);
  assert.equal(calculateReferralReward(10000, 1000, -1), 1000);
});

test("reward workflow only allows the controlled forward sequence", () => {
  assert.equal(canTransitionReferralReward("waiting_client_payment", "earned"), true);
  assert.equal(canTransitionReferralReward("earned", "approved"), true);
  assert.equal(canTransitionReferralReward("approved", "scheduled"), true);
  assert.equal(canTransitionReferralReward("scheduled", "paid"), true);
  assert.equal(canTransitionReferralReward("waiting_client_payment", "approved"), false);
  assert.equal(canTransitionReferralReward("earned", "paid"), false);
  assert.equal(canTransitionReferralReward("paid", "cancelled"), false);
});

test("rate-limit keys are scoped, stable per window and never expose the IP", () => {
  const now = Date.UTC(2026, 7, 10, 12, 15);
  const first = buildReferralRateLimitKey("203.0.113.42", "partner_application", now, "test-secret");
  const sameWindow = buildReferralRateLimitKey("203.0.113.42", "partner_application", now + 1000, "test-secret");
  const otherAction = buildReferralRateLimitKey("203.0.113.42", "prospect_referral", now, "test-secret");
  assert.equal(first.key, sameWindow.key);
  assert.notEqual(first.key, otherAction.key);
  assert.equal(first.key.includes("203.0.113.42"), false);
  assert.equal(REFERRAL_RATE_LIMITS.partner_application.limit, 4);
  assert.equal(REFERRAL_RATE_LIMITS.direct_referral.limit, 6);
  assert.equal(REFERRAL_RATE_LIMITS.career_application.limit, 5);
});

test("rate-limit policy rejects the first request above the configured threshold", () => {
  assert.deepEqual(getReferralRateLimitDecision("partner_application", 4), { allowed: true, remaining: 0, limit: 4 });
  assert.deepEqual(getReferralRateLimitDecision("partner_application", 5), { allowed: false, remaining: 0, limit: 4 });
  assert.equal(getReferralRateLimitDecision("partner_lead", 20).allowed, true);
  assert.equal(getReferralRateLimitDecision("partner_lead", 21).allowed, false);
  assert.equal(getReferralRateLimitDecision("career_application", 5).allowed, true);
  assert.equal(getReferralRateLimitDecision("career_application", 6).allowed, false);
});

test("private access secrets stay in the URL fragment and are removed from JSON", () => {
  const secret = "private-secret-value";
  const accessUrl = buildPrivatePartnerAccessUrl("https://creativapoeta.com", "CP-RP-ABC123", secret);
  const fragmentIndex = accessUrl.indexOf("#");
  assert.ok(fragmentIndex > 0);
  assert.equal(accessUrl.slice(0, fragmentIndex).includes(secret), false);
  assert.equal(new URL(accessUrl).search.includes(secret), false);

  const partner = new ReferralPartner({
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
  assert.equal(Object.prototype.hasOwnProperty.call(partner.toJSON(), "accessSecretHash"), false);
});

test("a referral partner application can use a phone number without an email address", () => {
  const partner = new ReferralPartner({
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

  assert.equal(partner.email, undefined);
  assert.equal(partner.phone, "+32473297112");
  assert.equal(partner.validateSync(), undefined);
});
