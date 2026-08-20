import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import ReferralLead, { ReferralLeadStatus } from "../models/ReferralLead";
import ReferralPartner, { ReferralPartnerStatus } from "../models/ReferralPartner";
import ReferralReward, { ReferralRewardStatus } from "../models/ReferralReward";
import { buildPrivatePartnerAccessUrl, calculateReferralReward, canTransitionReferralReward } from "../domain/referralProgramPolicy";
import { consumeReferralRateLimit } from "../services/referralRateLimitService";
import {
  deliverReferralPartnerNotification,
  ReferralNotificationDelivery,
} from "../services/referralPartnerNotificationService";
import { sendAdminNotificationEmail as sendAdminNotice } from "../utils/adminNotificationEmail";
import { normalizeCommunicationLocale } from "../utils/communicationLocale";

const TERMS_VERSION = "2026-08-11";
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://creativapoeta.com").replace(/\/$/, "");

const partnerStatuses: ReferralPartnerStatus[] = ["pending", "approved", "active", "rejected", "suspended", "closed"];
const leadStatuses: ReferralLeadStatus[] = ["submitted", "waiting_for_introduction", "under_review", "accepted", "duplicate", "rejected", "contacted", "qualified", "proposal_sent", "won", "lost"];
const rewardStatuses: ReferralRewardStatus[] = ["waiting_client_payment", "earned", "approved", "scheduled", "paid", "cancelled"];

const clean = (value: unknown, maxLength = 5000) => String(value || "").trim().slice(0, maxLength);
const cleanEmail = (value: unknown) => clean(value, 320).toLowerCase();
const cleanPhone = (value: unknown) => {
  const raw = clean(value, 80);
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits ? `${raw.startsWith("+") ? "+" : ""}${digits}` : "";
};
const contactPreferences = ["email", "whatsapp"] as const;
type ContactPreference = typeof contactPreferences[number];
const cleanContactPreference = (value: unknown, hasEmail: boolean, hasPhone: boolean): ContactPreference => {
  const candidate = clean(value, 20) as ContactPreference;
  if (!contactPreferences.includes(candidate)) return hasEmail ? "email" : "whatsapp";
  if (candidate === "email" && !hasEmail && hasPhone) return "whatsapp";
  if (candidate === "whatsapp" && !hasPhone && hasEmail) return "email";
  return candidate;
};
const escapeHtml = (value: unknown) => clean(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#039;");
const emailIsValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phoneLookup = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return new RegExp(`^\\D*${digits.split("").map(escapeRegex).join("\\D*")}\\D*$`);
};
const hashSecret = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const createSecret = () => crypto.randomBytes(32).toString("hex");
const getAdminEmail = (req: Request) => cleanEmail(req.user?.email);
const getAdminName = (req: Request) => clean(req.user?.name || req.user?.email || "Admin", 200);

const secretsMatch = (plain: string, hash?: string) => {
  if (!plain || !hash) return false;
  const actual = Buffer.from(hashSecret(plain), "hex");
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

const createPartnerId = async (program: "referral" | "business") => {
  const prefix = program === "business" ? "CP-BP" : "CP-RP";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    if (!(await ReferralPartner.exists({ partnerId: candidate }))) return candidate;
  }
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
};

const createReferralCode = async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = crypto.randomBytes(9).toString("base64url");
    if (!(await ReferralPartner.exists({ referralCode: candidate }))) return candidate;
  }
  return crypto.randomUUID().replace(/-/g, "");
};

const renderNonClickableUrl = (url: string) => {
  const escapedUrl = escapeHtml(url);
  const schemeSeparator = escapedUrl.indexOf("//");
  if (schemeSeparator < 0) return escapedUrl;

  return `<span>${escapedUrl.slice(0, schemeSeparator)}</span><span>${escapedUrl.slice(schemeSeparator)}</span>`;
};

const partnerNotificationCopy = {
  en: {
    approvalSubject: "Your Creativa Poeta client-introduction program access",
    approvedTitle: "Your application has been approved",
    hello: "Hello",
    welcome: "Welcome to the Creativa Poeta client-introduction program. The two items below have different purposes.",
    privateLabel: "Your private access",
    privateTitle: "Present a client to Creativa Poeta",
    privateText: "This personal, secure link is for you only. Open it when you have found a person or company that needs digital services, then use the protected form to send us their details. Do not share this link.",
    privateButton: "Open my secure form",
    shareLabel: "Link to copy and share",
    shareTitle: "Invite a potential client to complete the request",
    shareText: "This public link is not a form for you. Copy it and send it to a person or company interested in Creativa Poeta services. Their request will automatically be associated with your Partner ID.",
    shareHelp: "Select the link above, copy it, then share it by WhatsApp, email, SMS or social media.",
    partnerId: "Partner ID",
    rejectionSubject: "Update on your Creativa Poeta partner application",
    rejectedTitle: "Update on your application",
    rejectedText: "We reviewed your application to join the Creativa Poeta client-introduction program. It has not been accepted at this time.",
    reason: "Reason",
  },
  fr: {
    approvalSubject: "Votre accès au programme d’apporteurs de clients Creativa Poeta",
    approvedTitle: "Votre candidature a été approuvée",
    hello: "Bonjour",
    welcome: "Bienvenue dans le programme d’apporteurs de clients Creativa Poeta. Les deux éléments ci-dessous ont des fonctions différentes.",
    privateLabel: "Votre accès privé",
    privateTitle: "Présenter un client à Creativa Poeta",
    privateText: "Ce lien personnel et sécurisé est réservé à votre usage. Ouvrez-le lorsque vous trouvez une personne ou une entreprise qui recherche des services numériques, puis utilisez le formulaire protégé pour nous transmettre ses informations. Ne partagez pas ce lien.",
    privateButton: "Ouvrir mon formulaire sécurisé",
    shareLabel: "Lien à copier et à partager",
    shareTitle: "Inviter un client potentiel à compléter sa demande",
    shareText: "Ce lien public n’est pas un formulaire pour vous. Copiez-le et envoyez-le à une personne ou une entreprise intéressée par les services de Creativa Poeta. Sa demande sera automatiquement associée à votre identifiant partenaire.",
    shareHelp: "Sélectionnez le lien ci-dessus, copiez-le, puis partagez-le par WhatsApp, email, SMS ou réseau social.",
    partnerId: "Identifiant partenaire",
    rejectionSubject: "Mise à jour de votre candidature partenaire Creativa Poeta",
    rejectedTitle: "Mise à jour de votre candidature",
    rejectedText: "Nous avons examiné votre candidature au programme d’apporteurs de clients Creativa Poeta. Elle n’a pas été retenue pour le moment.",
    reason: "Motif",
  },
  nl: {
    approvalSubject: "Uw toegang tot het klantenaanbrengprogramma van Creativa Poeta",
    approvedTitle: "Uw aanvraag is goedgekeurd",
    hello: "Hallo",
    welcome: "Welkom bij het klantenaanbrengprogramma van Creativa Poeta. De twee onderstaande links hebben elk een ander doel.",
    privateLabel: "Uw privétoegang",
    privateTitle: "Stel een klant voor aan Creativa Poeta",
    privateText: "Deze persoonlijke, beveiligde link is uitsluitend voor u. Open hem wanneer u een persoon of bedrijf kent dat digitale diensten nodig heeft en stuur ons de gegevens via het beveiligde formulier. Deel deze link niet.",
    privateButton: "Mijn beveiligde formulier openen",
    shareLabel: "Link om te kopiëren en te delen",
    shareTitle: "Nodig een mogelijke klant uit om de aanvraag in te vullen",
    shareText: "Deze openbare link is geen formulier voor u. Kopieer hem en stuur hem naar een persoon of bedrijf met interesse in de diensten van Creativa Poeta. De aanvraag wordt automatisch aan uw partner-ID gekoppeld.",
    shareHelp: "Selecteer de bovenstaande link, kopieer hem en deel hem via WhatsApp, e-mail, sms of sociale media.",
    partnerId: "Partner-ID",
    rejectionSubject: "Update over uw partneraanvraag bij Creativa Poeta",
    rejectedTitle: "Update over uw aanvraag",
    rejectedText: "We hebben uw aanvraag voor het klantenaanbrengprogramma van Creativa Poeta beoordeeld. Uw aanvraag is momenteel niet aanvaard.",
    reason: "Reden",
  },
  rw: {
    approvalSubject: "Uburenganzira bwawe muri gahunda yo kuzana abakiriya ya Creativa Poeta",
    approvedTitle: "Ubusabe bwawe bwemejwe",
    hello: "Muraho",
    welcome: "Murakaza neza muri gahunda ya Creativa Poeta yo kuzana abakiriya. Ibyombi bikurikira bifite imirimo itandukanye.",
    privateLabel: "Uburenganzira bwawe bwite",
    privateTitle: "Menyesha Creativa Poeta umukiriya",
    privateText: "Iyi linki yihariye kandi irinzwe ni iyawe gusa. Yifungure igihe wabonye umuntu cyangwa ikigo gikeneye serivisi z’ikoranabuhanga, maze utwoherereze amakuru yabo ukoresheje ifishi irinzwe. Ntukayihe undi muntu.",
    privateButton: "Fungura ifishi yanjye irinzwe",
    shareLabel: "Linki yo gukoporora no gusangiza abandi",
    shareTitle: "Saba umukiriya ushobora gukorana natwe kuzuza ubusabe",
    shareText: "Iyi linki rusange si ifishi yawe. Yikoporore maze uyihe umuntu cyangwa ikigo gishaka serivisi za Creativa Poeta. Ubusabe bwabo buzahuzwa n’indangamuntu yawe y’umufatanyabikorwa.",
    shareHelp: "Hitamo linki iri hejuru, uyikoporore, hanyuma uyisangize kuri WhatsApp, email, SMS cyangwa imbuga nkoranyambaga.",
    partnerId: "Indangamuntu y’umufatanyabikorwa",
    rejectionSubject: "Amakuru mashya ku busabe bwawe bwo gufatanya na Creativa Poeta",
    rejectedTitle: "Amakuru mashya ku busabe bwawe",
    rejectedText: "Twasuzumye ubusabe bwawe bwo kwinjira muri gahunda ya Creativa Poeta yo kuzana abakiriya. Ntabwo bwemejwe muri iki gihe.",
    reason: "Impamvu",
  },
} as const;

