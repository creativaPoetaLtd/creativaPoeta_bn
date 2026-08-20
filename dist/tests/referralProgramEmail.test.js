"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const referralProgramController_1 = require("../controllers/referralProgramController");
const emailTemplate_1 = require("../utils/emailTemplate");
(0, node_test_1.default)("partner approval email separates private access from the public share link", () => {
    const accessUrl = "https://creativapoeta.com/referral-partners/access?partner=CP-RP-ABC123#secret";
    const shareUrl = "https://creativapoeta.com/referral-partners?ref=public-code#referred-business";
    const html = (0, referralProgramController_1.renderPartnerApprovalEmail)({
        partnerName: "Example Partner",
        partnerId: "CP-RP-ABC123",
        accessUrl,
        shareUrl,
    });
    strict_1.default.match(html, new RegExp(`href="${accessUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    strict_1.default.equal(html.includes(`href="${shareUrl}"`), false);
    strict_1.default.match(html, /This personal, secure link is for you only/);
    strict_1.default.match(html, /This public link is not a form for you/);
    strict_1.default.match(html, /copy it, then share it by WhatsApp, email, SMS or social media/);
});
(0, node_test_1.default)("common branded email signature no longer exposes a telephone number", () => {
    const html = (0, emailTemplate_1.renderBrandedEmail)({ content: "<p>Message</p>" });
    strict_1.default.equal(html.includes("+32 473 29 71 12"), false);
    strict_1.default.equal(html.includes("tel:+32473297112"), false);
    strict_1.default.match(html, /contact@creativapoeta\.com/);
    strict_1.default.match(html, /www\.creativapoeta\.com/);
});
(0, node_test_1.default)("manual approval package clearly identifies both links", () => {
    const accessUrl = "https://creativapoeta.com/referral-partners/access?partner=CP-RP-ABC123#private-secret";
    const shareUrl = "https://creativapoeta.com/referral-partners?ref=public-code#referred-business";
    const message = (0, referralProgramController_1.renderPartnerApprovalMessage)({
        partnerName: "Example Partner",
        partnerId: "CP-RP-ABC123",
        accessUrl,
        shareUrl,
        locale: "en",
    });
    strict_1.default.match(message, /Partner ID: CP-RP-ABC123/);
    strict_1.default.match(message, /This personal, secure link is for you only/);
    strict_1.default.match(message, /This public link is not a form for you/);
    strict_1.default.equal(message.includes(accessUrl), true);
    strict_1.default.equal(message.includes(shareUrl), true);
});
(0, node_test_1.default)("partner decision emails follow the applicant locale", () => {
    const french = (0, referralProgramController_1.getPartnerNotificationCopy)("fr-BE");
    const dutch = (0, referralProgramController_1.getPartnerNotificationCopy)("nl-BE");
    const kinyarwanda = (0, referralProgramController_1.getPartnerNotificationCopy)("kiny-RW");
    const defaultCopy = (0, referralProgramController_1.getPartnerNotificationCopy)();
    const unknownCopy = (0, referralProgramController_1.getPartnerNotificationCopy)("unknown");
    const rejection = (0, referralProgramController_1.renderPartnerRejectionEmail)({
        partnerName: "Example Partner",
        reason: "Informations incomplètes",
        locale: "fr-BE",
    });
    strict_1.default.match(french.approvedTitle, /approuvée/i);
    strict_1.default.match(dutch.approvedTitle, /goedgekeurd/i);
    strict_1.default.match(kinyarwanda.approvedTitle, /bwemejwe/i);
    strict_1.default.equal(defaultCopy.approvedTitle, (0, referralProgramController_1.getPartnerNotificationCopy)("en").approvedTitle);
    strict_1.default.equal(unknownCopy.approvedTitle, (0, referralProgramController_1.getPartnerNotificationCopy)("en").approvedTitle);
    strict_1.default.match(rejection, /Informations incomplètes/);
    strict_1.default.match(rejection, /Bonjour Example Partner/);
});
