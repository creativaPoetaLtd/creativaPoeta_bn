"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processWhatsAppWebhook = exports.markWhatsAppMessageRead = exports.sendWhatsAppTextMessage = exports.getWhatsAppConfiguration = void 0;
const WhatsAppConversation_1 = __importDefault(require("../models/WhatsAppConversation"));
const WhatsAppMessage_1 = __importDefault(require("../models/WhatsAppMessage"));
const whatsAppPolicy_1 = require("../domain/whatsAppPolicy");
const getGraphApiVersion = () => process.env.WHATSAPP_GRAPH_API_VERSION || "v25.0";
const getMediaData = (message) => {
    const content = (message === null || message === void 0 ? void 0 : message[message === null || message === void 0 ? void 0 : message.type]) || {};
    return {
        mediaId: (content === null || content === void 0 ? void 0 : content.id) ? String(content.id) : undefined,
        mediaMimeType: (content === null || content === void 0 ? void 0 : content.mime_type) ? String(content.mime_type) : undefined,
        mediaFilename: (content === null || content === void 0 ? void 0 : content.filename) ? String(content.filename) : undefined,
        mediaCaption: (content === null || content === void 0 ? void 0 : content.caption) ? String(content.caption) : undefined,
    };
};
const parseProviderTimestamp = (value) => {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
};
const getWhatsAppConfiguration = () => ({
    configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN &&
        process.env.WHATSAPP_PHONE_NUMBER_ID &&
        process.env.WHATSAPP_APP_SECRET &&
        process.env.WHATSAPP_VERIFY_TOKEN),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    displayPhoneNumber: process.env.WHATSAPP_DISPLAY_PHONE_NUMBER || "",
    graphApiVersion: getGraphApiVersion(),
});
exports.getWhatsAppConfiguration = getWhatsAppConfiguration;
const sendWhatsAppTextMessage = async (to, body) => {
    var _a, _b, _c;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) {
        throw new Error("WhatsApp Cloud API is not configured.");
    }
    const response = await fetch(`https://graph.facebook.com/${getGraphApiVersion()}/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: (0, whatsAppPolicy_1.normalizeWhatsAppId)(to),
            type: "text",
            text: { preview_url: false, body },
        }),
    });
    const payload = (await response.json().catch(() => ({})));
    if (!response.ok) {
        const providerMessage = ((_a = payload === null || payload === void 0 ? void 0 : payload.error) === null || _a === void 0 ? void 0 : _a.message) || `Meta API returned ${response.status}.`;
        throw new Error(providerMessage);
    }
    const providerMessageId = String(((_c = (_b = payload === null || payload === void 0 ? void 0 : payload.messages) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.id) || "");
    if (!providerMessageId)
        throw new Error("Meta did not return a message identifier.");
    return { providerMessageId, payload };
};
exports.sendWhatsAppTextMessage = sendWhatsAppTextMessage;
const markWhatsAppMessageRead = async (providerMessageId) => {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId || !providerMessageId)
        return false;
    try {
        const response = await fetch(`https://graph.facebook.com/${getGraphApiVersion()}/${encodeURIComponent(phoneNumberId)}/messages`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                status: "read",
                message_id: providerMessageId,
            }),
        });
        return response.ok;
    }
    catch {
        return false;
    }
};
exports.markWhatsAppMessageRead = markWhatsAppMessageRead;
const processInboundMessage = async (value, message) => {
    var _a, _b, _c, _d;
    const phoneNumberId = (0, whatsAppPolicy_1.normalizeWhatsAppId)((_a = value === null || value === void 0 ? void 0 : value.metadata) === null || _a === void 0 ? void 0 : _a.phone_number_id);
    const waId = (0, whatsAppPolicy_1.normalizeWhatsAppId)(message === null || message === void 0 ? void 0 : message.from);
    const providerMessageId = String((message === null || message === void 0 ? void 0 : message.id) || "").trim();
    if (!phoneNumberId || !waId || !providerMessageId)
        return;
    const duplicate = await WhatsAppMessage_1.default.exists({ providerMessageId });
    if (duplicate)
        return;
    const contact = Array.isArray(value === null || value === void 0 ? void 0 : value.contacts)
        ? value.contacts.find((item) => (0, whatsAppPolicy_1.normalizeWhatsAppId)(item === null || item === void 0 ? void 0 : item.wa_id) === waId)
        : undefined;
    const displayName = String(((_b = contact === null || contact === void 0 ? void 0 : contact.profile) === null || _b === void 0 ? void 0 : _b.name) || "").trim();
    const inboundAt = parseProviderTimestamp(message === null || message === void 0 ? void 0 : message.timestamp);
    const preview = (0, whatsAppPolicy_1.extractWhatsAppMessageText)(message).slice(0, 500);
    const conversationKey = (0, whatsAppPolicy_1.buildWhatsAppConversationKey)(phoneNumberId, waId);
    const conversation = await WhatsAppConversation_1.default.findOneAndUpdate({ conversationKey }, {
        $setOnInsert: {
            conversationKey,
            waId,
            phoneNumberId,
            status: "open",
        },
        $set: {
            ...(displayName ? { displayName } : {}),
            displayPhoneNumber: String(((_c = value === null || value === void 0 ? void 0 : value.metadata) === null || _c === void 0 ? void 0 : _c.display_phone_number) || ""),
        },
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    try {
        await WhatsAppMessage_1.default.create({
            conversationId: conversation._id,
            providerMessageId,
            contextMessageId: ((_d = message === null || message === void 0 ? void 0 : message.context) === null || _d === void 0 ? void 0 : _d.id) ? String(message.context.id) : undefined,
            direction: "inbound",
            type: String((message === null || message === void 0 ? void 0 : message.type) || "unsupported"),
            text: preview,
            status: "received",
            from: waId,
            to: phoneNumberId,
            providerTimestamp: inboundAt,
            ...getMediaData(message),
        });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) === 11000)
            return;
        throw error;
    }
    await WhatsAppConversation_1.default.findByIdAndUpdate(conversation._id, {
        $set: {
            lastMessagePreview: preview,
            lastMessageAt: inboundAt,
            lastDirection: "inbound",
            lastInboundAt: inboundAt,
            serviceWindowExpiresAt: (0, whatsAppPolicy_1.getWhatsAppServiceWindowExpiry)(inboundAt),
            status: conversation.status === "spam" ? "spam" : "open",
        },
        $inc: { unreadCount: 1 },
        $push: {
            activity: {
                $each: [
                    {
                        type: "inbound",
                        message: preview || `New ${(message === null || message === void 0 ? void 0 : message.type) || "message"}`,
                        at: inboundAt,
                    },
                ],
                $slice: -100,
            },
        },
    });
};
const processMessageStatus = async (status) => {
    const providerMessageId = String((status === null || status === void 0 ? void 0 : status.id) || "").trim();
    const nextStatus = String((status === null || status === void 0 ? void 0 : status.status) || "").trim();
    if (!providerMessageId || !["sent", "delivered", "read", "failed"].includes(nextStatus))
        return;
    const error = Array.isArray(status === null || status === void 0 ? void 0 : status.errors) ? status.errors[0] : undefined;
    await WhatsAppMessage_1.default.findOneAndUpdate({ providerMessageId }, {
        $set: {
            status: nextStatus,
            ...((error === null || error === void 0 ? void 0 : error.code) ? { errorCode: String(error.code) } : {}),
            ...((error === null || error === void 0 ? void 0 : error.title) || (error === null || error === void 0 ? void 0 : error.message)
                ? { errorMessage: String(error.title || error.message) }
                : {}),
        },
    });
};
const processWhatsAppWebhook = async (payload) => {
    if ((payload === null || payload === void 0 ? void 0 : payload.object) !== "whatsapp_business_account" || !Array.isArray(payload === null || payload === void 0 ? void 0 : payload.entry))
        return;
    for (const entry of payload.entry) {
        for (const change of Array.isArray(entry === null || entry === void 0 ? void 0 : entry.changes) ? entry.changes : []) {
            if ((change === null || change === void 0 ? void 0 : change.field) !== "messages")
                continue;
            const value = (change === null || change === void 0 ? void 0 : change.value) || {};
            for (const message of Array.isArray(value === null || value === void 0 ? void 0 : value.messages) ? value.messages : []) {
                await processInboundMessage(value, message);
            }
            for (const status of Array.isArray(value === null || value === void 0 ? void 0 : value.statuses) ? value.statuses : []) {
                await processMessageStatus(status);
            }
        }
    }
};
exports.processWhatsAppWebhook = processWhatsAppWebhook;