type PartnerNotificationLocale = keyof typeof partnerNotificationCopy;

export const getPartnerNotificationCopy = (locale?: string) => {
  const normalized = normalizeCommunicationLocale(locale) as PartnerNotificationLocale;
  return partnerNotificationCopy[normalized] || partnerNotificationCopy.en;
};

export const renderPartnerApprovalEmail = ({
  partnerName,
  partnerId,
  accessUrl,
  shareUrl,
  locale = "en",
}: {
  partnerName: string;
  partnerId: string;
  accessUrl: string;
  shareUrl: string;
  locale?: string;
}) => {
  const copy = getPartnerNotificationCopy(locale);
  return `
  <h2 style="margin:0 0 18px;color:#101828;font-size:26px;line-height:1.25;">${copy.approvedTitle}</h2>
  <p style="margin:0 0 14px;">${copy.hello} ${escapeHtml(partnerName)},</p>
  <p style="margin:0 0 22px;">${copy.welcome}</p>

  <div style="margin:0 0 18px;padding:20px;border:1px solid #d0d5dd;border-radius:14px;background:#f8fafc;">
    <div style="margin:0 0 6px;color:#b4852b;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">${copy.privateLabel}</div>
    <h3 style="margin:0 0 8px;color:#101828;font-size:19px;">${copy.privateTitle}</h3>
    <p style="margin:0 0 16px;color:#475467;">${copy.privateText}</p>
    <a href="${escapeHtml(accessUrl)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#071a33;color:#ffffff;text-decoration:none;font-weight:800;">${copy.privateButton}&nbsp;&nbsp;&rarr;</a>
  </div>

  <div style="margin:0 0 18px;padding:20px;border:1px solid #e3b323;border-radius:14px;background:#fffaf0;">
    <div style="margin:0 0 6px;color:#8a6413;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">${copy.shareLabel}</div>
    <h3 style="margin:0 0 8px;color:#101828;font-size:19px;">${copy.shareTitle}</h3>
    <p style="margin:0 0 14px;color:#475467;">${copy.shareText}</p>
    <div style="padding:13px 14px;border:1px dashed #b4852b;border-radius:9px;background:#ffffff;color:#182640;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.55;overflow-wrap:anywhere;user-select:all;">${renderNonClickableUrl(shareUrl)}</div>
    <div style="margin:10px 0 0;color:#8a6413;font-size:13px;font-weight:800;">&#10697;&nbsp; ${copy.shareHelp}</div>
  </div>

  <p style="margin:0;color:#475467;"><strong>${copy.partnerId}:</strong> ${escapeHtml(partnerId)}</p>
`;
};

export const renderPartnerApprovalMessage = ({
  partnerName,
  partnerId,
  accessUrl,
  shareUrl,
  locale = "en",
}: {
  partnerName: string;
  partnerId: string;
  accessUrl: string;
  shareUrl: string;
  locale?: string;
}) => {
  const copy = getPartnerNotificationCopy(locale);
  return [
    `${copy.hello} ${partnerName},`,
    "",
    copy.welcome,
    "",
    `${copy.partnerId}: ${partnerId}`,
    "",
    `${copy.privateTitle}`,
    copy.privateText,
    accessUrl,
    "",
    `${copy.shareTitle}`,
    copy.shareText,
    shareUrl,
    "",
    copy.shareHelp,
    "",
    "Creativa Poeta",
  ].join("\n");
};

const buildPartnerAccessPackage = (partner: {
  name: string;
  partnerId?: string;
  referralCode?: string;
  locale?: string;
}, plainSecret: string) => {
  const accessUrl = buildPrivatePartnerAccessUrl(FRONTEND_URL, partner.partnerId || "", plainSecret);
  const shareUrl = `${FRONTEND_URL}/referral-partners?ref=${encodeURIComponent(partner.referralCode || "")}#referred-business`;
  const copy = getPartnerNotificationCopy(partner.locale);
  return {
    accessUrl,
    shareUrl,
    subject: copy.approvalSubject,
    message: renderPartnerApprovalMessage({
      partnerName: partner.name,
      partnerId: partner.partnerId || "",
      accessUrl,
      shareUrl,
      locale: partner.locale,
    }),
  };
};

export const renderPartnerRejectionEmail = ({
  partnerName,
  reason,
  locale = "en",
}: {
  partnerName: string;
  reason: string;
  locale?: string;
}) => {
  const copy = getPartnerNotificationCopy(locale);
  return `<h2 style="margin:0 0 18px;color:#101828;font-size:26px;line-height:1.25;">${copy.rejectedTitle}</h2><p>${copy.hello} ${escapeHtml(partnerName)},</p><p>${copy.rejectedText}</p><p><strong>${copy.reason}:</strong> ${escapeHtml(reason)}</p>`;
};

