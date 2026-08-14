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
