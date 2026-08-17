import WhatsAppConversation from "../models/WhatsAppConversation";
import WhatsAppMessage from "../models/WhatsAppMessage";
import ReferralPartner from "../models/ReferralPartner";
import {
  buildWhatsAppConversationKey,
  extractWhatsAppMessageText,
  getWhatsAppServiceWindowExpiry,
  normalizeWhatsAppId,
} from "../domain/whatsAppPolicy";

const getGraphApiVersion = () => process.env.WHATSAPP_GRAPH_API_VERSION || "v25.0";

const getMediaData = (message: any) => {
  const content = message?.[message?.type] || {};
  return {
    mediaId: content?.id ? String(content.id) : undefined,
    mediaMimeType: content?.mime_type ? String(content.mime_type) : undefined,
    mediaFilename: content?.filename ? String(content.filename) : undefined,
    mediaCaption: content?.caption ? String(content.caption) : undefined,
  };
};

const parseProviderTimestamp = (value: unknown) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
};

export const getWhatsAppConfiguration = () => ({
  configured: Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_APP_SECRET &&
      process.env.WHATSAPP_VERIFY_TOKEN
  ),
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  displayPhoneNumber: process.env.WHATSAPP_DISPLAY_PHONE_NUMBER || "",
  graphApiVersion: getGraphApiVersion(),
});

export const sendWhatsAppTextMessage = async (to: string, body: string) => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API is not configured.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${getGraphApiVersion()}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizeWhatsAppId(to),
        type: "text",
        text: { preview_url: false, body },
      }),
    }
  );

  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    const providerMessage = payload?.error?.message || `Meta API returned ${response.status}.`;
    throw new Error(providerMessage);
  }

  const providerMessageId = String(payload?.messages?.[0]?.id || "");
  if (!providerMessageId) throw new Error("Meta did not return a message identifier.");
  return { providerMessageId, payload };
};

const templateLanguageDefaults: Record<string, string> = {
  en: "en_US",
  fr: "fr",
  nl: "nl",
  rw: "rw_RW",
};

export const getWhatsAppTemplateLanguage = (locale: string) => {
  const normalizedLocale = String(locale || "en").trim().toLowerCase();
  const baseLocale = normalizedLocale.split(/[-_]/)[0] || "en";
  const environmentKey = `WHATSAPP_TEMPLATE_LANGUAGE_${baseLocale.toUpperCase()}`;
  return process.env[environmentKey] || templateLanguageDefaults[baseLocale] || templateLanguageDefaults.en;
};

export const buildWhatsAppTemplatePayload = ({
  to,
  templateName,
  languageCode,
  bodyParameters,
}: {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
}) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: normalizeWhatsAppId(to),
  type: "template",
  template: {
    name: templateName,
    language: { policy: "deterministic", code: languageCode },
    components: bodyParameters.length
      ? [{
          type: "body",
          parameters: bodyParameters.map((text) => ({ type: "text", text: String(text) })),
        }]
      : [],
  },
});

export const sendWhatsAppTemplateMessage = async ({
  to,
  templateName,
  languageCode,
  bodyParameters,
}: {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
}) => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API is not configured.");
  }
  if (!templateName) {
    throw new Error("The WhatsApp message template is not configured.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${getGraphApiVersion()}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildWhatsAppTemplatePayload({
        to,
        templateName,
        languageCode,
        bodyParameters,
      })),
    }
  );

  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    const providerMessage = payload?.error?.message || `Meta API returned ${response.status}.`;
    throw new Error(providerMessage);
  }

  const providerMessageId = String(payload?.messages?.[0]?.id || "");
  if (!providerMessageId) throw new Error("Meta did not return a message identifier.");
  return { providerMessageId, payload };
};

export const markWhatsAppMessageRead = async (providerMessageId?: string) => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId || !providerMessageId) return false;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${getGraphApiVersion()}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
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
      }
    );
    return response.ok;
  } catch {
    return false;
  }
};