export const applyToReferralProgram = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (clean(req.body?.websiteConfirmation, 200)) {
      res.status(201).json({ message: "Application received.", status: "pending" });
      return;
    }
    if (!(await consumeReferralRateLimit(req, res, "partner_application"))) {
      res.status(429).json({ message: "Too many requests. Please try again later." });
      return;
    }

    const name = clean(req.body?.name, 200);
    const email = cleanEmail(req.body?.email);
    const phone = cleanPhone(req.body?.phone);
    const preferredContact = cleanContactPreference(req.body?.preferredContact, Boolean(email), Boolean(phone));
    const country = clean(req.body?.country, 120);
    const locale = normalizeCommunicationLocale(req.body?.locale);
    const profileType = clean(req.body?.profileType, 120);
    const program = req.body?.program === "business" ? "business" : "referral";
    const website = clean(req.body?.website, 500);
    const networkDescription = clean(req.body?.networkDescription, 2000);
    const termsAccepted = req.body?.termsAccepted === true;

    if (!name || (!email && !phone) || (email && !emailIsValid(email)) || !country || !profileType || !termsAccepted) {
      res.status(400).json({ message: "Required fields or terms acceptance are missing." });
      return;
    }

    const contactFilters: Record<string, unknown>[] = [];
    if (email) contactFilters.push({ email });
    if (phone) contactFilters.push({ phone: phoneLookup(phone) });
    const existing = await ReferralPartner.findOne({
      $or: contactFilters,
    });
    if (existing) {
      res.status(200).json({
        outcome: "already_registered",
        status: existing.status,
        recoveryAvailable: true,
      });
      return;
    }

    const partner = await ReferralPartner.create({
      partnerId: await createPartnerId(program),
      referralCode: await createReferralCode(),
      name,
      email,
      phone,
      preferredContact,
      country,
      locale,
      profileType,
      program,
      website,
      networkDescription,
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date(),
      marketingConsent: req.body?.marketingConsent === true,
      activity: [{ type: "application", message: `${program} partner application submitted`, at: new Date() }],
    });

    const emailSent = await sendAdminNotice(
      `New ${program} partner application - ${name}`,
      `<h2>New client-introduction program application</h2><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email || "Not provided")}</p><p><strong>Phone / WhatsApp:</strong> ${escapeHtml(phone || "Not provided")}</p><p><strong>Preferred contact:</strong> ${escapeHtml(preferredContact)}</p><p><strong>Country:</strong> ${escapeHtml(country)}</p><p><strong>Program:</strong> ${escapeHtml(program)}</p>`
    );

    res.status(201).json({ applicationId: partner._id, outcome: "submitted", status: partner.status, emailSent });
  } catch (error) {
    next(error);
  }
};

export const requestPartnerAccessRecovery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (clean(req.body?.websiteConfirmation, 200)) {
      res.status(202).json({ outcome: "received" });
      return;
    }

    const email = cleanEmail(req.body?.email);
    const phone = cleanPhone(req.body?.phone);
    if ((!email && !phone) || (email && !emailIsValid(email))) {
      res.status(400).json({ message: "Provide the email address or phone/WhatsApp number used for registration." });
      return;
    }

    const contactFilters: Record<string, unknown>[] = [];
    if (email) contactFilters.push({ email });
    if (phone) contactFilters.push({ phone: phoneLookup(phone) });
    const partner = await ReferralPartner.findOne({
      $or: contactFilters,
    });

    if (partner) {
      partner.accessRecoveryStatus = "pending";
      partner.accessRecoveryRequestedAt = new Date();
      partner.accessRecoveryResolvedAt = undefined;
      partner.accessRecoveryRequestCount = (partner.accessRecoveryRequestCount || 0) + 1;
      partner.activity.push({
        type: "access",
        message: "Private access link requested from the public registration form",
        at: new Date(),
      });
      await partner.save();

      await sendAdminNotice(
        `Private referral access requested - ${partner.name}`,
        `<h2>Private referral access requested</h2><p><strong>Partner:</strong> ${escapeHtml(partner.partnerId || "Pending approval")} - ${escapeHtml(partner.name)}</p><p><strong>Email:</strong> ${escapeHtml(partner.email || "Not provided")}</p><p><strong>Phone / WhatsApp:</strong> ${escapeHtml(partner.phone || "Not provided")}</p><p>Open Referral &amp; Partners in the dashboard, review this partner and generate a new private link when appropriate.</p>`
      );
    }

    // Keep the public response neutral if a mistyped contact does not match.
    res.status(202).json({ outcome: "received" });
  } catch (error) {
    next(error);
  }
};

export const submitReferralLead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (clean(req.body?.websiteConfirmation, 200)) {
      res.status(201).json({ message: "Referral received.", status: "submitted" });
      return;
    }
    if (!(await consumeReferralRateLimit(req, res, "partner_lead"))) {
      res.status(429).json({ message: "Too many requests. Please try again later." });
      return;
    }

    const partnerId = clean(req.body?.partnerId, 40).toUpperCase();
    const accessSecret = clean(req.body?.accessSecret, 200);
    const partner = await ReferralPartner.findOne({ partnerId }).select("+accessSecretHash");
    if (!partner || !["approved", "active"].includes(partner.status) || !secretsMatch(accessSecret, partner.accessSecretHash)) {
      res.status(403).json({ message: "The partner access link is invalid or inactive." });
      return;
    }

    const clientType = req.body?.clientType === "person" ? "person" : "company";
    const companyName = clean(req.body?.companyName, 220);
    const contactName = clean(req.body?.contactName, 200);
    const contactEmail = cleanEmail(req.body?.contactEmail);
    const contactPhone = clean(req.body?.contactPhone, 80);
    const website = clean(req.body?.website, 500).toLowerCase();
    const serviceNeeded = clean(req.body?.serviceNeeded, 200);
    const budgetRange = clean(req.body?.budgetRange, 100);
    const needDescription = clean(req.body?.needDescription, 3000);
    const relationship = clean(req.body?.relationship, 200);
    const consentStatus = req.body?.consentStatus === "agreed" ? "agreed" : "not_yet";
    const introductionMethod = clean(req.body?.introductionMethod, 120) || "partner_private_form";
    const introductionDetails = clean(req.body?.introductionDetails, 1500);
    const locale = normalizeCommunicationLocale(req.body?.locale || partner.locale);

    if ((clientType === "company" && !companyName) || !contactName || !serviceNeeded || !relationship) {
      res.status(400).json({ message: "Required referral fields are missing." });
      return;
    }
    if (contactEmail && !emailIsValid(contactEmail)) {
      res.status(400).json({ message: "The prospect email address is invalid." });
      return;
    }
    if (!contactEmail && !contactPhone) {
      res.status(400).json({ message: "A prospect email address or phone number is required." });
      return;
    }

    const duplicateFilters: Record<string, unknown>[] = [];
    if (contactEmail) duplicateFilters.push({ contactEmail });
    if (contactPhone) duplicateFilters.push({ contactPhone });
    if (website) duplicateFilters.push({ website });
    if (companyName) duplicateFilters.push({ companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") });
    if (clientType === "person") duplicateFilters.push({ clientType: "person", contactName: new RegExp(`^${escapeRegex(contactName)}$`, "i") });
    const possibleDuplicate = await ReferralLead.findOne({ $or: duplicateFilters }).select("_id");
    const initialStatus: ReferralLeadStatus = consentStatus === "agreed" ? (possibleDuplicate ? "under_review" : "submitted") : "waiting_for_introduction";

    const lead = await ReferralLead.create({
      partner: partner._id,
      partnerId: partner.partnerId,
      partnerName: partner.name,
      partnerEmail: partner.email,
      partnerPhone: partner.phone,
      clientType,
      companyName,
      contactName,
      contactEmail,
      contactPhone,
      website,
      serviceNeeded,
      budgetRange,
      needDescription,
      relationship,
      consentStatus,
      introductionMethod,
      introductionDetails,
      locale,
      status: initialStatus,
      activity: [
        { type: "submitted", message: "Referral submitted by partner", at: new Date() },
        ...(possibleDuplicate ? [{ type: "note" as const, message: "Possible duplicate detected; manual review required", at: new Date() }] : []),
      ],
    });

    if (partner.status === "approved") partner.status = "active";
    const clientLabel = companyName || contactName;
    partner.activity.push({ type: "note", message: `Referral submitted for ${clientLabel}`, at: new Date() });
    await partner.save();

    const emailSent = await sendAdminNotice(
      `New referral - ${clientLabel}`,
      `<h2>New client introduction</h2><p><strong>Partner:</strong> ${escapeHtml(partner.partnerId)} - ${escapeHtml(partner.name)}</p><p><strong>Client type:</strong> ${escapeHtml(clientType)}</p><p><strong>Client:</strong> ${escapeHtml(clientLabel)}</p><p><strong>Contact:</strong> ${escapeHtml(contactName)}</p><p><strong>Service:</strong> ${escapeHtml(serviceNeeded)}</p><p><strong>Consent:</strong> ${escapeHtml(consentStatus)}</p>`
    );
    res.status(201).json({ leadId: lead._id, status: lead.status, emailSent });
  } catch (error) {
    next(error);
  }
};

