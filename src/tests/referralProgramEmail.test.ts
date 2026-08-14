import assert from "node:assert/strict";
import test from "node:test";
import { renderPartnerApprovalEmail } from "../controllers/referralProgramController";
import { renderBrandedEmail } from "../utils/emailTemplate";

test("partner approval email separates private access from the public share link", () => {
  const accessUrl = "https://creativapoeta.com/referral-partners/access?partner=CP-RP-ABC123#secret";
  const shareUrl = "https://creativapoeta.com/referral-partners?ref=public-code#referred-business";
  const html = renderPartnerApprovalEmail({
    partnerName: "Example Partner",
    partnerId: "CP-RP-ABC123",
    accessUrl,
    shareUrl,
  });

  assert.match(html, new RegExp(`href="${accessUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.equal(html.includes(`href="${shareUrl}"`), false);
  assert.match(html, /This personal, secure link is for you only/);
  assert.match(html, /This public link is not a form for you/);
  assert.match(html, /copy it, then share it by WhatsApp, email, SMS or social media/);
});

test("common branded email signature no longer exposes a telephone number", () => {
  const html = renderBrandedEmail({ content: "<p>Message</p>" });

  assert.equal(html.includes("+32 473 29 71 12"), false);
  assert.equal(html.includes("tel:+32473297112"), false);
  assert.match(html, /contact@creativapoeta\.com/);
  assert.match(html, /www\.creativapoeta\.com/);
});
