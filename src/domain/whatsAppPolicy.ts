import crypto from "crypto";

export const WHATSAPP_SERVICE_WINDOW_HOURS = 24;
export const WHATSAPP_MAX_TEXT_LENGTH = 4096;

export const normalizeWhatsAppId = (value: unknown) =>
  String(value || "")
    .replace(/[^0-9]/g, "")
    .trim();

export const buildWhatsAppConversationKey = (phoneNumberId: string, waId: string) =>
  `${normalizeWhatsAppId(phoneNumberId)}:${normalizeWhatsAppId(waId)}`;

export const getWhatsAppServiceWindowExpiry = (inboundAt: Date) =>
  new Date(inboundAt.getTime() + WHATSAPP_SERVICE_WINDOW_HOURS * 60 * 60 * 1000);

export const isWhatsAppServiceWindowOpen = (
  expiresAt?: Date | string | null,
  now = new Date()
) => {
  if (!expiresAt) return false;
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() > now.getTime();
};

export const validateWhatsAppText = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) throw new Error("A message is required.");
  if (text.length > WHATSAPP_MAX_TEXT_LENGTH) {
    throw new Error(`The message cannot exceed ${WHATSAPP_MAX_TEXT_LENGTH} characters.`);
  }
  return text;
};

export const verifyWhatsAppSignature = (
  rawBody: Buffer,
  signatureHeader: unknown,
  appSecret: string
) => {
  if (!rawBody?.length || !appSecret || typeof signatureHeader !== "string") return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const receivedHex = signatureHeader.slice("sha256=".length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(receivedHex)) return false;

  const expectedHex = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = Buffer.from(receivedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
};

export const extractWhatsAppMessageText = (message: any) => {
  if (message?.type === "text") return String(message?.text?.body || "").trim();
  if (message?.type === "button") return String(message?.button?.text || "").trim();
  if (message?.type === "interactive") {
    return String(
      message?.interactive?.button_reply?.title ||
        message?.interactive?.list_reply?.title ||
        "Interactive response"
    ).trim();
  }
  if (message?.type === "location") {
    const latitude = message?.location?.latitude;
    const longitude = message?.location?.longitude;
    return latitude != null && longitude != null
      ? `Location: ${latitude}, ${longitude}`
      : "Shared location";
  }
  if (message?.type === "contacts") return "Shared contact";
  return String(message?.[message?.type]?.caption || `[${message?.type || "unsupported"}]`).trim();
};
