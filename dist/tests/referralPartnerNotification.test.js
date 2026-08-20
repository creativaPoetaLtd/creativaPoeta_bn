"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const referralPartnerNotificationService_1 = require("../services/referralPartnerNotificationService");
const whatsAppService_1 = require("../services/whatsAppService");
process.env.WHATSAPP_REFERRAL_APPROVED_TEMPLATE = "cp_referral_application_approved";
process.env.WHATSAPP_REFERRAL_REJECTED_TEMPLATE = "cp_referral_application_rejected";
const approvalTarget = {
    name: "Example Partner",
    email: "partner@example.com",
    phone: "+32 470 12 34 56",
    preferredContact: "whatsapp",
    locale: "fr-BE",
    partnerId: "CP-RP-ABC123",
};
const approvalContent = {
    kind: "approval",
    emailSubject: "Approved",
    emailHtml: "<p>Approved</p>",
    accessUrl: "https://creativapoeta.com/private-link",
    shareUrl: "https://creativapoeta.com/public-link",
};
(0, node_test_1.default)("builds a normalized Meta template payload with deterministic parameters", () => {
    const payload = (0, whatsAppService_1.buildWhatsAppTemplatePayload)({
        to: "+32 470 12 34 56",
        templateName: "cp_referral_application_approved",
        languageCode: "fr",
        bodyParameters: ["Example Partner", "CP-RP-ABC123"],
    });
    strict_1.default.equal(payload.to, "32470123456");
    strict_1.default.equal(payload.template.name, "cp_referral_application_approved");
    strict_1.default.equal(payload.template.language.code, "fr");
    strict_1.default.deepEqual(payload.template.components[0].parameters, [
        { type: "text", text: "Example Partner" },
        { type: "text", text: "CP-RP-ABC123" },
    ]);
    strict_1.default.equal((0, whatsAppService_1.getWhatsAppTemplateLanguage)("nl-BE"), "nl");
    strict_1.default.equal((0, whatsAppService_1.getWhatsAppTemplateLanguage)("kiny-RW"), "rw_RW");
    strict_1.default.equal((0, whatsAppService_1.getWhatsAppTemplateLanguage)("unknown"), "en_US");
});
(0, node_test_1.default)("keeps the documented approval template parameter order", () => {
    const template = (0, referralPartnerNotificationService_1.getReferralWhatsAppTemplate)({
        target: approvalTarget,
        content: approvalContent,
    });
    strict_1.default.equal(template.templateName, "cp_referral_application_approved");
    strict_1.default.equal(template.languageCode, "fr");
    strict_1.default.deepEqual(template.bodyParameters, [
        "Example Partner",
        "CP-RP-ABC123",
        "https://creativapoeta.com/private-link",
        "https://creativapoeta.com/public-link",
    ]);
});
(0, node_test_1.default)("uses WhatsApp only when the preferred WhatsApp delivery succeeds", async () => {
    let emailCalls = 0;
    let whatsappCalls = 0;
    const delivery = await (0, referralPartnerNotificationService_1.deliverReferralPartnerNotification)({
        target: approvalTarget,
        content: approvalContent,
        dependencies: {
            sendWhatsAppTemplate: (async () => {
                whatsappCalls += 1;
                return { providerMessageId: "wamid.test", payload: {} };
            }),
            sendEmailMessage: (async () => {
                emailCalls += 1;
                return {};
            }),
        },
    });
    strict_1.default.equal(whatsappCalls, 1);
    strict_1.default.equal(emailCalls, 0);
    strict_1.default.equal(delivery.status, "sent");
    strict_1.default.equal(delivery.deliveredChannel, "whatsapp");
    strict_1.default.equal(delivery.providerMessageId, "wamid.test");
    strict_1.default.equal(delivery.fallbackUsed, false);
});
(0, node_test_1.default)("falls back to email and records the WhatsApp error", async () => {
    let emailCalls = 0;
    const delivery = await (0, referralPartnerNotificationService_1.deliverReferralPartnerNotification)({
        target: approvalTarget,
        content: approvalContent,
        dependencies: {
            sendWhatsAppTemplate: (async () => {
                throw new Error("Template is not approved");
            }),
            sendEmailMessage: (async () => {
                emailCalls += 1;
                return {};
            }),
        },
    });
    strict_1.default.equal(emailCalls, 1);
    strict_1.default.equal(delivery.status, "sent");
    strict_1.default.equal(delivery.deliveredChannel, "email");
    strict_1.default.equal(delivery.fallbackUsed, true);
    strict_1.default.match(delivery.error || "", /Template is not approved/);
});
(0, node_test_1.default)("records a failed WhatsApp notification when no fallback address exists", async () => {
    const delivery = await (0, referralPartnerNotificationService_1.deliverReferralPartnerNotification)({
        target: { ...approvalTarget, email: undefined },
        content: approvalContent,
        dependencies: {
            sendWhatsAppTemplate: (async () => {
                throw new Error("Meta unavailable");
            }),
        },
    });
    strict_1.default.equal(delivery.status, "failed");
    strict_1.default.equal(delivery.deliveredChannel, undefined);
    strict_1.default.match(delivery.error || "", /Meta unavailable/);
});
(0, node_test_1.default)("marks non-automated contact channels for manual handling", async () => {
    const delivery = await (0, referralPartnerNotificationService_1.deliverReferralPartnerNotification)({
        target: { ...approvalTarget, preferredContact: "phone" },
        content: approvalContent,
    });
    strict_1.default.equal(delivery.status, "manual_required");
    strict_1.default.equal(delivery.requestedChannel, "phone");
});