export const submitDirectReferral = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (clean(req.body?.websiteConfirmation, 200)) {
      res.status(201).json({ message: "Introduction received.", status: "submitted" });
      return;
    }
    if (!(await consumeReferralRateLimit(req, res, "direct_referral"))) {
      res.status(429).json({ message: "Too many requests. Please try again later." });
      return;
    }

    const referrerName = clean(req.body?.referrerName, 200);
    const referrerEmail = cleanEmail(req.body?.referrerEmail);
    const referrerPhone = cleanPhone(req.body?.referrerPhone);
    const preferredContact = cleanContactPreference(req.body?.preferredContact, Boolean(referrerEmail), Boolean(referrerPhone));
    const referrerCountry = clean(req.body?.referrerCountry, 120);
    const referrerProfileType = clean(req.body?.referrerProfileType, 120) || "individual";
    const referrerWebsite = clean(req.body?.referrerWebsite, 500);
    const locale = normalizeCommunicationLocale(req.body?.locale);
    const termsAccepted = req.body?.termsAccepted === true;

    const clientType = req.body?.clientType === "person" ? "person" : "company";
    const companyName = clean(req.body?.companyName, 220);
    const contactName = clean(req.body?.contactName, 200);
    const contactEmail = cleanEmail(req.body?.contactEmail);
    const contactPhone = clean(req.body?.contactPhone, 80);
    const website = clean(req.body?.website, 500).toLowerCase();
    const serviceNeeded = clean(req.body?.serviceNeeded, 200);
    const budgetRange = clean(req.body?.budgetRange, 100);
    const needDescription = clean(req.body?.needDescription, 3000);
    const relationship = clean(req.body?.relationship, 200);
    const consentStatus = req.body?.consentStatus === "agreed" ? "agreed" : "not_yet";
    const introductionMethod = clean(req.body?.introductionMethod, 120) || "direct_introduction_form";
    const introductionDetails = clean(req.body?.introductionDetails, 1500);

    if (!referrerName || (!referrerEmail && !referrerPhone) || (referrerEmail && !emailIsValid(referrerEmail)) || !referrerCountry || !termsAccepted) {
      res.status(400).json({ message: "Your required details and acceptance of the program terms are missing." });
      return;
    }
    if ((clientType === "company" && !companyName) || !contactName || !serviceNeeded || !relationship) {
      res.status(400).json({ message: "Required client introduction fields are missing." });
      return;
    }
    if (contactEmail && !emailIsValid(contactEmail)) {
      res.status(400).json({ message: "The client email address is invalid." });
      return;
    }
    if (!contactEmail && !contactPhone) {
      res.status(400).json({ message: "A client email address or phone number is required." });
      return;
    }

    const referrerContactFilters: Record<string, unknown>[] = [];
    if (referrerEmail) referrerContactFilters.push({ email: referrerEmail });
    if (referrerPhone) referrerContactFilters.push({ phone: phoneLookup(referrerPhone) });
    let partner = await ReferralPartner.findOne({
      $or: referrerContactFilters,
    }).select("+referralCode");
    if (partner?.status === "suspended") {
      res.status(403).json({ message: "This program account is currently inactive." });
      return;
    }
    if (!partner) {
      partner = await ReferralPartner.create({
        partnerId: await createPartnerId("referral"),
        referralCode: await createReferralCode(),
        name: referrerName,
        email: referrerEmail,
        phone: referrerPhone,
        preferredContact,
        country: referrerCountry,
        locale,
        profileType: referrerProfileType,
        program: "referral",
        website: referrerWebsite,
        status: "pending",
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(),
        marketingConsent: false,
        activity: [{ type: "application", message: "Program account created with first client introduction", at: new Date() }],
      });
    } else {
      if (!partner.partnerId) partner.partnerId = await createPartnerId(partner.program);
      if (!partner.referralCode) partner.referralCode = await createReferralCode();
    }

    const duplicateFilters: Record<string, unknown>[] = [];
    if (contactEmail) duplicateFilters.push({ contactEmail });
    if (contactPhone) duplicateFilters.push({ contactPhone });
    if (website) duplicateFilters.push({ website });
    if (companyName) duplicateFilters.push({ companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") });
    if (clientType === "person") duplicateFilters.push({ clientType: "person", contactName: new RegExp(`^${escapeRegex(contactName)}$`, "i") });
    const possibleDuplicate = await ReferralLead.findOne({ $or: duplicateFilters }).select("_id");
    const initialStatus: ReferralLeadStatus = consentStatus === "agreed"
      ? (possibleDuplicate ? "under_review" : "submitted")
      : "waiting_for_introduction";

    const lead = await ReferralLead.create({
      partner: partner._id,
      partnerId: partner.partnerId,
      partnerName: partner.name,
      partnerEmail: partner.email,
      partnerPhone: partner.phone,
      clientType,
      companyName,
      contactName,
      contactEmail,
      contactPhone,
      website,
      serviceNeeded,
      budgetRange,
      needDescription,
      relationship,
      consentStatus,
      introductionMethod,
      introductionDetails,
      locale,
      status: initialStatus,
      activity: [
        { type: "submitted", message: "First client introduction submitted with program registration", at: new Date() },
        ...(possibleDuplicate ? [{ type: "note" as const, message: "Possible duplicate detected; manual review required", at: new Date() }] : []),
      ],
    });

    if (partner.status === "approved") partner.status = "active";
    const clientLabel = companyName || contactName;
    partner.activity.push({ type: "note", message: `Client introduction submitted for ${clientLabel}`, at: new Date() });
    await partner.save();

    const emailSent = await sendAdminNotice(
      `New direct client introduction - ${clientLabel}`,
      `<h2>New client introduction and program registration</h2><p><strong>Introducer:</strong> ${escapeHtml(partner.partnerId)} - ${escapeHtml(partner.name)}</p><p><strong>Introducer contact:</strong> ${escapeHtml(partner.email || partner.phone || "Not provided")}</p><p><strong>Client type:</strong> ${escapeHtml(clientType)}</p><p><strong>Client:</strong> ${escapeHtml(clientLabel)}</p><p><strong>Contact:</strong> ${escapeHtml(contactName)}</p><p><strong>Service:</strong> ${escapeHtml(serviceNeeded)}</p><p><strong>Consent:</strong> ${escapeHtml(consentStatus)}</p>`
    );
    res.status(201).json({
      leadId: lead._id,
      status: lead.status,
      partnerId: partner.partnerId,
      applicationStatus: partner.status,
      emailSent,
    });
  } catch (error) {
    next(error);
  }
};

