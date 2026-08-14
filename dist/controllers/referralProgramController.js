"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markReferralRewardPaid = exports.updateReferralRewardStatus = exports.upsertReferralReward = exports.getReferralRewards = exports.claimReferralLead = exports.updateReferralLead = exports.getReferralLeads = exports.updateReferralPartner = exports.getReferralPartners = exports.getReferralProgramSummary = exports.createManualReferralEntry = exports.submitProspectReferral = exports.submitDirectReferral = exports.submitReferralLead = exports.requestPartnerAccessRecovery = exports.applyToReferralProgram = exports.renderPartnerApprovalEmail = void 0;
const crypto_1 = __importDefault(require("crypto"));
const ReferralLead_1 = __importDefault(require("../models/ReferralLead"));
const ReferralPartner_1 = __importDefault(require("../models/ReferralPartner"));
const ReferralReward_1 = __importDefault(require("../models/ReferralReward"));
const referralProgramPolicy_1 = require("../domain/referralProgramPolicy");
const referralRateLimitService_1 = require("../services/referralRateLimitService");
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const TERMS_VERSION = "2026-08-11";
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://creativapoeta.com").replace(/\/$/, "");
const partnerStatuses = ["pending", "approved", "active", "rejected", "suspended", "closed"];
const leadStatuses = ["submitted", "waiting_for_introduction", "under_review", "accepted", "duplicate", "rejected", "contacted", "qualified", "proposal_sent", "won", "lost"];
const rewardStatuses = ["waiting_client_payment", "earned", "approved", "scheduled", "paid", "cancelled"];
const clean = (value, maxLength = 5000) => String(value || "").trim().slice(0, maxLength);
const cleanEmail = (value) => clean(value, 320).toLowerCase();
const cleanPhone = (value) => {
    const raw = clean(value, 80);
    if (!raw)
        return "";
    const digits = raw.replace(/\D/g, "");
    return digits ? `${raw.startsWith("+") ? "+" : ""}${digits}` : "";
};
const contactPreferences = ["email", "whatsapp", "phone", "sms", "other"];
const cleanContactPreference = (value, hasEmail, hasPhone) => {
    const candidate = clean(value, 20);
    if (!contactPreferences.includes(candidate))
        return hasEmail ? "email" : "whatsapp";
    if (candidate === "email" && !hasEmail && hasPhone)
        return "whatsapp";
    if (["whatsapp", "phone", "sms"].includes(candidate) && !hasPhone && hasEmail)
        return "email";
    return candidate;
};
const escapeHtml = (value) => clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
const emailIsValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phoneLookup = (value) => {
    const digits = value.replace(/\D/g, "");
    return new RegExp(`^\\D*${digits.split("").map(escapeRegex).join("\\D*")}\\D*$`);
};
const hashSecret = (value) => crypto_1.default.createHash("sha256").update(value).digest("hex");
const createSecret = () => crypto_1.default.randomBytes(32).toString("hex");
const getAdminEmail = (req) => { var _a; return cleanEmail((_a = req.user) === null || _a === void 0 ? void 0 : _a.email); };
const getAdminName = (req) => { var _a, _b; return clean(((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || "Admin", 200); };
const secretsMatch = (plain, hash) => {
    if (!plain || !hash)
        return false;
    const actual = Buffer.from(hashSecret(plain), "hex");
    const expected = Buffer.from(hash, "hex");
    return actual.length === expected.length && crypto_1.default.timingSafeEqual(actual, expected);
};
const createPartnerId = async (program) => {
    const prefix = program === "business" ? "CP-BP" : "CP-RP";
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = `${prefix}-${crypto_1.default.randomBytes(3).toString("hex").toUpperCase()}`;
        if (!(await ReferralPartner_1.default.exists({ partnerId: candidate })))
            return candidate;
    }
    return `${prefix}-${crypto_1.default.randomUUID().slice(0, 8).toUpperCase()}`;
};
const createReferralCode = async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = crypto_1.default.randomBytes(9).toString("base64url");
        if (!(await ReferralPartner_1.default.exists({ referralCode: candidate })))
            return candidate;
    }
    return crypto_1.default.randomUUID().replace(/-/g, "");
};
const sendAdminNotice = async (subject, html) => {
    if (!process.env.EMAIL_USER)
        return false;
    try {
        await (0, sendEmail_1.default)(process.env.EMAIL_USER, subject, html);
        return true;
    }
    catch (error) {
        console.error("Referral program admin email failed:", error);
        return false;
    }
};
const renderNonClickableUrl = (url) => {
    const escapedUrl = escapeHtml(url);
    const schemeSeparator = escapedUrl.indexOf("//");
    if (schemeSeparator < 0)
        return escapedUrl;
    return `<span>${escapedUrl.slice(0, schemeSeparator)}</span><span>${escapedUrl.slice(schemeSeparator)}</span>`;
};
const renderPartnerApprovalEmail = ({ partnerName, partnerId, accessUrl, shareUrl, }) => `
  <h2 style="margin:0 0 18px;color:#101828;font-size:26px;line-height:1.25;">Your application has been approved</h2>
  <p style="margin:0 0 14px;">Hello ${escapeHtml(partnerName)},</p>
  <p style="margin:0 0 22px;">Welcome to the Creativa Poeta client-introduction program. The two items below have different purposes.</p>

  <div style="margin:0 0 18px;padding:20px;border:1px solid #d0d5dd;border-radius:14px;background:#f8fafc;">
    <div style="margin:0 0 6px;color:#b4852b;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Your private access</div>
    <h3 style="margin:0 0 8px;color:#101828;font-size:19px;">Present a client to Creativa Poeta</h3>
    <p style="margin:0 0 16px;color:#475467;">This personal, secure link is for you only. Open it when you have found a person or company that needs digital services, then use the protected form to send us their details. Do not share this link.</p>
    <a href="${escapeHtml(accessUrl)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#071a33;color:#ffffff;text-decoration:none;font-weight:800;">Open my secure form&nbsp;&nbsp;&rarr;</a>
  </div>

  <div style="margin:0 0 18px;padding:20px;border:1px solid #e3b323;border-radius:14px;background:#fffaf0;">
    <div style="margin:0 0 6px;color:#8a6413;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Link to copy and share</div>
    <h3 style="margin:0 0 8px;color:#101828;font-size:19px;">Invite a potential client to complete the request</h3>
    <p style="margin:0 0 14px;color:#475467;">This public link is not a form for you. Copy it and send it to a person or company interested in Creativa Poeta services. They will complete their own request, which will automatically be associated with your Partner ID.</p>
    <div style="padding:13px 14px;border:1px dashed #b4852b;border-radius:9px;background:#ffffff;color:#182640;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.55;overflow-wrap:anywhere;user-select:all;">${renderNonClickableUrl(shareUrl)}</div>
    <div style="margin:10px 0 0;color:#8a6413;font-size:13px;font-weight:800;">&#10697;&nbsp; Select the link above, copy it, then share it by WhatsApp, email, SMS or social media.</div>
  </div>

  <p style="margin:0;color:#475467;"><strong>Partner ID:</strong> ${escapeHtml(partnerId)}</p>
`;
exports.renderPartnerApprovalEmail = renderPartnerApprovalEmail;
const applyToReferralProgram = async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    try {
        if (clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.websiteConfirmation, 200)) {
            res.status(201).json({ message: "Application received.", status: "pending" });
            return;
        }
        if (!(await (0, referralRateLimitService_1.consumeReferralRateLimit)(req, res, "partner_application"))) {
            res.status(429).json({ message: "Too many requests. Please try again later." });
            return;
        }
        const name = clean((_b = req.body) === null || _b === void 0 ? void 0 : _b.name, 200);
        const email = cleanEmail((_c = req.body) === null || _c === void 0 ? void 0 : _c.email);
        const phone = cleanPhone((_d = req.body) === null || _d === void 0 ? void 0 : _d.phone);
        const preferredContact = cleanContactPreference((_e = req.body) === null || _e === void 0 ? void 0 : _e.preferredContact, Boolean(email), Boolean(phone));
        const country = clean((_f = req.body) === null || _f === void 0 ? void 0 : _f.country, 120);
        const locale = clean((_g = req.body) === null || _g === void 0 ? void 0 : _g.locale, 12) || "fr";
        const profileType = clean((_h = req.body) === null || _h === void 0 ? void 0 : _h.profileType, 120);
        const program = ((_j = req.body) === null || _j === void 0 ? void 0 : _j.program) === "business" ? "business" : "referral";
        const website = clean((_k = req.body) === null || _k === void 0 ? void 0 : _k.website, 500);
        const networkDescription = clean((_l = req.body) === null || _l === void 0 ? void 0 : _l.networkDescription, 2000);
        const termsAccepted = ((_m = req.body) === null || _m === void 0 ? void 0 : _m.termsAccepted) === true;
        if (!name || (!email && !phone) || (email && !emailIsValid(email)) || !country || !profileType || !termsAccepted) {
            res.status(400).json({ message: "Required fields or terms acceptance are missing." });
            return;
        }
        const contactFilters = [];
        if (email)
            contactFilters.push({ email });
        if (phone)
            contactFilters.push({ phone: phoneLookup(phone) });
        const existing = await ReferralPartner_1.default.findOne({
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
        const partner = await ReferralPartner_1.default.create({
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
            marketingConsent: ((_o = req.body) === null || _o === void 0 ? void 0 : _o.marketingConsent) === true,
            activity: [{ type: "application", message: `${program} partner application submitted`, at: new Date() }],
        });
        const emailSent = await sendAdminNotice(`New ${program} partner application - ${name}`, `<h2>New client-introduction program application</h2><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email || "Not provided")}</p><p><strong>Phone / WhatsApp:</strong> ${escapeHtml(phone || "Not provided")}</p><p><strong>Preferred contact:</strong> ${escapeHtml(preferredContact)}</p><p><strong>Country:</strong> ${escapeHtml(country)}</p><p><strong>Program:</strong> ${escapeHtml(program)}</p>`);
        res.status(201).json({ applicationId: partner._id, outcome: "submitted", status: partner.status, emailSent });
    }
    catch (error) {
        next(error);
    }
};
exports.applyToReferralProgram = applyToReferralProgram;
const requestPartnerAccessRecovery = async (req, res, next) => {
    var _a, _b, _c;
    try {
        if (clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.websiteConfirmation, 200)) {
            res.status(202).json({ outcome: "received" });
            return;
        }
        const email = cleanEmail((_b = req.body) === null || _b === void 0 ? void 0 : _b.email);
        const phone = cleanPhone((_c = req.body) === null || _c === void 0 ? void 0 : _c.phone);
        if ((!email && !phone) || (email && !emailIsValid(email))) {
            res.status(400).json({ message: "Provide the email address or phone/WhatsApp number used for registration." });
            return;
        }
        const contactFilters = [];
        if (email)
            contactFilters.push({ email });
        if (phone)
            contactFilters.push({ phone: phoneLookup(phone) });
        const partner = await ReferralPartner_1.default.findOne({
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
            await sendAdminNotice(`Private referral access requested - ${partner.name}`, `<h2>Private referral access requested</h2><p><strong>Partner:</strong> ${escapeHtml(partner.partnerId || "Pending approval")} - ${escapeHtml(partner.name)}</p><p><strong>Email:</strong> ${escapeHtml(partner.email || "Not provided")}</p><p><strong>Phone / WhatsApp:</strong> ${escapeHtml(partner.phone || "Not provided")}</p><p>Open Referral &amp; Partners in the dashboard, review this partner and generate a new private link when appropriate.</p>`);
        }
        // Keep the public response neutral if a mistyped contact does not match.
        res.status(202).json({ outcome: "received" });
    }
    catch (error) {
        next(error);
    }
};
exports.requestPartnerAccessRecovery = requestPartnerAccessRecovery;
const submitReferralLead = async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    try {
        if (clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.websiteConfirmation, 200)) {
            res.status(201).json({ message: "Referral received.", status: "submitted" });
            return;
        }
        if (!(await (0, referralRateLimitService_1.consumeReferralRateLimit)(req, res, "partner_lead"))) {
            res.status(429).json({ message: "Too many requests. Please try again later." });
            return;
        }
        const partnerId = clean((_b = req.body) === null || _b === void 0 ? void 0 : _b.partnerId, 40).toUpperCase();
        const accessSecret = clean((_c = req.body) === null || _c === void 0 ? void 0 : _c.accessSecret, 200);
        const partner = await ReferralPartner_1.default.findOne({ partnerId }).select("+accessSecretHash");
        if (!partner || !["approved", "active"].includes(partner.status) || !secretsMatch(accessSecret, partner.accessSecretHash)) {
            res.status(403).json({ message: "The partner access link is invalid or inactive." });
            return;
        }
        const clientType = ((_d = req.body) === null || _d === void 0 ? void 0 : _d.clientType) === "person" ? "person" : "company";
        const companyName = clean((_e = req.body) === null || _e === void 0 ? void 0 : _e.companyName, 220);
        const contactName = clean((_f = req.body) === null || _f === void 0 ? void 0 : _f.contactName, 200);
        const contactEmail = cleanEmail((_g = req.body) === null || _g === void 0 ? void 0 : _g.contactEmail);
        const contactPhone = clean((_h = req.body) === null || _h === void 0 ? void 0 : _h.contactPhone, 80);
        const website = clean((_j = req.body) === null || _j === void 0 ? void 0 : _j.website, 500).toLowerCase();
        const serviceNeeded = clean((_k = req.body) === null || _k === void 0 ? void 0 : _k.serviceNeeded, 200);
        const budgetRange = clean((_l = req.body) === null || _l === void 0 ? void 0 : _l.budgetRange, 100);
        const needDescription = clean((_m = req.body) === null || _m === void 0 ? void 0 : _m.needDescription, 3000);
        const relationship = clean((_o = req.body) === null || _o === void 0 ? void 0 : _o.relationship, 200);
        const consentStatus = ((_p = req.body) === null || _p === void 0 ? void 0 : _p.consentStatus) === "agreed" ? "agreed" : "not_yet";
        const introductionMethod = clean((_q = req.body) === null || _q === void 0 ? void 0 : _q.introductionMethod, 120) || "partner_private_form";
        const introductionDetails = clean((_r = req.body) === null || _r === void 0 ? void 0 : _r.introductionDetails, 1500);
        const locale = clean((_s = req.body) === null || _s === void 0 ? void 0 : _s.locale, 12) || partner.locale || "fr";
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
        const duplicateFilters = [];
        if (contactEmail)
            duplicateFilters.push({ contactEmail });
        if (contactPhone)
            duplicateFilters.push({ contactPhone });
        if (website)
            duplicateFilters.push({ website });
        if (companyName)
            duplicateFilters.push({ companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") });
        if (clientType === "person")
            duplicateFilters.push({ clientType: "person", contactName: new RegExp(`^${escapeRegex(contactName)}$`, "i") });
        const possibleDuplicate = await ReferralLead_1.default.findOne({ $or: duplicateFilters }).select("_id");
        const initialStatus = consentStatus === "agreed" ? (possibleDuplicate ? "under_review" : "submitted") : "waiting_for_introduction";
        const lead = await ReferralLead_1.default.create({
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
                ...(possibleDuplicate ? [{ type: "note", message: "Possible duplicate detected; manual review required", at: new Date() }] : []),
            ],
        });
        if (partner.status === "approved")
            partner.status = "active";
        const clientLabel = companyName || contactName;
        partner.activity.push({ type: "note", message: `Referral submitted for ${clientLabel}`, at: new Date() });
        await partner.save();
        const emailSent = await sendAdminNotice(`New referral - ${clientLabel}`, `<h2>New client introduction</h2><p><strong>Partner:</strong> ${escapeHtml(partner.partnerId)} - ${escapeHtml(partner.name)}</p><p><strong>Client type:</strong> ${escapeHtml(clientType)}</p><p><strong>Client:</strong> ${escapeHtml(clientLabel)}</p><p><strong>Contact:</strong> ${escapeHtml(contactName)}</p><p><strong>Service:</strong> ${escapeHtml(serviceNeeded)}</p><p><strong>Consent:</strong> ${escapeHtml(consentStatus)}</p>`);
        res.status(201).json({ leadId: lead._id, status: lead.status, emailSent });
    }
    catch (error) {
        next(error);
    }
};
exports.submitReferralLead = submitReferralLead;
const submitDirectReferral = async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
    try {
        if (clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.websiteConfirmation, 200)) {
            res.status(201).json({ message: "Introduction received.", status: "submitted" });
            return;
        }
        if (!(await (0, referralRateLimitService_1.consumeReferralRateLimit)(req, res, "direct_referral"))) {
            res.status(429).json({ message: "Too many requests. Please try again later." });
            return;
        }
        const referrerName = clean((_b = req.body) === null || _b === void 0 ? void 0 : _b.referrerName, 200);
        const referrerEmail = cleanEmail((_c = req.body) === null || _c === void 0 ? void 0 : _c.referrerEmail);
        const referrerPhone = cleanPhone((_d = req.body) === null || _d === void 0 ? void 0 : _d.referrerPhone);
        const preferredContact = cleanContactPreference((_e = req.body) === null || _e === void 0 ? void 0 : _e.preferredContact, Boolean(referrerEmail), Boolean(referrerPhone));
        const referrerCountry = clean((_f = req.body) === null || _f === void 0 ? void 0 : _f.referrerCountry, 120);
        const referrerProfileType = clean((_g = req.body) === null || _g === void 0 ? void 0 : _g.referrerProfileType, 120) || "individual";
        const referrerWebsite = clean((_h = req.body) === null || _h === void 0 ? void 0 : _h.referrerWebsite, 500);
        const locale = clean((_j = req.body) === null || _j === void 0 ? void 0 : _j.locale, 12) || "fr";
        const termsAccepted = ((_k = req.body) === null || _k === void 0 ? void 0 : _k.termsAccepted) === true;
        const clientType = ((_l = req.body) === null || _l === void 0 ? void 0 : _l.clientType) === "person" ? "person" : "company";
        const companyName = clean((_m = req.body) === null || _m === void 0 ? void 0 : _m.companyName, 220);
        const contactName = clean((_o = req.body) === null || _o === void 0 ? void 0 : _o.contactName, 200);
        const contactEmail = cleanEmail((_p = req.body) === null || _p === void 0 ? void 0 : _p.contactEmail);
        const contactPhone = clean((_q = req.body) === null || _q === void 0 ? void 0 : _q.contactPhone, 80);
        const website = clean((_r = req.body) === null || _r === void 0 ? void 0 : _r.website, 500).toLowerCase();
        const serviceNeeded = clean((_s = req.body) === null || _s === void 0 ? void 0 : _s.serviceNeeded, 200);
        const budgetRange = clean((_t = req.body) === null || _t === void 0 ? void 0 : _t.budgetRange, 100);
        const needDescription = clean((_u = req.body) === null || _u === void 0 ? void 0 : _u.needDescription, 3000);
        const relationship = clean((_v = req.body) === null || _v === void 0 ? void 0 : _v.relationship, 200);
        const consentStatus = ((_w = req.body) === null || _w === void 0 ? void 0 : _w.consentStatus) === "agreed" ? "agreed" : "not_yet";
        const introductionMethod = clean((_x = req.body) === null || _x === void 0 ? void 0 : _x.introductionMethod, 120) || "direct_introduction_form";
        const introductionDetails = clean((_y = req.body) === null || _y === void 0 ? void 0 : _y.introductionDetails, 1500);
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
        const referrerContactFilters = [];
        if (referrerEmail)
            referrerContactFilters.push({ email: referrerEmail });
        if (referrerPhone)
            referrerContactFilters.push({ phone: phoneLookup(referrerPhone) });
        let partner = await ReferralPartner_1.default.findOne({
            $or: referrerContactFilters,
        }).select("+referralCode");
        if ((partner === null || partner === void 0 ? void 0 : partner.status) === "suspended") {
            res.status(403).json({ message: "This program account is currently inactive." });
            return;
        }
        if (!partner) {
            partner = await ReferralPartner_1.default.create({
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
        }
        else {
            if (!partner.partnerId)
                partner.partnerId = await createPartnerId(partner.program);
            if (!partner.referralCode)
                partner.referralCode = await createReferralCode();
        }
        const duplicateFilters = [];
        if (contactEmail)
            duplicateFilters.push({ contactEmail });
        if (contactPhone)
            duplicateFilters.push({ contactPhone });
        if (website)
            duplicateFilters.push({ website });
        if (companyName)
            duplicateFilters.push({ companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") });
        if (clientType === "person")
            duplicateFilters.push({ clientType: "person", contactName: new RegExp(`^${escapeRegex(contactName)}$`, "i") });
        const possibleDuplicate = await ReferralLead_1.default.findOne({ $or: duplicateFilters }).select("_id");
        const initialStatus = consentStatus === "agreed"
            ? (possibleDuplicate ? "under_review" : "submitted")
            : "waiting_for_introduction";
        const lead = await ReferralLead_1.default.create({
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
                ...(possibleDuplicate ? [{ type: "note", message: "Possible duplicate detected; manual review required", at: new Date() }] : []),
            ],
        });
        if (partner.status === "approved")
            partner.status = "active";
        const clientLabel = companyName || contactName;
        partner.activity.push({ type: "note", message: `Client introduction submitted for ${clientLabel}`, at: new Date() });
        await partner.save();
        const emailSent = await sendAdminNotice(`New direct client introduction - ${clientLabel}`, `<h2>New client introduction and program registration</h2><p><strong>Introducer:</strong> ${escapeHtml(partner.partnerId)} - ${escapeHtml(partner.name)}</p><p><strong>Introducer contact:</strong> ${escapeHtml(partner.email || partner.phone || "Not provided")}</p><p><strong>Client type:</strong> ${escapeHtml(clientType)}</p><p><strong>Client:</strong> ${escapeHtml(clientLabel)}</p><p><strong>Contact:</strong> ${escapeHtml(contactName)}</p><p><strong>Service:</strong> ${escapeHtml(serviceNeeded)}</p><p><strong>Consent:</strong> ${escapeHtml(consentStatus)}</p>`);
        res.status(201).json({
            leadId: lead._id,
            status: lead.status,
            partnerId: partner.partnerId,
            applicationStatus: partner.status,
            emailSent,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.submitDirectReferral = submitDirectReferral;
const submitProspectReferral = async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    try {
        if (clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.websiteConfirmation, 200)) {
            res.status(201).json({ message: "Request received.", status: "submitted" });
            return;
        }
        if (!(await (0, referralRateLimitService_1.consumeReferralRateLimit)(req, res, "prospect_referral"))) {
            res.status(429).json({ message: "Too many requests. Please try again later." });
            return;
        }
        const referralCode = clean((_b = req.body) === null || _b === void 0 ? void 0 : _b.referralCode, 100);
        const partner = await ReferralPartner_1.default.findOne({ referralCode, status: { $in: ["approved", "active"] } }).select("+referralCode");
        if (!partner) {
            res.status(404).json({ message: "This referral invitation is invalid or inactive." });
            return;
        }
        const clientType = ((_c = req.body) === null || _c === void 0 ? void 0 : _c.clientType) === "person" ? "person" : "company";
        const companyName = clean((_d = req.body) === null || _d === void 0 ? void 0 : _d.companyName, 220);
        const contactName = clean((_e = req.body) === null || _e === void 0 ? void 0 : _e.contactName, 200);
        const contactEmail = cleanEmail((_f = req.body) === null || _f === void 0 ? void 0 : _f.contactEmail);
        const contactPhone = clean((_g = req.body) === null || _g === void 0 ? void 0 : _g.contactPhone, 80);
        const website = clean((_h = req.body) === null || _h === void 0 ? void 0 : _h.website, 500).toLowerCase();
        const serviceNeeded = clean((_j = req.body) === null || _j === void 0 ? void 0 : _j.serviceNeeded, 200);
        const budgetRange = clean((_k = req.body) === null || _k === void 0 ? void 0 : _k.budgetRange, 100);
        const needDescription = clean((_l = req.body) === null || _l === void 0 ? void 0 : _l.needDescription, 3000);
        const locale = clean((_m = req.body) === null || _m === void 0 ? void 0 : _m.locale, 12) || "fr";
        if ((clientType === "company" && !companyName) || !contactName || (!contactEmail && !contactPhone) || (contactEmail && !emailIsValid(contactEmail)) || !serviceNeeded || ((_o = req.body) === null || _o === void 0 ? void 0 : _o.contactConsent) !== true) {
            res.status(400).json({ message: "Required fields and permission to contact you are missing." });
            return;
        }
        const duplicateFilters = [];
        if (contactEmail)
            duplicateFilters.push({ contactEmail });
        if (contactPhone)
            duplicateFilters.push({ contactPhone });
        if (companyName)
            duplicateFilters.push({ companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") });
        if (clientType === "person")
            duplicateFilters.push({ clientType: "person", contactName: new RegExp(`^${escapeRegex(contactName)}$`, "i") });
        if (website)
            duplicateFilters.push({ website });
        const possibleDuplicate = await ReferralLead_1.default.findOne({ $or: duplicateFilters }).select("_id");
        const lead = await ReferralLead_1.default.create({
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
                ...(possibleDuplicate ? [{ type: "note", message: "Possible duplicate detected; manual review required", at: new Date() }] : []),
            ],
        });
        if (partner.status === "approved")
            partner.status = "active";
        const clientLabel = companyName || contactName;
        partner.activity.push({ type: "note", message: `Prospect referral received for ${clientLabel}`, at: new Date() });
        await partner.save();
        const emailSent = await sendAdminNotice(`New prospect-confirmed referral - ${clientLabel}`, `<h2>New prospect-confirmed client introduction</h2><p><strong>Partner:</strong> ${escapeHtml(partner.partnerId)} - ${escapeHtml(partner.name)}</p><p><strong>Client type:</strong> ${escapeHtml(clientType)}</p><p><strong>Client:</strong> ${escapeHtml(clientLabel)}</p><p><strong>Contact:</strong> ${escapeHtml(contactName)} (${escapeHtml(contactEmail || contactPhone)})</p><p><strong>Service:</strong> ${escapeHtml(serviceNeeded)}</p>`);
        res.status(201).json({ leadId: lead._id, status: lead.status, emailSent });
    }
    catch (error) {
        next(error);
    }
};
exports.submitProspectReferral = submitProspectReferral;
const createManualReferralEntry = async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4;
    try {
        const existingPartnerId = clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.existingPartnerId, 40).toUpperCase();
        const approveNow = ((_b = req.body) === null || _b === void 0 ? void 0 : _b.approveNow) === true;
        const regenerateAccess = ((_c = req.body) === null || _c === void 0 ? void 0 : _c.regenerateAccess) === true;
        const includeClient = ((_d = req.body) === null || _d === void 0 ? void 0 : _d.includeClient) === true;
        let partner = existingPartnerId
            ? await ReferralPartner_1.default.findOne({ partnerId: existingPartnerId }).select("+accessSecretHash +referralCode")
            : null;
        if (existingPartnerId && !partner) {
            res.status(404).json({ message: "The selected partner ID was not found." });
            return;
        }
        if (!partner) {
            const name = clean((_e = req.body) === null || _e === void 0 ? void 0 : _e.name, 200);
            const email = cleanEmail((_f = req.body) === null || _f === void 0 ? void 0 : _f.email);
            const phone = cleanPhone((_g = req.body) === null || _g === void 0 ? void 0 : _g.phone);
            const country = clean((_h = req.body) === null || _h === void 0 ? void 0 : _h.country, 120);
            const profileType = clean((_j = req.body) === null || _j === void 0 ? void 0 : _j.profileType, 120);
            const locale = clean((_k = req.body) === null || _k === void 0 ? void 0 : _k.locale, 12) || "fr";
            const program = ((_l = req.body) === null || _l === void 0 ? void 0 : _l.program) === "business" ? "business" : "referral";
            const preferredContact = cleanContactPreference((_m = req.body) === null || _m === void 0 ? void 0 : _m.preferredContact, Boolean(email), Boolean(phone));
            if (!name || (!email && !phone) || (email && !emailIsValid(email)) || !country || !profileType || ((_o = req.body) === null || _o === void 0 ? void 0 : _o.termsAccepted) !== true) {
                res.status(400).json({ message: "Provide the introducer's name, country, profile, accepted terms and at least an email or phone/WhatsApp number." });
                return;
            }
            const contactFilters = [];
            if (email)
                contactFilters.push({ email });
            if (phone)
                contactFilters.push({ phone: phoneLookup(phone) });
            const duplicatePartner = await ReferralPartner_1.default.findOne({
                $or: contactFilters,
            });
            if (duplicatePartner) {
                res.status(409).json({ message: `This contact already belongs to partner ${duplicatePartner.partnerId || duplicatePartner._id}. Use the existing partner ID instead.` });
                return;
            }
            partner = await ReferralPartner_1.default.create({
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
                website: clean((_p = req.body) === null || _p === void 0 ? void 0 : _p.website, 500),
                status: "pending",
                termsVersion: TERMS_VERSION,
                termsAcceptedAt: new Date(),
                marketingConsent: ((_q = req.body) === null || _q === void 0 ? void 0 : _q.marketingConsent) === true,
                activity: [{ type: "application", message: "Application manually recorded from an external contact channel", actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() }],
            });
        }
        if (!partner) {
            res.status(500).json({ message: "Unable to create the partner record." });
            return;
        }
        if (!partner.partnerId)
            partner.partnerId = await createPartnerId(partner.program);
        if (!partner.referralCode)
            partner.referralCode = await createReferralCode();
        let plainSecret = "";
        if (approveNow) {
            if (!["approved", "active"].includes(partner.status))
                partner.status = "approved";
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
            const clientType = ((_r = req.body) === null || _r === void 0 ? void 0 : _r.clientType) === "person" ? "person" : "company";
            const companyName = clean((_s = req.body) === null || _s === void 0 ? void 0 : _s.companyName, 220);
            const contactName = clean((_t = req.body) === null || _t === void 0 ? void 0 : _t.contactName, 200);
            const contactEmail = cleanEmail((_u = req.body) === null || _u === void 0 ? void 0 : _u.contactEmail);
            const contactPhone = cleanPhone((_v = req.body) === null || _v === void 0 ? void 0 : _v.contactPhone);
            const website = clean((_w = req.body) === null || _w === void 0 ? void 0 : _w.clientWebsite, 500).toLowerCase();
            const serviceNeeded = clean((_x = req.body) === null || _x === void 0 ? void 0 : _x.serviceNeeded, 200);
            const needDescription = clean((_y = req.body) === null || _y === void 0 ? void 0 : _y.needDescription, 3000);
            const relationship = clean((_z = req.body) === null || _z === void 0 ? void 0 : _z.relationship, 200) || "Recorded by Creativa Poeta from an external contact channel";
            const introductionMethod = clean((_0 = req.body) === null || _0 === void 0 ? void 0 : _0.introductionMethod, 120) || "manual_admin_entry";
            const consentStatus = ((_1 = req.body) === null || _1 === void 0 ? void 0 : _1.consentStatus) === "agreed" ? "agreed" : "not_yet";
            if ((clientType === "company" && !companyName) || !contactName || (!contactEmail && !contactPhone) || (contactEmail && !emailIsValid(contactEmail)) || !serviceNeeded) {
                res.status(400).json({ message: "Complete the required client fields and provide a client email or phone number." });
                return;
            }
            const duplicateFilters = [];
            if (contactEmail)
                duplicateFilters.push({ contactEmail });
            if (contactPhone)
                duplicateFilters.push({ contactPhone });
            if (website)
                duplicateFilters.push({ website });
            if (companyName)
                duplicateFilters.push({ companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") });
            if (clientType === "person")
                duplicateFilters.push({ clientType: "person", contactName: new RegExp(`^${escapeRegex(contactName)}$`, "i") });
            const possibleDuplicate = await ReferralLead_1.default.findOne({ $or: duplicateFilters }).select("_id");
            const status = consentStatus === "agreed"
                ? (possibleDuplicate ? "under_review" : "submitted")
                : "waiting_for_introduction";
            lead = await ReferralLead_1.default.create({
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
                budgetRange: clean((_2 = req.body) === null || _2 === void 0 ? void 0 : _2.budgetRange, 100),
                needDescription,
                relationship,
                consentStatus,
                introductionMethod,
                introductionDetails: clean((_3 = req.body) === null || _3 === void 0 ? void 0 : _3.introductionDetails, 1500),
                locale: clean((_4 = req.body) === null || _4 === void 0 ? void 0 : _4.locale, 12) || partner.locale || "fr",
                status,
                activity: [
                    { type: "submitted", message: "Client introduction manually recorded by an administrator", actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() },
                    ...(possibleDuplicate ? [{ type: "note", message: "Possible duplicate detected; manual review required", actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() }] : []),
                ],
            });
            partner.activity.push({ type: "note", message: `Manual client introduction recorded for ${companyName || contactName}`, actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
        }
        await partner.save();
        const accessUrl = plainSecret ? (0, referralProgramPolicy_1.buildPrivatePartnerAccessUrl)(FRONTEND_URL, partner.partnerId || "", plainSecret) : undefined;
        const shareUrl = ["approved", "active"].includes(partner.status)
            ? `${FRONTEND_URL}/referral-partners?ref=${encodeURIComponent(partner.referralCode || "")}#referred-business`
            : undefined;
        const safePartner = await ReferralPartner_1.default.findById(partner._id);
        res.status(201).json({ partner: safePartner, lead, accessUrl, shareUrl });
    }
    catch (error) {
        console.error("Manual referral entry failed:", error);
        res.status(500).json({ message: "Failed to create the manual referral entry." });
    }
};
exports.createManualReferralEntry = createManualReferralEntry;
const pagination = (req) => ({
    page: Math.max(1, Number(req.query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(req.query.limit) || 25)),
});
const getReferralProgramSummary = async (_req, res) => {
    try {
        const [pendingPartners, activePartners, accessRecoveryPending, leadsToReview, wonLeads, rewardsToApprove, paidRewards] = await Promise.all([
            ReferralPartner_1.default.countDocuments({ status: "pending" }),
            ReferralPartner_1.default.countDocuments({ status: { $in: ["approved", "active"] } }),
            ReferralPartner_1.default.countDocuments({ accessRecoveryStatus: "pending" }),
            ReferralLead_1.default.countDocuments({ status: { $in: ["submitted", "under_review", "waiting_for_introduction"] } }),
            ReferralLead_1.default.countDocuments({ status: "won" }),
            ReferralReward_1.default.countDocuments({ status: "earned" }),
            ReferralReward_1.default.countDocuments({ status: "paid" }),
        ]);
        res.json({ metrics: { pendingPartners, activePartners, accessRecoveryPending, leadsToReview, wonLeads, rewardsToApprove, paidRewards, attention: pendingPartners + accessRecoveryPending + leadsToReview + rewardsToApprove } });
    }
    catch {
        res.status(500).json({ message: "Failed to fetch referral program summary." });
    }
};
exports.getReferralProgramSummary = getReferralProgramSummary;
const getReferralPartners = async (req, res) => {
    try {
        const { page, limit } = pagination(req);
        const status = clean(req.query.status, 40);
        const search = clean(req.query.search, 200);
        const filter = {};
        if (status && status !== "all" && partnerStatuses.includes(status))
            filter.status = status;
        if (search)
            filter.$or = ["name", "email", "phone", "country", "partnerId"].map((field) => ({ [field]: new RegExp(escapeRegex(search), "i") }));
        const [partners, total] = await Promise.all([
            ReferralPartner_1.default.find(filter).sort({ accessRecoveryRequestedAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
            ReferralPartner_1.default.countDocuments(filter),
        ]);
        res.json({ partners, pagination: { currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)), total, limit } });
    }
    catch {
        res.status(500).json({ message: "Failed to fetch referral partners." });
    }
};
exports.getReferralPartners = getReferralPartners;
const updateReferralPartner = async (req, res) => {
    var _a, _b, _c;
    try {
        const status = clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.status, 40);
        if (!partnerStatuses.includes(status)) {
            res.status(400).json({ message: "Invalid partner status." });
            return;
        }
        const partner = await ReferralPartner_1.default.findById(req.params.id).select("+accessSecretHash +referralCode");
        if (!partner) {
            res.status(404).json({ message: "Referral partner not found." });
            return;
        }
        const reason = clean((_b = req.body) === null || _b === void 0 ? void 0 : _b.reason, 1000);
        if (status === "rejected" && !reason) {
            res.status(400).json({ message: "A rejection reason is required." });
            return;
        }
        let plainSecret = "";
        if (["approved", "active"].includes(status) && (!partner.partnerId || !partner.accessSecretHash || ((_c = req.body) === null || _c === void 0 ? void 0 : _c.regenerateAccess) === true)) {
            if (!partner.partnerId)
                partner.partnerId = await createPartnerId(partner.program);
            if (!partner.referralCode)
                partner.referralCode = await createReferralCode();
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
        if (plainSecret)
            partner.activity.push({ type: "access", message: "Secure partner access regenerated", actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
        await partner.save();
        let emailSent = false;
        let accessUrl = "";
        let shareUrl = "";
        if (plainSecret) {
            accessUrl = (0, referralProgramPolicy_1.buildPrivatePartnerAccessUrl)(FRONTEND_URL, partner.partnerId || "", plainSecret);
            shareUrl = `${FRONTEND_URL}/referral-partners?ref=${encodeURIComponent(partner.referralCode || "")}#referred-business`;
            if (partner.email) {
                try {
                    await (0, sendEmail_1.default)(partner.email, "Your Creativa Poeta client-introduction program access", (0, exports.renderPartnerApprovalEmail)({
                        partnerName: partner.name,
                        partnerId: partner.partnerId || "",
                        accessUrl,
                        shareUrl,
                    }));
                    emailSent = true;
                }
                catch (error) {
                    console.error("Partner approval email failed:", error);
                }
            }
        }
        else if (status === "rejected" && partner.email) {
            try {
                await (0, sendEmail_1.default)(partner.email, "Update on your Creativa Poeta partner application", `<p>Hello ${escapeHtml(partner.name)},</p><p>We reviewed your application. It has not been accepted at this time.</p><p>${escapeHtml(reason)}</p>`);
                emailSent = true;
            }
            catch (error) {
                console.error("Partner rejection email failed:", error);
            }
        }
        const safePartner = await ReferralPartner_1.default.findById(partner._id);
        res.json({ partner: safePartner, emailSent, accessUrl: accessUrl || undefined, shareUrl: shareUrl || undefined });
    }
    catch {
        res.status(500).json({ message: "Failed to update referral partner." });
    }
};
exports.updateReferralPartner = updateReferralPartner;
const getReferralLeads = async (req, res) => {
    try {
        const { page, limit } = pagination(req);
        const status = clean(req.query.status, 40);
        const search = clean(req.query.search, 200);
        const filter = {};
        if (status && status !== "all" && leadStatuses.includes(status))
            filter.status = status;
        if (search)
            filter.$or = ["companyName", "contactName", "contactEmail", "partnerId", "partnerName"].map((field) => ({ [field]: new RegExp(escapeRegex(search), "i") }));
        const [leads, total] = await Promise.all([
            ReferralLead_1.default.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
            ReferralLead_1.default.countDocuments(filter),
        ]);
        res.json({ leads, pagination: { currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)), total, limit } });
    }
    catch {
        res.status(500).json({ message: "Failed to fetch referral leads." });
    }
};
exports.getReferralLeads = getReferralLeads;
const updateReferralLead = async (req, res) => {
    var _a, _b, _c;
    try {
        const lead = await ReferralLead_1.default.findById(req.params.id);
        if (!lead) {
            res.status(404).json({ message: "Referral lead not found." });
            return;
        }
        const status = clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.status, 40);
        const eligibility = clean((_b = req.body) === null || _b === void 0 ? void 0 : _b.eligibility, 40);
        const reason = clean((_c = req.body) === null || _c === void 0 ? void 0 : _c.reason, 1500);
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
        if (reason)
            lead.decisionReason = reason;
        await lead.save();
        res.json({ lead });
    }
    catch {
        res.status(500).json({ message: "Failed to update referral lead." });
    }
};
exports.updateReferralLead = updateReferralLead;
const claimReferralLead = async (req, res) => {
    try {
        const lead = await ReferralLead_1.default.findById(req.params.id);
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
    }
    catch {
        res.status(500).json({ message: "Failed to assign referral lead." });
    }
};
exports.claimReferralLead = claimReferralLead;
const getReferralRewards = async (req, res) => {
    try {
        const { page, limit } = pagination(req);
        const status = clean(req.query.status, 40);
        const filter = {};
        if (status && status !== "all" && rewardStatuses.includes(status))
            filter.status = status;
        const [rewards, total] = await Promise.all([
            ReferralReward_1.default.find(filter).populate("lead", "companyName status").populate("partner", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
            ReferralReward_1.default.countDocuments(filter),
        ]);
        res.json({ rewards, pagination: { currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)), total, limit } });
    }
    catch {
        res.status(500).json({ message: "Failed to fetch referral rewards." });
    }
};
exports.getReferralRewards = getReferralRewards;
const upsertReferralReward = async (req, res) => {
    var _a, _b, _c;
    try {
        const lead = await ReferralLead_1.default.findById(req.params.leadId);
        if (!lead) {
            res.status(404).json({ message: "Referral lead not found." });
            return;
        }
        if (lead.status !== "won" || lead.eligibility !== "eligible") {
            res.status(409).json({ message: "A reward can only be created for a won and eligible referral." });
            return;
        }
        const existingReward = await ReferralReward_1.default.findOne({ lead: lead._id });
        if (existingReward && existingReward.status !== "waiting_client_payment") {
            res.status(409).json({ message: "Financial values cannot be changed after client payment has been acknowledged." });
            return;
        }
        const eligibleRevenueCents = Math.max(0, Math.round(Number((_a = req.body) === null || _a === void 0 ? void 0 : _a.eligibleRevenueCents) || 0));
        const rateBasisPoints = Math.min(10000, Math.max(0, Math.round(Number((_b = req.body) === null || _b === void 0 ? void 0 : _b.rateBasisPoints) || 1000)));
        const capCents = Math.max(0, Math.round(Number((_c = req.body) === null || _c === void 0 ? void 0 : _c.capCents) || 0));
        if (eligibleRevenueCents <= 0) {
            res.status(400).json({ message: "Eligible revenue must be greater than zero." });
            return;
        }
        const amountCents = (0, referralProgramPolicy_1.calculateReferralReward)(eligibleRevenueCents, rateBasisPoints, capCents);
        const status = "waiting_client_payment";
        const set = {
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
        const reward = await ReferralReward_1.default.findOneAndUpdate({ lead: lead._id }, {
            $set: set,
            $push: { activity: { message: `Reward updated to ${status}: EUR ${(amountCents / 100).toFixed(2)}`, actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() } },
        }, { new: true, upsert: true, setDefaultsOnInsert: true });
        res.json({ reward });
    }
    catch {
        res.status(500).json({ message: "Failed to update referral reward." });
    }
};
exports.upsertReferralReward = upsertReferralReward;
const updateReferralRewardStatus = async (req, res) => {
    var _a;
    try {
        const status = clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.status, 40);
        if (!["earned", "approved", "scheduled", "cancelled"].includes(status)) {
            res.status(400).json({ message: "Invalid reward workflow status." });
            return;
        }
        const reward = await ReferralReward_1.default.findById(req.params.id);
        if (!reward) {
            res.status(404).json({ message: "Referral reward not found." });
            return;
        }
        if (!(0, referralProgramPolicy_1.canTransitionReferralReward)(reward.status, status)) {
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
    }
    catch {
        res.status(500).json({ message: "Failed to update referral reward status." });
    }
};
exports.updateReferralRewardStatus = updateReferralRewardStatus;
const markReferralRewardPaid = async (req, res) => {
    var _a;
    try {
        const paymentReference = clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.paymentReference, 300);
        if (!paymentReference) {
            res.status(400).json({ message: "A payment reference is required." });
            return;
        }
        const reward = await ReferralReward_1.default.findById(req.params.id);
        if (!reward) {
            res.status(404).json({ message: "Referral reward not found." });
            return;
        }
        if (!(0, referralProgramPolicy_1.canTransitionReferralReward)(reward.status, "paid")) {
            res.status(409).json({ message: "Only a scheduled reward can be marked as paid." });
            return;
        }
        reward.status = "paid";
        reward.paymentReference = paymentReference;
        reward.paidAt = new Date();
        reward.activity.push({ message: `Reward marked paid (${paymentReference})`, actorEmail: getAdminEmail(req), actorName: getAdminName(req), at: new Date() });
        await reward.save();
        res.json({ reward });
    }
    catch {
        res.status(500).json({ message: "Failed to mark referral reward as paid." });
    }
};
exports.markReferralRewardPaid = markReferralRewardPaid;
