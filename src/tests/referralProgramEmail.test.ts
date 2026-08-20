import assert from "node:assert/strict";
import test from "node:test";
import {
  getPartnerNotificationCopy,
  renderPartnerApprovalEmail,
  renderPartnerApprovalMessage,
  renderPartnerRejectionEmail,
} from "../controllers/referralProgramController";
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

test("manual approval package clearly identifies both links", () => {
  const accessUrl = "https://creativapoeta.com/referral-partners/access?partner=CP-RP-ABC123#private-secret";
  const shareUrl = "https://creativapoeta.com/referral-partners?ref=public-code#referred-business";
  const message = renderPartnerApprovalMessage({
    partnerName: "Example Partner",
    partnerId: "CP-RP-ABC123",
    accessUrl,
    shareUrl,
    locale: "en",
  });

  assert.match(message, /Partner ID: CP-RP-ABC123/);
  assert.match(message, /This personal, secure link is for you only/);
  assert.match(message, /This public link is not a form for you/);
  assert.equal(message.includes(accessUrl), true);
  assert.equal(message.includes(shareUrl), true);
});

test("partner decision emails follow the applicant locale", () => {
  const french = getPartnerNotificationCopy("fr-BE");
  const dutch = getPartnerNotificationCopy("nl-BE");
  const kinyarwanda = getPartnerNotificationCopy("kiny-RW");
  const defaultCopy = getPartnerNotificationCopy();
  const unknownCopy = getPartnerNotificationCopy("unknown");
  const rejection = renderPartnerRejectionEmail({
    partnerName: "Example Partner",
    reason: "Informations incomplètes",
    locale: "fr-BE",
  });

  assert.match(french.approvedTitle, /approuvée/i);
  assert.match(dutch.approvedTitle, /goedgekeurd/i);
  assert.match(kinyarwanda.approvedTitle, /bwemejwe/i);
  assert.equal(defaultCopy.approvedTitle, getPartnerNotificationCopy("en").approvedTitle);
  assert.equal(unknownCopy.approvedTitle, getPartnerNotificationCopy("en").approvedTitle);
  assert.match(rejection, /Informations incomplètes/);
  assert.match(rejection, /Bonjour Example Partner/);
});
