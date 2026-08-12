"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractWhatsAppMessageText = exports.verifyWhatsAppSignature = exports.validateWhatsAppText = exports.isWhatsAppServiceWindowOpen = exports.getWhatsAppServiceWindowExpiry = exports.buildWhatsAppConversationKey = exports.normalizeWhatsAppId = exports.WHATSAPP_MAX_TEXT_LENGTH = exports.WHATSAPP_SERVICE_WINDOW_HOURS = void 0;
const crypto_1 = __importDefault(require("crypto"));
exports.WHATSAPP_SERVICE_WINDOW_HOURS = 24;
exports.WHATSAPP_MAX_TEXT_LENGTH = 4096;
const normalizeWhatsAppId = (value) => String(value || "")
    .replace(/[^0-9]/g, "")
    .trim();
exports.normalizeWhatsAppId = normalizeWhatsAppId;
const buildWhatsAppConversationKey = (phoneNumberId, waId) => `${(0, exports.normalizeWhatsAppId)(phoneNumberId)}:${(0, exports.normalizeWhatsAppId)(waId)}`;
exports.buildWhatsAppConversationKey = buildWhatsAppConversationKey;
const getWhatsAppServiceWindowExpiry = (inboundAt) => new Date(inboundAt.getTime() + exports.WHATSAPP_SERVICE_WINDOW_HOURS * 60 * 60 * 1000);
exports.getWhatsAppServiceWindowExpiry = getWhatsAppServiceWindowExpiry;
const isWhatsAppServiceWindowOpen = (expiresAt, now = new Date()) => {
    if (!expiresAt)
        return false;
    const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    return !Number.isNaN(expiry.getTime()) && expiry.getTime() > now.getTime();
};
exports.isWhatsAppServiceWindowOpen = isWhatsAppServiceWindowOpen;
const validateWhatsAppText = (value) => {
    const text = String(value || "").trim();
    if (!text)
        throw new Error("A message is required.");
    if (text.length > exports.WHATSAPP_MAX_TEXT_LENGTH) {
        throw new Error(`The message cannot exceed ${exports.WHATSAPP_MAX_TEXT_LENGTH} characters.`);
    }
    return text;
};
exports.validateWhatsAppText = validateWhatsAppText;
const verifyWhatsAppSignature = (rawBody, signatureHeader, appSecret) => {
    if (!(rawBody === null || rawBody === void 0 ? void 0 : rawBody.length) || !appSecret || typeof signatureHeader !== "string")
        return false;
    if (!signatureHeader.startsWith("sha256="))
        return false;
    const receivedHex = signatureHeader.slice("sha256=".length).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(receivedHex))
        return false;
    const expectedHex = crypto_1.default.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const received = Buffer.from(receivedHex, "hex");
    const expected = Buffer.from(expectedHex, "hex");
    return received.length === expected.length && crypto_1.default.timingSafeEqual(received, expected);
};
exports.verifyWhatsAppSignature = verifyWhatsAppSignature;
const extractWhatsAppMessageText = (message) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if ((message === null || message === void 0 ? void 0 : message.type) === "text")
        return String(((_a = message === null || message === void 0 ? void 0 : message.text) === null || _a === void 0 ? void 0 : _a.body) || "").trim();
    if ((message === null || message === void 0 ? void 0 : message.type) === "button")
        return String(((_b = message === null || message === void 0 ? void 0 : message.button) === null || _b === void 0 ? void 0 : _b.text) || "").trim();
    if ((message === null || message === void 0 ? void 0 : message.type) === "interactive") {
        return String(((_d = (_c = message === null || message === void 0 ? void 0 : message.interactive) === null || _c === void 0 ? void 0 : _c.button_reply) === null || _d === void 0 ? void 0 : _d.title) ||
            ((_f = (_e = message === null || message === void 0 ? void 0 : message.interactive) === null || _e === void 0 ? void 0 : _e.list_reply) === null || _f === void 0 ? void 0 : _f.title) ||
            "Interactive response").trim();
    }
    if ((message === null || message === void 0 ? void 0 : message.type) === "location") {
        const latitude = (_g = message === null || message === void 0 ? void 0 : message.location) === null || _g === void 0 ? void 0 : _g.latitude;
        const longitude = (_h = message === null || message === void 0 ? void 0 : message.location) === null || _h === void 0 ? void 0 : _h.longitude;
        return latitude != null && longitude != null
            ? `Location: ${latitude}, ${longitude}`
            : "Shared location";
    }
    if ((message === null || message === void 0 ? void 0 : message.type) === "contacts")
        return "Shared contact";
    return String(((_j = message === null || message === void 0 ? void 0 : message[message === null || message === void 0 ? void 0 : message.type]) === null || _j === void 0 ? void 0 : _j.caption) || `[${(message === null || message === void 0 ? void 0 : message.type) || "unsupported"}]`).trim();
};
exports.extractWhatsAppMessageText = extractWhatsAppMessageText;
