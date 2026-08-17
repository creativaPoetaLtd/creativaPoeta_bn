import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverReferralPartnerNotification,
  getReferralWhatsAppTemplate,
} from "../services/referralPartnerNotificationService";
import {
  buildWhatsAppTemplatePayload,
  getWhatsAppTemplateLanguage,
} from "../services/whatsAppService";

process.env.WHATSAPP_REFERRAL_APPROVED_TEMPLATE = "cp_referral_application_approved";
process.env.WHATSAPP_REFERRAL_REJECTED_TEMPLATE = "cp_referral_application_rejected";

const approvalTarget = {
  name: "Example Partner",
  email: "partner@example.com",
  phone: "+32 470 12 34 56",
  preferredContact: "whatsapp" as const,
  locale: "fr-BE",
  partnerId: "CP-RP-ABC123",
};

const approvalContent = {
  kind: "approval" as const,
  emailSubject: "Approved",
  emailHtml: "<p>Approved</p>",
  accessUrl: "https://creativapoeta.com/private-link",
  shareUrl: "https://creativapoeta.com/public-link",
};

test("builds a normalized Meta template payload with deterministic parameters", () => {
  const payload = buildWhatsAppTemplatePayload({
    to: "+32 470 12 34 56",
    templateName: "cp_referral_application_approved",
    languageCode: "fr",
    bodyParameters: ["Example Partner", "CP-RP-ABC123"],
  });

  assert.equal(payload.to, "32470123456");
  assert.equal(payload.template.name, "cp_referral_application_approved");
  assert.equal(payload.template.language.code, "fr");
  assert.deepEqual(payload.template.components[0].parameters, [
    { type: "text", text: "Example Partner" },
    { type: "text", text: "CP-RP-ABC123" },
  ]);
  assert.equal(getWhatsAppTemplateLanguage("nl-BE"), "nl");
});

test("keeps the documented approval template parameter order", () => {
  const template = getReferralWhatsAppTemplate({
    target: approvalTarget,
    content: approvalContent,
  });

  assert.equal(template.templateName, "cp_referral_application_approved");
  assert.equal(template.languageCode, "fr");
  assert.deepEqual(template.bodyParameters, [
    "Example Partner",
    "CP-RP-ABC123",
    "https://creativapoeta.com/private-link",
    "https://creativapoeta.com/public-link",
  ]);
});

test("uses WhatsApp only when the preferred WhatsApp delivery succeeds", async () => {
  let emailCalls = 0;
  let whatsappCalls = 0;
  const delivery = await deliverReferralPartnerNotification({
    target: approvalTarget,
    content: approvalContent,
    dependencies: {
      sendWhatsAppTemplate: (async () => {
        whatsappCalls += 1;
        return { providerMessageId: "wamid.test", payload: {} };
      }) as any,
      sendEmailMessage: (async () => {
        emailCalls += 1;
        return {};
      }) as any,
    },
  });

  assert.equal(whatsappCalls, 1);
  assert.equal(emailCalls, 0);
  assert.equal(delivery.status, "sent");
  assert.equal(delivery.deliveredChannel, "whatsapp");
  assert.equal(delivery.providerMessageId, "wamid.test");
  assert.equal(delivery.fallbackUsed, false);
});

test("falls back to email and records the WhatsApp error", async () => {
  let emailCalls = 0;
  const delivery = await deliverReferralPartnerNotification({
    target: approvalTarget,
    content: approvalContent,
    dependencies: {
      sendWhatsAppTemplate: (async () => {
        throw new Error("Template is not approved");
      }) as any,
      sendEmailMessage: (async () => {
        emailCalls += 1;
        return {};
      }) as any,
    },
  });

  assert.equal(emailCalls, 1);
  assert.equal(delivery.status, "sent");
  assert.equal(delivery.deliveredChannel, "email");
  assert.equal(delivery.fallbackUsed, true);
  assert.match(delivery.error || "", /Template is not approved/);
});

test("records a failed WhatsApp notification when no fallback address exists", async () => {
  const delivery = await deliverReferralPartnerNotification({
    target: { ...approvalTarget, email: undefined },
    content: approvalContent,
    dependencies: {
      sendWhatsAppTemplate: (async () => {
        throw new Error("Meta unavailable");
      }) as any,
    },
  });

  assert.equal(delivery.status, "failed");
  assert.equal(delivery.deliveredChannel, undefined);
  assert.match(delivery.error || "", /Meta unavailable/);
});

test("marks non-automated contact channels for manual handling", async () => {
  const delivery = await deliverReferralPartnerNotification({
    target: { ...approvalTarget, preferredContact: "phone" },
    content: approvalContent,
  });

  assert.equal(delivery.status, "manual_required");
  assert.equal(delivery.requestedChannel, "phone");
});
