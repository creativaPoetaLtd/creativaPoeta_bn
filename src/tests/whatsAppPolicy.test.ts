import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  buildWhatsAppConversationKey,
  extractWhatsAppMessageText,
  getWhatsAppServiceWindowExpiry,
  isWhatsAppServiceWindowOpen,
  normalizeWhatsAppId,
  validateWhatsAppText,
  verifyWhatsAppSignature,
} from "../domain/whatsAppPolicy";

test("normalizes WhatsApp identifiers and builds a stable conversation key", () => {
  assert.equal(normalizeWhatsAppId("+32 470 12 34 56"), "32470123456");
  assert.equal(buildWhatsAppConversationKey("123", "+32 470"), "123:32470");
});

test("validates Meta HMAC signatures without accepting malformed values", () => {
  const rawBody = Buffer.from(JSON.stringify({ object: "whatsapp_business_account" }));
  const secret = "test-app-secret";
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  assert.equal(verifyWhatsAppSignature(rawBody, signature, secret), true);
  assert.equal(verifyWhatsAppSignature(rawBody, `${signature.slice(0, -1)}0`, secret), false);
  assert.equal(verifyWhatsAppSignature(rawBody, "invalid", secret), false);
});

test("opens a 24-hour service window from the latest inbound message", () => {
  const inboundAt = new Date("2026-08-12T08:00:00.000Z");
  const expiry = getWhatsAppServiceWindowExpiry(inboundAt);

  assert.equal(expiry.toISOString(), "2026-08-13T08:00:00.000Z");
  assert.equal(isWhatsAppServiceWindowOpen(expiry, new Date("2026-08-13T07:59:59.000Z")), true);
  assert.equal(isWhatsAppServiceWindowOpen(expiry, new Date("2026-08-13T08:00:00.000Z")), false);
});

test("extracts supported message previews and enforces text length", () => {
  assert.equal(extractWhatsAppMessageText({ type: "text", text: { body: " Bonjour " } }), "Bonjour");
  assert.equal(
    extractWhatsAppMessageText({
      type: "interactive",
      interactive: { button_reply: { title: "Oui" } },
    }),
    "Oui"
  );
  assert.equal(validateWhatsAppText(" Bonjour "), "Bonjour");
  assert.throws(() => validateWhatsAppText(""), /required/i);
  assert.throws(() => validateWhatsAppText("x".repeat(4097)), /4096/);
});
