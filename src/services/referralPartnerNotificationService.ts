import sendEmail from "../utils/sendEmail";
import {
  getWhatsAppTemplateLanguage,
  sendWhatsAppTemplateMessage,
} from "./whatsAppService";

export type ReferralContactChannel = "email" | "whatsapp" | "phone" | "sms" | "other";
export type ReferralNotificationKind = "approval" | "rejection";
export type ReferralNotificationStatus = "sent" | "delivered" | "read" | "failed" | "manual_required";

export interface ReferralNotificationDelivery {
  kind: ReferralNotificationKind;
  requestedChannel: ReferralContactChannel;
  deliveredChannel?: "email" | "whatsapp";
  status: ReferralNotificationStatus;
  fallbackUsed: boolean;
  providerMessageId?: string;
  error?: string;
  attemptedAt: Date;
  updatedAt: Date;
}

interface ReferralNotificationTarget {
  name: string;
  email?: string;
  phone?: string;
  preferredContact: ReferralContactChannel;
  locale: string;
  partnerId?: string;
}

interface ReferralNotificationContent {
  kind: ReferralNotificationKind;
  emailSubject: string;
  emailHtml: string;
  accessUrl?: string;
  shareUrl?: string;
  reason?: string;
}

interface ReferralNotificationDependencies {
  sendEmailMessage?: typeof sendEmail;
  sendWhatsAppTemplate?: typeof sendWhatsAppTemplateMessage;
}

const safeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "Unknown delivery error.");
  return message.replace(/[\r\n]+/g, " ").trim().slice(0, 500);
};

export const getReferralWhatsAppTemplate = ({
  target,
  content,
}: {
  target: ReferralNotificationTarget;
  content: ReferralNotificationContent;
}) => {
  const approval = content.kind === "approval";
  return {
    templateName: approval
      ? String(process.env.WHATSAPP_REFERRAL_APPROVED_TEMPLATE || "").trim()
      : String(process.env.WHATSAPP_REFERRAL_REJECTED_TEMPLATE || "").trim(),
    languageCode: getWhatsAppTemplateLanguage(target.locale),
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

export const deliverReferralPartnerNotification = async ({
  target,
  content,
  dependencies = {},
}: {
  target: ReferralNotificationTarget;
  content: ReferralNotificationContent;
  dependencies?: ReferralNotificationDependencies;
}): Promise<ReferralNotificationDelivery> => {
  const attemptedAt = new Date();
  const sendEmailMessage = dependencies.sendEmailMessage || sendEmail;
  const sendWhatsAppTemplate = dependencies.sendWhatsAppTemplate || sendWhatsAppTemplateMessage;
  const errors: string[] = [];

  if (target.preferredContact === "whatsapp" && target.phone) {
    try {
      const template = getReferralWhatsAppTemplate({ target, content });
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
    } catch (error) {
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
      } catch (error) {
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
    } catch (error) {
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