export const submitProspectReferral = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (clean(req.body?.websiteConfirmation, 200)) {
      res.status(201).json({ message: "Request received.", status: "submitted" });
      return;
    }
    if (!(await consumeReferralRateLimit(req, res, "prospect_referral"))) {
      res.status(429).json({ message: "Too many requests. Please try again later." });
      return;
    }
    const referralCode = clean(req.body?.referralCode, 100);
    const partner = await ReferralPartner.findOne({ referralCode, status: { $in: ["approved", "active"] } }).select("+referralCode");
    if (!partner) {
      res.status(404).json({ message: "This referral invitation is invalid or inactive." });
      return;
    }

    const clientType = req.body?.clientType === "person" ? "person" : "company";
    const companyName = clean(req.body?.companyName, 220);
    const contactName = clean(req.body?.contactName, 200);
    const contactEmail = cleanEmail(req.body?.contactEmail);
    const contactPhone = clean(req.body?.contactPhone, 80);
    const website = clean(req.body?.website, 500).toLowerCase();
    const serviceNeeded = clean(req.body?.serviceNeeded, 200);
    const budgetRange = clean(req.body?.budgetRange, 100);
    const needDescription = clean(req.body?.needDescription, 3000);
    const locale = normalizeCommunicationLocale(req.body?.locale);
    if ((clientType === "company" && !companyName) || !contactName || (!contactEmail && !contactPhone) || (contactEmail && !emailIsValid(contactEmail)) || !serviceNeeded || req.body?.contactConsent !== true) {
      res.status(400).json({ message: "Required fields and permission to contact you are missing." });
      return;
    }

    const duplicateFilters: Record<string, unknown>[] = [];
    if (contactEmail) duplicateFilters.push({ contactEmail });
    if (contactPhone) duplicateFilters.push({ contactPhone });
    if (companyName) duplicateFilters.push({ companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") });
    if (clientType === "person") duplicateFilters.push({ clientType: "person", contactName: new RegExp(`^${escapeRegex(contactName)}$`, "i") });
    if (website) duplicateFilters.push({ website });
    const possibleDuplicate = await ReferralLead.findOne({ $or: duplicateFilters }).select("_id");
    const lead = await ReferralLead.create({
      partner: partner._id,
      partnerId: partner.partnerId,
      partnerName: partner.name,
      partnerEmail: partner.email,
      partnerPhone: partner.phone,
      clientType,
      companyName,
      contactName,
      contactEmail,
      contactPhone,
      website,
      serviceNeeded,
      budgetRange,
      needDescription,
      relationship: "Prospect completed the partner's personal referral link",
      consentStatus: "prospect_submitted",
      introductionMethod: "personal_referral_link",
      introductionDetails: "The prospect submitted their own details and explicitly requested contact.",
      locale,
      status: possibleDuplicate ? "under_review" : "submitted",
      activity: [
        { type: "submitted", message: "Prospect submitted the partner's personal referral link", at: new Date() },
        ...(possibleDuplicate ? [{ type: "note" as const, message: "Possible duplicate detected; manual review required", at: new Date() }] : []),
      ],
    });
    if (partner.status === "approved") partner.status = "active";
    const clientLabel = companyName || contactName;
    partner.activity.push({ type: "note", message: `Prospect referral received for ${clientLabel}`, at: new Date() });
    await partner.save();
    const emailSent = await sendAdminNotice(
      `New prospect-confirmed referral - ${clientLabel}`,
      `<h2>New prospect-confirmed client introduction</h2><p><strong>Partner:</strong> ${escapeHtml(partner.partnerId)} - ${escapeHtml(partner.name)}</p><p><strong>Client type:</strong> ${escapeHtml(clientType)}</p><p><strong>Client:</strong> ${escapeHtml(clientLabel)}</p><p><strong>Contact:</strong> ${escapeHtml(contactName)} (${escapeHtml(contactEmail || contactPhone)})</p><p><strong>Service:</strong> ${escapeHtml(serviceNeeded)}</p>`
    );
    res.status(201).json({ leadId: lead._id, status: lead.status, emailSent });
  } catch (error) {
    next(error);
  }
};

