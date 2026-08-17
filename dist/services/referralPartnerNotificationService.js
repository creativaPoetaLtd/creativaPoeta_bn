"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverReferralPartnerNotification = exports.getReferralWhatsAppTemplate = void 0;
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const whatsAppService_1 = require("./whatsAppService");
const safeError = (error) => {
    const message = error instanceof Error ? error.message : String(error || "Unknown delivery error.");
    return message.replace(/[\r\n]+/g, " ").trim().slice(0, 500);
};
const getReferralWhatsAppTemplate = ({ target, content, }) => {
    const approval = content.kind === "approval";
    return {
        templateName: approval
            ? String(process.env.WHATSAPP_REFERRAL_APPROVED_TEMPLATE || "").trim()
            : String(process.env.WHATSAPP_REFERRAL_REJECTED_TEMPLATE || "").trim(),
        languageCode: (0, whatsAppService_1.getWhatsAppTemplateLanguage)(target.locale),
        bodyParameters: approval
            ? [
                target.name,
                target.partnerId || "-",
                content.accessUrl || "-",
                content.shareUrl || "-",
            ]
            : [target.name, content.reason || "-"],
    };
};
exports.getReferralWhatsAppTemplate = getReferralWhatsAppTemplate;
const deliverReferralPartnerNotification = async ({ target, content, dependencies = {}, }) => {
    const attemptedAt = new Date();
    const sendEmailMessage = dependencies.sendEmailMessage || sendEmail_1.default;
    const sendWhatsAppTemplate = dependencies.sendWhatsAppTemplate || whatsAppService_1.sendWhatsAppTemplateMessage;
    const errors = [];
    if (target.preferredContact === "whatsapp" && target.phone) {
        try {
            const template = (0, exports.getReferralWhatsAppTemplate)({ target, content });
            const result = await sendWhatsAppTemplate({
                to: target.phone,
                ...template,
            });
            return {
                kind: content.kind,
                requestedChannel: target.preferredContact,
                deliveredChannel: "whatsapp",
                status: "sent",
                fallbackUsed: false,
                providerMessageId: result.providerMessageId,
                attemptedAt,
                updatedAt: new Date(),
            };
        }
        catch (error) {
            errors.push(`WhatsApp: ${safeError(error)}`);
        }
        if (target.email) {
            try {
                await sendEmailMessage(target.email, content.emailSubject, content.emailHtml);
                return {
                    kind: content.kind,
                    requestedChannel: target.preferredContact,
                    deliveredChannel: "email",
                    status: "sent",
                    fallbackUsed: true,
                    error: errors.join(" | "),
                    attemptedAt,
                    updatedAt: new Date(),
                };
            }
            catch (error) {
                errors.push(`Email fallback: ${safeError(error)}`);
            }
        }
        return {
            kind: content.kind,
            requestedChannel: target.preferredContact,
            status: "failed",
            fallbackUsed: false,
            error: errors.join(" | ") || "WhatsApp delivery failed.",
            attemptedAt,
            updatedAt: new Date(),
        };
    }
    if (target.preferredContact === "email" && target.email) {
        try {
            await sendEmailMessage(target.email, content.emailSubject, content.emailHtml);
            return {
                kind: content.kind,
                requestedChannel: target.preferredContact,
                deliveredChannel: "email",
                status: "sent",
                fallbackUsed: false,
                attemptedAt,
                updatedAt: new Date(),
            };
        }
        catch (error) {
            return {
                kind: content.kind,
                requestedChannel: target.preferredContact,
                status: "failed",
                fallbackUsed: false,
                error: `Email: ${safeError(error)}`,
                attemptedAt,
                updatedAt: new Date(),
            };
        }
    }
    return {
        kind: content.kind,
        requestedChannel: target.preferredContact,
        status: "manual_required",
        fallbackUsed: false,
        error: `Automatic delivery is not available for ${target.preferredContact}.`,
        attemptedAt,
        updatedAt: new Date(),
    };
};
exports.deliverReferralPartnerNotification = deliverReferralPartnerNotification;
