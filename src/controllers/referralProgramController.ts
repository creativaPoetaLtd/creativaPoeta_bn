import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import ReferralLead, { ReferralLeadStatus } from "../models/ReferralLead";
import ReferralPartner, { ReferralPartnerStatus } from "../models/ReferralPartner";
import ReferralReward, { ReferralRewardStatus } from "../models/ReferralReward";
import { buildPrivatePartnerAccessUrl, calculateReferralReward, canTransitionReferralReward } from "../domain/referralProgramPolicy";
import { consumeReferralRateLimit } from "../services/referralRateLimitService";
import sendEmail from "../utils/sendEmail";

const TERMS_VERSION = "2026-08-10";
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://creativapoeta.com").replace(/\/$/, "");

const partnerStatuses: ReferralPartnerStatus[] = ["pending", "approved", "active", "rejected", "suspended", "closed"];
const leadStatuses: ReferralLeadStatus[] = ["submitted", "waiting_for_introduction", "under_review", "accepted", "duplicate", "rejected", "contacted", "qualified", "proposal_sent", "won", "lost"];
const rewardStatuses: ReferralRewardStatus[] = ["waiting_client_payment", "earned", "approved", "scheduled", "paid", "cancelled"];

const clean = (value: unknown, maxLength = 5000) => String(value || "").trim().slice(0, maxLength);
const cleanEmail = (value: unknown) => clean(value, 320).toLowerCase();
const escapeHtml = (value: unknown) => clean(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#039;");
const emailIsValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

const sendAdminNotice = async (subject: string, html: string) => {
  if (!process.env.EMAIL_USER) return false;
  try {
    await sendEmail(process.env.EMAIL_USER, subject, html);
    return true;
  } catch (error) {
    console.error("Referral program admin email failed:", error);
    return false;
  }
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
    const country = clean(req.body?.country, 120);
    const locale = clean(req.body?.locale, 12) || "fr";
    const profileType = clean(req.body?.profileType, 120);
    const program = req.body?.program === "business" ? "business" : "referral";
    const website = clean(req.body?.website, 500);
    const networkDescription = clean(req.body?.networkDescription, 2000);
    const termsAccepted = req.body?.termsAccepted === true;

    if (!name || !emailIsValid(email) || !country || !profileType || !termsAccepted) {
      res.status(400).json({ message: "Required fields or terms acceptance are missing." });
      return;
    }

    const existing = await ReferralPartner.findOne({
      email,
      status: { $in: ["pending", "approved", "active", "suspended"] },
    });
    if (existing) {
      res.status(201).json({ message: "Application received.", status: "pending" });
      return;
    }

    const partner = await ReferralPartner.create({
      name,
      email,
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
      `<h2>New CPRPP application</h2><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Country:</strong> ${escapeHtml(country)}</p><p><strong>Program:</strong> ${escapeHtml(program)}</p>`
    );

    res.status(201).json({ applicationId: partner._id, status: partner.status, emailSent });
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
    const introductionMethod = clean(req.body?.introductionMethod, 120);
    const introductionDetails = clean(req.body?.introductionDetails, 1500);
    const locale = clean(req.body?.locale, 12) || partner.locale || "fr";

    if (!companyName || !contactName || !serviceNeeded || !needDescription || !relationship || !introductionMethod) {
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
    if (website) duplicateFilters.push({ website });
    duplicateFilters.push({ companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") });
    const possibleDuplicate = await ReferralLead.findOne({ $or: duplicateFilters }).select("_id");
    const initialStatus: ReferralLeadStatus = consentStatus === "agreed" ? (possibleDuplicate ? "under_review" : "submitted") : "waiting_for_introduction";

    const lead = await ReferralLead.create({
      partner: partner._id,
      partnerId: partner.partnerId,
      partnerName: partner.name,
      partnerEmail: partner.email,
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
    partner.activity.push({ type: "note", message: `Referral submitted for ${companyName}`, at: new Date() });
    await partner.save();

    const emailSent = await sendAdminNotice(
      `New referral - ${companyName}`,
      `<h2>New CPRPP referral</h2><p><strong>Partner:</strong> ${escapeHtml(partner.partnerId)} - ${escapeHtml(partner.name)}</p><p><strong>Company:</strong> ${escapeHtml(companyName)}</p><p><strong>Contact:</strong> ${escapeHtml(contactName)}</p><p><strong>Service:</strong> ${escapeHtml(serviceNeeded)}</p><p><strong>Consent:</strong> ${escapeHtml(consentStatus)}</p>`
    );
    res.status(201).json({ leadId: lead._id, status: lead.status, emailSent });
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

    const companyName = clean(req.body?.companyName, 220);
    const contactName = clean(req.body?.contactName, 200);
    const contactEmail = cleanEmail(req.body?.contactEmail);
    const contactPhone = clean(req.body?.contactPhone, 80);
    const website = clean(req.body?.website, 500).toLowerCase();
    const serviceNeeded = clean(req.body?.serviceNeeded, 200);
    const budgetRange = clean(req.body?.budgetRange, 100);
    const needDescription = clean(req.body?.needDescription, 3000);
    const locale = clean(req.body?.locale, 12) || "fr";
    if (!companyName || !contactName || !emailIsValid(contactEmail) || !serviceNeeded || !needDescription || req.body?.contactConsent !== true) {
      res.status(400).json({ message: "Required fields and permission to contact you are missing." });
      return;
    }

    const duplicateFilters: Record<string, unknown>[] = [{ contactEmail }, { companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") }];
    if (website) duplicateFilters.push({ website });
    const possibleDuplicate = await ReferralLead.findOne({ $or: duplicateFilters }).select("_id");
    const lead = await ReferralLead.create({
      partner: partner._id,
      partnerId: partner.partnerId,
      partnerName: partner.name,
      partnerEmail: partner.email,
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
    partner.activity.push({ type: "note", message: `Prospect referral received for ${companyName}`, at: new Date() });
    await partner.save();
    const emailSent = await sendAdminNotice(
      `New prospect-confirmed referral - ${companyName}`,
      `<h2>New prospect-confirmed CPRPP referral</h2><p><strong>Partner:</strong> ${escapeHtml(partner.partnerId)} - ${escapeHtml(partner.name)}</p><p><strong>Company:</strong> ${escapeHtml(companyName)}</p><p><strong>Contact:</strong> ${escapeHtml(contactName)} (${escapeHtml(contactEmail)})</p><p><strong>Service:</strong> ${escapeHtml(serviceNeeded)}</p>`
    );
    res.status(201).json({ leadId: lead._id, status: lead.status, emailSent });
  } catch (error) {
    next(error);
  }
};

const pagination = (req: Request) => ({
  page: Math.max(1, Number(req.query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(req.query.limit) || 25)),
});

export const getReferralProgramSummary = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [pendingPartners, activePartners, leadsToReview, wonLeads, rewardsToApprove, paidRewards] = await Promise.all([
      ReferralPartner.countDocuments({ status: "pending" }),
      ReferralPartner.countDocuments({ status: { $in: ["approved", "active"] } }),
      ReferralLead.countDocuments({ status: { $in: ["submitted", "under_review", "waiting_for_introduction"] } }),
      ReferralLead.countDocuments({ status: "won" }),
      ReferralReward.countDocuments({ status: "earned" }),
      ReferralReward.countDocuments({ status: "paid" }),
    ]);
    res.json({ metrics: { pendingPartners, activePartners, leadsToReview, wonLeads, rewardsToApprove, paidRewards, attention: pendingPartners + leadsToReview + rewardsToApprove } });
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
    if (search) filter.$or = ["name", "email", "country", "partnerId"].map((field) => ({ [field]: new RegExp(escapeRegex(search), "i") }));
    const [partners, total] = await Promise.all([
      ReferralPartner.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      ReferralPartner.countDocuments(filter),
    ]);
    res.json({ partners, pagination: { currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)), total, limit } });
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
    }
    partner.status = status;
    partner.reviewedAt = new Date();
    partner.reviewedBy = getAdminEmail(req);
    partner.rejectionReason = status === "rejected" ? reason : undefined;
    partner.activity.push({ type: "status", message: `Status changed to ${status}${reason ? `: ${reason}` : ""}`, actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
    if (plainSecret) partner.activity.push({ type: "access", message: "Secure partner access regenerated", actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
    await partner.save();

    let emailSent = false;
    if (plainSecret) {
      const accessUrl = buildPrivatePartnerAccessUrl(FRONTEND_URL, partner.partnerId || "", plainSecret);
      const shareUrl = `${FRONTEND_URL}/referral-partners?ref=${encodeURIComponent(partner.referralCode || "")}#referred-business`;
      try {
        await sendEmail(partner.email, "Your Creativa Poeta Referral Partner access", `<h2>Welcome to the CPRPP</h2><p>Your application has been approved.</p><p><strong>Partner ID:</strong> ${escapeHtml(partner.partnerId)}</p><p><a href="${accessUrl}">Open your secure partner referral form</a></p><p><a href="${shareUrl}">Copy your prospect referral link</a></p><p>Send the prospect link to businesses that have agreed to the introduction. Keep the partner access link private.</p>`);
        emailSent = true;
      } catch (error) {
        console.error("Partner approval email failed:", error);
      }
    } else if (status === "rejected") {
      try {
        await sendEmail(partner.email, "Update on your Creativa Poeta partner application", `<p>Hello ${escapeHtml(partner.name)},</p><p>We reviewed your application. It has not been accepted at this time.</p><p>${escapeHtml(reason)}</p>`);
        emailSent = true;
      } catch (error) {
        console.error("Partner rejection email failed:", error);
      }
    }
    const safePartner = await ReferralPartner.findById(partner._id);
    res.json({ partner: safePartner, emailSent });
  } catch {
    res.status(500).json({ message: "Failed to update referral partner." });
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
    const capCents = Math.max(0, Math.round(Number(req.body?.capCents) || 20000));
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