export const createManualReferralEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    const existingPartnerId = clean(req.body?.existingPartnerId, 40).toUpperCase();
    const approveNow = req.body?.approveNow === true;
    const regenerateAccess = req.body?.regenerateAccess === true;
    const includeClient = req.body?.includeClient === true;
    let partner = existingPartnerId
      ? await ReferralPartner.findOne({ partnerId: existingPartnerId }).select("+accessSecretHash +referralCode")
      : null;

    if (existingPartnerId && !partner) {
      res.status(404).json({ message: "The selected partner ID was not found." });
      return;
    }

    if (!partner) {
      const name = clean(req.body?.name, 200);
      const email = cleanEmail(req.body?.email);
      const phone = cleanPhone(req.body?.phone);
      const country = clean(req.body?.country, 120);
      const profileType = clean(req.body?.profileType, 120);
      const locale = normalizeCommunicationLocale(req.body?.locale);
      const program = req.body?.program === "business" ? "business" : "referral";
      const preferredContact = cleanContactPreference(req.body?.preferredContact, Boolean(email), Boolean(phone));

      if (!name || (!email && !phone) || (email && !emailIsValid(email)) || !country || !profileType || req.body?.termsAccepted !== true) {
        res.status(400).json({ message: "Provide the introducer's name, country, profile, accepted terms and at least an email or phone/WhatsApp number." });
        return;
      }

      const contactFilters: Record<string, unknown>[] = [];
      if (email) contactFilters.push({ email });
      if (phone) contactFilters.push({ phone: phoneLookup(phone) });
      const duplicatePartner = await ReferralPartner.findOne({
        $or: contactFilters,
      });
      if (duplicatePartner) {
        res.status(409).json({ message: `This contact already belongs to partner ${duplicatePartner.partnerId || duplicatePartner._id}. Use the existing partner ID instead.` });
        return;
      }

      partner = await ReferralPartner.create({
        partnerId: await createPartnerId(program),
        referralCode: await createReferralCode(),
        name,
        email,
        phone,
        preferredContact,
        country,
        locale,
        profileType,
        program,
        website: clean(req.body?.website, 500),
        status: "pending",
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(),
        marketingConsent: req.body?.marketingConsent === true,
        activity: [{ type: "application", message: "Application manually recorded from an external contact channel", actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() }],
      });
    }

    if (!partner) {
      res.status(500).json({ message: "Unable to create the partner record." });
      return;
    }

    if (!partner.partnerId) partner.partnerId = await createPartnerId(partner.program);
    if (!partner.referralCode) partner.referralCode = await createReferralCode();
    let plainSecret = "";
    if (approveNow) {
      if (!["approved", "active"].includes(partner.status)) partner.status = "approved";
      if (!partner.accessSecretHash || regenerateAccess) {
        plainSecret = createSecret();
        partner.accessSecretHash = hashSecret(plainSecret);
        partner.activity.push({ type: "access", message: "Secure access generated for manual sharing", actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
      }
      partner.reviewedAt = new Date();
      partner.reviewedBy = getAdminEmail(req);
    }

    let lead = null;
    if (includeClient) {
      const clientType = req.body?.clientType === "person" ? "person" : "company";
      const companyName = clean(req.body?.companyName, 220);
      const contactName = clean(req.body?.contactName, 200);
      const contactEmail = cleanEmail(req.body?.contactEmail);
      const contactPhone = cleanPhone(req.body?.contactPhone);
      const website = clean(req.body?.clientWebsite, 500).toLowerCase();
      const serviceNeeded = clean(req.body?.serviceNeeded, 200);
      const needDescription = clean(req.body?.needDescription, 3000);
      const relationship = clean(req.body?.relationship, 200) || "Recorded by Creativa Poeta from an external contact channel";
      const introductionMethod = clean(req.body?.introductionMethod, 120) || "manual_admin_entry";
      const consentStatus = req.body?.consentStatus === "agreed" ? "agreed" : "not_yet";

      if ((clientType === "company" && !companyName) || !contactName || (!contactEmail && !contactPhone) || (contactEmail && !emailIsValid(contactEmail)) || !serviceNeeded) {
        res.status(400).json({ message: "Complete the required client fields and provide a client email or phone number." });
        return;
      }

      const duplicateFilters: Record<string, unknown>[] = [];
      if (contactEmail) duplicateFilters.push({ contactEmail });
      if (contactPhone) duplicateFilters.push({ contactPhone });
      if (website) duplicateFilters.push({ website });
      if (companyName) duplicateFilters.push({ companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") });
      if (clientType === "person") duplicateFilters.push({ clientType: "person", contactName: new RegExp(`^${escapeRegex(contactName)}$`, "i") });
      const possibleDuplicate = await ReferralLead.findOne({ $or: duplicateFilters }).select("_id");
      const status: ReferralLeadStatus = consentStatus === "agreed"
        ? (possibleDuplicate ? "under_review" : "submitted")
        : "waiting_for_introduction";

      lead = await ReferralLead.create({
        partner: partner._id,
        partnerId: partner.partnerId,
        partnerName: partner.name,
        partnerEmail: partner.email,
        partnerPhone: partner.phone,
        clientType,
        companyName,
        contactName,
        contactEmail,
        contactPhone,
        website,
        serviceNeeded,
        budgetRange: clean(req.body?.budgetRange, 100),
        needDescription,
        relationship,
        consentStatus,
        introductionMethod,
        introductionDetails: clean(req.body?.introductionDetails, 1500),
        locale: normalizeCommunicationLocale(req.body?.locale || partner.locale),
        status,
        activity: [
          { type: "submitted", message: "Client introduction manually recorded by an administrator", actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() },
          ...(possibleDuplicate ? [{ type: "note" as const, message: "Possible duplicate detected; manual review required", actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() }] : []),
        ],
      });
      partner.activity.push({ type: "note", message: `Manual client introduction recorded for ${companyName || contactName}`, actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
    }

    await partner.save();
    const accessPackage = plainSecret ? buildPartnerAccessPackage(partner, plainSecret) : undefined;
    const accessUrl = accessPackage?.accessUrl;
    const shareUrl = accessPackage?.shareUrl || (["approved", "active"].includes(partner.status)
      ? `${FRONTEND_URL}/referral-partners?ref=${encodeURIComponent(partner.referralCode || "")}#referred-business`
      : undefined);
    let notification: ReferralNotificationDelivery | undefined;
    if (approveNow && plainSecret && accessUrl && shareUrl) {
      const copy = getPartnerNotificationCopy(partner.locale);
      notification = await deliverReferralPartnerNotification({
        target: {
          name: partner.name,
          email: partner.email,
          phone: partner.phone,
          preferredContact: partner.preferredContact,
          locale: partner.locale,
          partnerId: partner.partnerId,
        },
        content: {
          kind: "approval",
          emailSubject: copy.approvalSubject,
          emailHtml: renderPartnerApprovalEmail({
            partnerName: partner.name,
            partnerId: partner.partnerId || "",
            accessUrl,
            shareUrl,
            locale: partner.locale,
          }),
          accessUrl,
          shareUrl,
        },
      });
      partner.lastNotification = notification;
      partner.activity.push({
        type: "note",
        message: notification.deliveredChannel
          ? `approval notification sent via ${notification.deliveredChannel}${notification.fallbackUsed ? " after preferred-channel failure" : ""}`
          : `approval notification ${notification.status}: ${notification.error || "delivery unavailable"}`,
        actorEmail: getAdminEmail(req),
        actorName: getAdminName(req),
        at: new Date(),
      });
      await partner.save();
    }
    const safePartner = await ReferralPartner.findById(partner._id);
    res.status(201).json({
      partner: safePartner,
      lead,
      notification,
      accessUrl,
      shareUrl,
      subject: accessPackage?.subject,
      message: accessPackage?.message,
    });
  } catch (error) {
    console.error("Manual referral entry failed:", error);
    res.status(500).json({ message: "Failed to create the manual referral entry." });
  }
};

const pagination = (req: Request) => ({
  page: Math.max(1, Number(req.query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(req.query.limit) || 25)),
});

export const getReferralProgramSummary = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [pendingPartners, activePartners, accessRecoveryPending, leadsToReview, wonLeads, rewardsToApprove, paidRewards] = await Promise.all([
      ReferralPartner.countDocuments({ status: "pending" }),
      ReferralPartner.countDocuments({ status: { $in: ["approved", "active"] } }),
      ReferralPartner.countDocuments({ accessRecoveryStatus: "pending" }),
      ReferralLead.countDocuments({ status: { $in: ["submitted", "under_review", "waiting_for_introduction"] } }),
      ReferralLead.countDocuments({ status: "won" }),
      ReferralReward.countDocuments({ status: "earned" }),
      ReferralReward.countDocuments({ status: "paid" }),
    ]);
    res.json({ metrics: { pendingPartners, activePartners, accessRecoveryPending, leadsToReview, wonLeads, rewardsToApprove, paidRewards, attention: pendingPartners + accessRecoveryPending + leadsToReview + rewardsToApprove } });
  } catch {
    res.status(500).json({ message: "Failed to fetch referral program summary." });
  }
};

export const getReferralPartners = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit } = pagination(req);
    const status = clean(req.query.status, 40);
    const search = clean(req.query.search, 200);
    const filter: Record<string, unknown> = {};
    if (status && status !== "all" && partnerStatuses.includes(status as ReferralPartnerStatus)) filter.status = status;
    if (search) filter.$or = ["name", "email", "phone", "country", "partnerId"].map((field) => ({ [field]: new RegExp(escapeRegex(search), "i") }));
    const [partners, total] = await Promise.all([
      ReferralPartner.find(filter).select("+referralCode").sort({ accessRecoveryRequestedAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      ReferralPartner.countDocuments(filter),
    ]);
    const safePartners = partners.map((partner) => {
      const data = partner.toObject() as unknown as Record<string, unknown>;
      const referralCode = typeof data.referralCode === "string" ? data.referralCode : "";
      delete data.referralCode;
      if (["approved", "active"].includes(String(data.status)) && referralCode) {
        data.shareUrl = `${FRONTEND_URL}/referral-partners?ref=${encodeURIComponent(referralCode)}#referred-business`;
      }
      return data;
    });
    res.json({ partners: safePartners, pagination: { currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)), total, limit } });
  } catch {
    res.status(500).json({ message: "Failed to fetch referral partners." });
  }
};