const processInboundMessage = async (value: any, message: any) => {
  const phoneNumberId = normalizeWhatsAppId(value?.metadata?.phone_number_id);
  const waId = normalizeWhatsAppId(message?.from);
  const providerMessageId = String(message?.id || "").trim();
  if (!phoneNumberId || !waId || !providerMessageId) return;

  const duplicate = await WhatsAppMessage.exists({ providerMessageId });
  if (duplicate) return;

  const contact = Array.isArray(value?.contacts)
    ? value.contacts.find((item: any) => normalizeWhatsAppId(item?.wa_id) === waId)
    : undefined;
  const displayName = String(contact?.profile?.name || "").trim();
  const inboundAt = parseProviderTimestamp(message?.timestamp);
  const preview = extractWhatsAppMessageText(message).slice(0, 500);
  const conversationKey = buildWhatsAppConversationKey(phoneNumberId, waId);

  const conversation = await WhatsAppConversation.findOneAndUpdate(
    { conversationKey },
    {
      $setOnInsert: {
        conversationKey,
        waId,
        phoneNumberId,
        status: "open",
      },
      $set: {
        ...(displayName ? { displayName } : {}),
        displayPhoneNumber: String(value?.metadata?.display_phone_number || ""),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  try {
    await WhatsAppMessage.create({
      conversationId: conversation._id,
      providerMessageId,
      contextMessageId: message?.context?.id ? String(message.context.id) : undefined,
      direction: "inbound",
      type: String(message?.type || "unsupported"),
      text: preview,
      status: "received",
      from: waId,
      to: phoneNumberId,
      providerTimestamp: inboundAt,
      ...getMediaData(message),
    });
  } catch (error: any) {
    if (error?.code === 11000) return;
    throw error;
  }

  await WhatsAppConversation.findByIdAndUpdate(conversation._id, {
    $set: {
      lastMessagePreview: preview,
      lastMessageAt: inboundAt,
      lastDirection: "inbound",
      lastInboundAt: inboundAt,
      serviceWindowExpiresAt: getWhatsAppServiceWindowExpiry(inboundAt),
      status: conversation.status === "spam" ? "spam" : "open",
    },
    $inc: { unreadCount: 1 },
    $push: {
      activity: {
        $each: [
          {
            type: "inbound",
            message: preview || `New ${message?.type || "message"}`,
            at: inboundAt,
          },
        ],
        $slice: -100,
      },
    },
  });
};

const processMessageStatus = async (status: any) => {
  const providerMessageId = String(status?.id || "").trim();
  const nextStatus = String(status?.status || "").trim();
  if (!providerMessageId || !["sent", "delivered", "read", "failed"].includes(nextStatus)) return;

  const error = Array.isArray(status?.errors) ? status.errors[0] : undefined;
  await WhatsAppMessage.findOneAndUpdate(
    { providerMessageId },
    {
      $set: {
        status: nextStatus,
        ...(error?.code ? { errorCode: String(error.code) } : {}),
        ...(error?.title || error?.message
          ? { errorMessage: String(error.title || error.message) }
          : {}),
      },
    }
  );

  await ReferralPartner.findOneAndUpdate(
    { "lastNotification.providerMessageId": providerMessageId },
    {
      $set: {
        "lastNotification.status": nextStatus,
        "lastNotification.updatedAt": new Date(),
        ...(nextStatus === "failed"
          ? {
              "lastNotification.error": String(
                error?.title || error?.message || "WhatsApp delivery failed."
              ).slice(0, 500),
            }
          : {}),
      },
    }
  );
};

export const processWhatsAppWebhook = async (payload: any) => {
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload?.entry)) return;

  for (const entry of payload.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "messages") continue;
      const value = change?.value || {};
      for (const message of Array.isArray(value?.messages) ? value.messages : []) {
        await processInboundMessage(value, message);
      }
      for (const status of Array.isArray(value?.statuses) ? value.statuses : []) {
        await processMessageStatus(status);
      }
    }
  }
};
