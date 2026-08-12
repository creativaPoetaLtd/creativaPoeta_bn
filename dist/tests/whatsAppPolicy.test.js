"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_test_1 = __importDefault(require("node:test"));
const whatsAppPolicy_1 = require("../domain/whatsAppPolicy");
(0, node_test_1.default)("normalizes WhatsApp identifiers and builds a stable conversation key", () => {
    strict_1.default.equal((0, whatsAppPolicy_1.normalizeWhatsAppId)("+32 470 12 34 56"), "32470123456");
    strict_1.default.equal((0, whatsAppPolicy_1.buildWhatsAppConversationKey)("123", "+32 470"), "123:32470");
});
(0, node_test_1.default)("validates Meta HMAC signatures without accepting malformed values", () => {
    const rawBody = Buffer.from(JSON.stringify({ object: "whatsapp_business_account" }));
    const secret = "test-app-secret";
    const signature = `sha256=${node_crypto_1.default.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    strict_1.default.equal((0, whatsAppPolicy_1.verifyWhatsAppSignature)(rawBody, signature, secret), true);
    strict_1.default.equal((0, whatsAppPolicy_1.verifyWhatsAppSignature)(rawBody, `${signature.slice(0, -1)}0`, secret), false);
    strict_1.default.equal((0, whatsAppPolicy_1.verifyWhatsAppSignature)(rawBody, "invalid", secret), false);
});
(0, node_test_1.default)("opens a 24-hour service window from the latest inbound message", () => {
    const inboundAt = new Date("2026-08-12T08:00:00.000Z");
    const expiry = (0, whatsAppPolicy_1.getWhatsAppServiceWindowExpiry)(inboundAt);
    strict_1.default.equal(expiry.toISOString(), "2026-08-13T08:00:00.000Z");
    strict_1.default.equal((0, whatsAppPolicy_1.isWhatsAppServiceWindowOpen)(expiry, new Date("2026-08-13T07:59:59.000Z")), true);
    strict_1.default.equal((0, whatsAppPolicy_1.isWhatsAppServiceWindowOpen)(expiry, new Date("2026-08-13T08:00:00.000Z")), false);
});
(0, node_test_1.default)("extracts supported message previews and enforces text length", () => {
    strict_1.default.equal((0, whatsAppPolicy_1.extractWhatsAppMessageText)({ type: "text", text: { body: " Bonjour " } }), "Bonjour");
    strict_1.default.equal((0, whatsAppPolicy_1.extractWhatsAppMessageText)({
        type: "interactive",
        interactive: { button_reply: { title: "Oui" } },
    }), "Oui");
    strict_1.default.equal((0, whatsAppPolicy_1.validateWhatsAppText)(" Bonjour "), "Bonjour");
    strict_1.default.throws(() => (0, whatsAppPolicy_1.validateWhatsAppText)(""), /required/i);
    strict_1.default.throws(() => (0, whatsAppPolicy_1.validateWhatsAppText)("x".repeat(4097)), /4096/);
});