export const updateReferralPartner = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = clean(req.body?.status, 40) as ReferralPartnerStatus;
    if (!partnerStatuses.includes(status)) {
      res.status(400).json({ message: "Invalid partner status." });
      return;
    }
    const partner = await ReferralPartner.findById(req.params.id).select("+accessSecretHash +referralCode");
    if (!partner) {
      res.status(404).json({ message: "Referral partner not found." });
      return;
    }
    const reason = clean(req.body?.reason, 1000);
    if (status === "rejected" && !reason) {
      res.status(400).json({ message: "A rejection reason is required." });
      return;
    }

    let plainSecret = "";
    if (["approved", "active"].includes(status) && (!partner.partnerId || !partner.accessSecretHash || req.body?.regenerateAccess === true)) {
      if (!partner.partnerId) partner.partnerId = await createPartnerId(partner.program);
      if (!partner.referralCode) partner.referralCode = await createReferralCode();
      plainSecret = createSecret();
      partner.accessSecretHash = hashSecret(plainSecret);
      partner.accessRecoveryStatus = "resolved";
      partner.accessRecoveryResolvedAt = new Date();
    }
    partner.status = status;
    partner.reviewedAt = new Date();
    partner.reviewedBy = getAdminEmail(req);
    partner.rejectionReason = status === "rejected" ? reason : undefined;
    partner.activity.push({ type: "status", message: `Status changed to ${status}${reason ? `: ${reason}` : ""}`, actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
    if (plainSecret) partner.activity.push({ type: "access", message: "Secure partner access regenerated", actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
    await partner.save();

    let notification: ReferralNotificationDelivery | undefined;
    let subject = "";
    let message = "";
    let accessUrl = "";
    let shareUrl = "";
    if (plainSecret) {
      const accessPackage = buildPartnerAccessPackage(partner, plainSecret);
      accessUrl = accessPackage.accessUrl;
      shareUrl = accessPackage.shareUrl;
      subject = accessPackage.subject;
      message = accessPackage.message;
      const copy = getPartnerNotificationCopy(partner.locale);
      notification = await deliverReferralPartnerNotification({
        target: {
          name: partner.name,
          email: partner.email,
          phone: partner.phone,
          preferredContact: partner.preferredContact,
          locale: partner.locale,
          partnerId: partner.partnerId,
        },
        content: {
          kind: "approval",
          emailSubject: copy.approvalSubject,
          emailHtml: renderPartnerApprovalEmail({
            partnerName: partner.name,
            partnerId: partner.partnerId || "",
            accessUrl,
            shareUrl,
            locale: partner.locale,
          }),
          accessUrl,
          shareUrl,
        },
      });
    } else if (status === "rejected") {
      const copy = getPartnerNotificationCopy(partner.locale);
      notification = await deliverReferralPartnerNotification({
        target: {
          name: partner.name,
          email: partner.email,
          phone: partner.phone,
          preferredContact: partner.preferredContact,
          locale: partner.locale,
          partnerId: partner.partnerId,
        },
        content: {
          kind: "rejection",
          emailSubject: copy.rejectionSubject,
          emailHtml: renderPartnerRejectionEmail({
            partnerName: partner.name,
            reason,
            locale: partner.locale,
          }),
          reason,
        },
      });
    }
    if (notification) {
      partner.lastNotification = notification;
      partner.activity.push({
        type: "note",
        message: notification.deliveredChannel
          ? `${notification.kind} notification sent via ${notification.deliveredChannel}${notification.fallbackUsed ? " after preferred-channel failure" : ""}`
          : `${notification.kind} notification ${notification.status}: ${notification.error || "delivery unavailable"}`,
        actorEmail: getAdminEmail(req),
        actorName: getAdminName(req),
        at: new Date(),
      });
      await partner.save();
    }
    const safePartner = await ReferralPartner.findById(partner._id);
    res.json({
      partner: safePartner,
      emailSent: notification?.deliveredChannel === "email",
      notification,
      accessUrl: accessUrl || undefined,
      shareUrl: shareUrl || undefined,
      subject: subject || undefined,
      message: message || undefined,
    });
  } catch {
    res.status(500).json({ message: "Failed to update referral partner." });
  }
};

export const deleteReferralPartner = async (req: Request, res: Response): Promise<void> => {
  try {
    const partner = await ReferralPartner.findById(req.params.id).select("_id name partnerId");
    if (!partner) {
      res.status(404).json({ message: "Referral partner application not found." });
      return;
    }
    const [linkedLeads, linkedRewards] = await Promise.all([
      ReferralLead.countDocuments({ partner: partner._id }),
      ReferralReward.countDocuments({ partner: partner._id }),
    ]);
    if (linkedLeads > 0 || linkedRewards > 0) {
      res.status(409).json({ message: "This application cannot be deleted because client introductions or reward records are linked to it. Set its status to closed instead." });
      return;
    }
    await partner.deleteOne();
    res.status(200).json({ message: "Referral partner application deleted." });
  } catch {
    res.status(500).json({ message: "Failed to delete referral partner application." });
  }
};

export const prepareReferralPartnerManualPackage = async (req: Request, res: Response): Promise<void> => {
  try {
    const partner = await ReferralPartner.findById(req.params.id).select("+accessSecretHash +referralCode");
    if (!partner) {
      res.status(404).json({ message: "Referral partner not found." });
      return;
    }
    if (!["approved", "active"].includes(partner.status)) {
      res.status(409).json({ message: "Approve this application before preparing a manual access package." });
      return;
    }

    if (!partner.partnerId) partner.partnerId = await createPartnerId(partner.program);
    if (!partner.referralCode) partner.referralCode = await createReferralCode();
    const plainSecret = createSecret();
    partner.accessSecretHash = hashSecret(plainSecret);
    partner.accessRecoveryStatus = "resolved";
    partner.accessRecoveryResolvedAt = new Date();
    partner.activity.push({
      type: "access",
      message: "New secure access prepared for manual delivery; no automatic notification sent",
      actorEmail: getAdminEmail(req),
      actorName: getAdminName(req),
      at: new Date(),
    });
    await partner.save();

    const accessPackage = buildPartnerAccessPackage(partner, plainSecret);
    const safePartner = await ReferralPartner.findById(partner._id);
    res.json({ partner: safePartner, ...accessPackage });
  } catch {
    res.status(500).json({ message: "Failed to prepare the manual partner access package." });
  }
};

export const getReferralLeads = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit } = pagination(req);
    const status = clean(req.query.status, 40);
    const search = clean(req.query.search, 200);
    const filter: Record<string, unknown> = {};
    if (status && status !== "all" && leadStatuses.includes(status as ReferralLeadStatus)) filter.status = status;
    if (search) filter.$or = ["companyName", "contactName", "contactEmail", "partnerId", "partnerName"].map((field) => ({ [field]: new RegExp(escapeRegex(search), "i") }));
    const [leads, total] = await Promise.all([
      ReferralLead.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      ReferralLead.countDocuments(filter),
    ]);
    res.json({ leads, pagination: { currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)), total, limit } });
  } catch {
    res.status(500).json({ message: "Failed to fetch referral leads." });
  }
};

export const updateReferralLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const lead = await ReferralLead.findById(req.params.id);
    if (!lead) {
      res.status(404).json({ message: "Referral lead not found." });
      return;
    }
    const status = clean(req.body?.status, 40) as ReferralLeadStatus;
    const eligibility = clean(req.body?.eligibility, 40) as "pending" | "eligible" | "ineligible";
    const reason = clean(req.body?.reason, 1500);
    if (status) {
      if (!leadStatuses.includes(status)) {
        res.status(400).json({ message: "Invalid lead status." });
        return;
      }
      lead.status = status;
      lead.activity.push({ type: "status", message: `Status changed to ${status}${reason ? `: ${reason}` : ""}`, actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
    }
    if (eligibility) {
      if (!["pending", "eligible", "ineligible"].includes(eligibility)) {
        res.status(400).json({ message: "Invalid eligibility status." });
        return;
      }
      lead.eligibility = eligibility;
      lead.activity.push({ type: "eligibility", message: `Eligibility changed to ${eligibility}${reason ? `: ${reason}` : ""}`, actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
    }
    if (reason) lead.decisionReason = reason;
    await lead.save();
    res.json({ lead });
  } catch {
    res.status(500).json({ message: "Failed to update referral lead." });
  }
};

export const deleteReferralLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const lead = await ReferralLead.findById(req.params.id).select("_id companyName contactName");
    if (!lead) {
      res.status(404).json({ message: "Referral lead not found." });
      return;
    }
    if (await ReferralReward.exists({ lead: lead._id })) {
      res.status(409).json({ message: "This client introduction cannot be deleted because a reward record is linked to it. Keep it for financial traceability." });
      return;
    }
    await lead.deleteOne();
    res.status(200).json({ message: "Client introduction deleted." });
  } catch {
    res.status(500).json({ message: "Failed to delete client introduction." });
  }
};

export const claimReferralLead = async (req: Request, res: Response): Promise<void> => {
  try {
    const lead = await ReferralLead.findById(req.params.id);
    if (!lead) {
      res.status(404).json({ message: "Referral lead not found." });
      return;
    }
    const email = getAdminEmail(req);
    if (lead.assignedToEmail && lead.assignedToEmail !== email) {
      res.status(409).json({ message: "This referral is already assigned." });
      return;
    }
    lead.assignedToEmail = email;
    lead.assignedToName = getAdminName(req);
    lead.assignedAt = new Date();
    lead.activity.push({ type: "assigned", message: "Referral assigned", actorEmail: email, actorName: getAdminName(req), at: new Date() });
    await lead.save();
    res.json({ lead });
  } catch {
    res.status(500).json({ message: "Failed to assign referral lead." });
  }
};

export const getReferralRewards = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit } = pagination(req);
    const status = clean(req.query.status, 40);
    const filter: Record<string, unknown> = {};
    if (status && status !== "all" && rewardStatuses.includes(status as ReferralRewardStatus)) filter.status = status;
    const [rewards, total] = await Promise.all([
      ReferralReward.find(filter).populate("lead", "companyName status").populate("partner", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      ReferralReward.countDocuments(filter),
    ]);
    res.json({ rewards, pagination: { currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)), total, limit } });
  } catch {
    res.status(500).json({ message: "Failed to fetch referral rewards." });
  }
};

export const upsertReferralReward = async (req: Request, res: Response): Promise<void> => {
  try {
    const lead = await ReferralLead.findById(req.params.leadId);
    if (!lead) {
      res.status(404).json({ message: "Referral lead not found." });
      return;
    }
    if (lead.status !== "won" || lead.eligibility !== "eligible") {
      res.status(409).json({ message: "A reward can only be created for a won and eligible referral." });
      return;
    }
    const existingReward = await ReferralReward.findOne({ lead: lead._id });
    if (existingReward && existingReward.status !== "waiting_client_payment") {
      res.status(409).json({ message: "Financial values cannot be changed after client payment has been acknowledged." });
      return;
    }
    const eligibleRevenueCents = Math.max(0, Math.round(Number(req.body?.eligibleRevenueCents) || 0));
    const rateBasisPoints = Math.min(10000, Math.max(0, Math.round(Number(req.body?.rateBasisPoints) || 1000)));
    const capCents = Math.max(0, Math.round(Number(req.body?.capCents) || 0));
    if (eligibleRevenueCents <= 0) {
      res.status(400).json({ message: "Eligible revenue must be greater than zero." });
      return;
    }
    const amountCents = calculateReferralReward(eligibleRevenueCents, rateBasisPoints, capCents);
    const status: ReferralRewardStatus = "waiting_client_payment";
    const set: Record<string, unknown> = {
      lead: lead._id,
      partner: lead.partner,
      partnerId: lead.partnerId,
      currency: "EUR",
      eligibleRevenueCents,
      rateBasisPoints,
      capCents,
      amountCents,
      status,
    };
    const reward = await ReferralReward.findOneAndUpdate(
      { lead: lead._id },
      {
        $set: set,
        $push: { activity: { message: `Reward updated to ${status}: EUR ${(amountCents / 100).toFixed(2)}`, actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() } },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ reward });
  } catch {
    res.status(500).json({ message: "Failed to update referral reward." });
  }
};

export const updateReferralRewardStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = clean(req.body?.status, 40) as ReferralRewardStatus;
    if (!["earned", "approved", "scheduled", "cancelled"].includes(status)) {
      res.status(400).json({ message: "Invalid reward workflow status." });
      return;
    }
    const reward = await ReferralReward.findById(req.params.id);
    if (!reward) {
      res.status(404).json({ message: "Referral reward not found." });
      return;
    }
    if (!canTransitionReferralReward(reward.status, status)) {
      res.status(409).json({ message: `Reward cannot move from ${reward.status} to ${status}.` });
      return;
    }
    reward.status = status;
    if (["approved", "scheduled"].includes(status)) {
      reward.approvedAt = reward.approvedAt || new Date();
      reward.approvedBy = reward.approvedBy || getAdminEmail(req);
    }
    reward.activity.push({ message: `Reward status changed to ${status}`, actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
    await reward.save();
    res.json({ reward });
  } catch {
    res.status(500).json({ message: "Failed to update referral reward status." });
  }
};

export const markReferralRewardPaid = async (req: Request, res: Response): Promise<void> => {
  try {
    const paymentReference = clean(req.body?.paymentReference, 300);
    if (!paymentReference) {
      res.status(400).json({ message: "A payment reference is required." });
      return;
    }
    const reward = await ReferralReward.findById(req.params.id);
    if (!reward) {
      res.status(404).json({ message: "Referral reward not found." });
      return;
    }
    if (!canTransitionReferralReward(reward.status, "paid")) {
      res.status(409).json({ message: "Only a scheduled reward can be marked as paid." });
      return;
    }
    reward.status = "paid";
    reward.paymentReference = paymentReference;
    reward.paidAt = new Date();
    reward.activity.push({ message: `Reward marked paid (${paymentReference})`, actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
    await reward.save();
    res.json({ reward });
  } catch {
    res.status(500).json({ message: "Failed to mark referral reward as paid." });
  }
};
