"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markReferralRewardPaid = exports.updateReferralRewardStatus = exports.upsertReferralReward = exports.getReferralRewards = exports.claimReferralLead = exports.updateReferralLead = exports.getReferralLeads = exports.updateReferralPartner = exports.getReferralPartners = exports.getReferralProgramSummary = exports.submitProspectReferral = exports.submitReferralLead = exports.applyToReferralProgram = void 0;
const crypto_1 = __importDefault(require("crypto"));
const ReferralLead_1 = __importDefault(require("../models/ReferralLead"));
const ReferralPartner_1 = __importDefault(require("../models/ReferralPartner"));
const ReferralReward_1 = __importDefault(require("../models/ReferralReward"));
const referralProgramPolicy_1 = require("../domain/referralProgramPolicy");
const referralRateLimitService_1 = require("../services/referralRateLimitService");
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const TERMS_VERSION = "2026-08-10";
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://creativapoeta.com").replace(/\/$/, "");
const partnerStatuses = ["pending", "approved", "active", "rejected", "suspended", "closed"];
const leadStatuses = ["submitted", "waiting_for_introduction", "under_review", "accepted", "duplicate", "rejected", "contacted", "qualified", "proposal_sent", "won", "lost"];
const rewardStatuses = ["waiting_client_payment", "earned", "approved", "scheduled", "paid", "cancelled"];
const clean = (value, maxLength = 5000) => String(value || "").trim().slice(0, maxLength);
const cleanEmail = (value) => clean(value, 320).toLowerCase();
const escapeHtml = (value) => clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
const emailIsValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
const applyToReferralProgram = async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
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
        const country = clean((_d = req.body) === null || _d === void 0 ? void 0 : _d.country, 120);
        const locale = clean((_e = req.body) === null || _e === void 0 ? void 0 : _e.locale, 12) || "fr";
        const profileType = clean((_f = req.body) === null || _f === void 0 ? void 0 : _f.profileType, 120);
        const program = ((_g = req.body) === null || _g === void 0 ? void 0 : _g.program) === "business" ? "business" : "referral";
        const website = clean((_h = req.body) === null || _h === void 0 ? void 0 : _h.website, 500);
        const networkDescription = clean((_j = req.body) === null || _j === void 0 ? void 0 : _j.networkDescription, 2000);
        const termsAccepted = ((_k = req.body) === null || _k === void 0 ? void 0 : _k.termsAccepted) === true;
        if (!name || !emailIsValid(email) || !country || !profileType || !termsAccepted) {
            res.status(400).json({ message: "Required fields or terms acceptance are missing." });
            return;
        }
        const existing = await ReferralPartner_1.default.findOne({
            email,
            status: { $in: ["pending", "approved", "active", "suspended"] },
        });
        if (existing) {
            res.status(201).json({ message: "Application received.", status: "pending" });
            return;
        }
        const partner = await ReferralPartner_1.default.create({
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
            marketingConsent: ((_l = req.body) === null || _l === void 0 ? void 0 : _l.marketingConsent) === true,
            activity: [{ type: "application", message: `${program} partner application submitted`, at: new Date() }],
        });
        const emailSent = await sendAdminNotice(`New ${program} partner application - ${name}`, `<h2>New CPRPP application</h2><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Country:</strong> ${escapeHtml(country)}</p><p><strong>Program:</strong> ${escapeHtml(program)}</p>`);
        res.status(201).json({ applicationId: partner._id, status: partner.status, emailSent });
    }
    catch (error) {
        next(error);
    }
};
exports.applyToReferralProgram = applyToReferralProgram;
const submitReferralLead = async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
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
        const companyName = clean((_d = req.body) === null || _d === void 0 ? void 0 : _d.companyName, 220);
        const contactName = clean((_e = req.body) === null || _e === void 0 ? void 0 : _e.contactName, 200);
        const contactEmail = cleanEmail((_f = req.body) === null || _f === void 0 ? void 0 : _f.contactEmail);
        const contactPhone = clean((_g = req.body) === null || _g === void 0 ? void 0 : _g.contactPhone, 80);
        const website = clean((_h = req.body) === null || _h === void 0 ? void 0 : _h.website, 500).toLowerCase();
        const serviceNeeded = clean((_j = req.body) === null || _j === void 0 ? void 0 : _j.serviceNeeded, 200);
        const budgetRange = clean((_k = req.body) === null || _k === void 0 ? void 0 : _k.budgetRange, 100);
        const needDescription = clean((_l = req.body) === null || _l === void 0 ? void 0 : _l.needDescription, 3000);
        const relationship = clean((_m = req.body) === null || _m === void 0 ? void 0 : _m.relationship, 200);
        const consentStatus = ((_o = req.body) === null || _o === void 0 ? void 0 : _o.consentStatus) === "agreed" ? "agreed" : "not_yet";
        const introductionMethod = clean((_p = req.body) === null || _p === void 0 ? void 0 : _p.introductionMethod, 120);
        const introductionDetails = clean((_q = req.body) === null || _q === void 0 ? void 0 : _q.introductionDetails, 1500);
        const locale = clean((_r = req.body) === null || _r === void 0 ? void 0 : _r.locale, 12) || partner.locale || "fr";
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
        const duplicateFilters = [];
        if (contactEmail)
            duplicateFilters.push({ contactEmail });
        if (website)
            duplicateFilters.push({ website });
        duplicateFilters.push({ companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") });
        const possibleDuplicate = await ReferralLead_1.default.findOne({ $or: duplicateFilters }).select("_id");
        const initialStatus = consentStatus === "agreed" ? (possibleDuplicate ? "under_review" : "submitted") : "waiting_for_introduction";
        const lead = await ReferralLead_1.default.create({
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
                ...(possibleDuplicate ? [{ type: "note", message: "Possible duplicate detected; manual review required", at: new Date() }] : []),
            ],
        });
        if (partner.status === "approved")
            partner.status = "active";
        partner.activity.push({ type: "note", message: `Referral submitted for ${companyName}`, at: new Date() });
        await partner.save();
        const emailSent = await sendAdminNotice(`New referral - ${companyName}`, `<h2>New CPRPP referral</h2><p><strong>Partner:</strong> ${escapeHtml(partner.partnerId)} - ${escapeHtml(partner.name)}</p><p><strong>Company:</strong> ${escapeHtml(companyName)}</p><p><strong>Contact:</strong> ${escapeHtml(contactName)}</p><p><strong>Service:</strong> ${escapeHtml(serviceNeeded)}</p><p><strong>Consent:</strong> ${escapeHtml(consentStatus)}</p>`);
        res.status(201).json({ leadId: lead._id, status: lead.status, emailSent });
    }
    catch (error) {
        next(error);
    }
};
exports.submitReferralLead = submitReferralLead;
const submitProspectReferral = async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
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
        const companyName = clean((_c = req.body) === null || _c === void 0 ? void 0 : _c.companyName, 220);
        const contactName = clean((_d = req.body) === null || _d === void 0 ? void 0 : _d.contactName, 200);
        const contactEmail = cleanEmail((_e = req.body) === null || _e === void 0 ? void 0 : _e.contactEmail);
        const contactPhone = clean((_f = req.body) === null || _f === void 0 ? void 0 : _f.contactPhone, 80);
        const website = clean((_g = req.body) === null || _g === void 0 ? void 0 : _g.website, 500).toLowerCase();
        const serviceNeeded = clean((_h = req.body) === null || _h === void 0 ? void 0 : _h.serviceNeeded, 200);
        const budgetRange = clean((_j = req.body) === null || _j === void 0 ? void 0 : _j.budgetRange, 100);
        const needDescription = clean((_k = req.body) === null || _k === void 0 ? void 0 : _k.needDescription, 3000);
        const locale = clean((_l = req.body) === null || _l === void 0 ? void 0 : _l.locale, 12) || "fr";
        if (!companyName || !contactName || !emailIsValid(contactEmail) || !serviceNeeded || !needDescription || ((_m = req.body) === null || _m === void 0 ? void 0 : _m.contactConsent) !== true) {
            res.status(400).json({ message: "Required fields and permission to contact you are missing." });
            return;
        }
        const duplicateFilters = [{ contactEmail }, { companyName: new RegExp(`^${escapeRegex(companyName)}$`, "i") }];
        if (website)
            duplicateFilters.push({ website });
        const possibleDuplicate = await ReferralLead_1.default.findOne({ $or: duplicateFilters }).select("_id");
        const lead = await ReferralLead_1.default.create({
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
                ...(possibleDuplicate ? [{ type: "note", message: "Possible duplicate detected; manual review required", at: new Date() }] : []),
            ],
        });
        if (partner.status === "approved")
            partner.status = "active";
        partner.activity.push({ type: "note", message: `Prospect referral received for ${companyName}`, at: new Date() });
        await partner.save();
        const emailSent = await sendAdminNotice(`New prospect-confirmed referral - ${companyName}`, `<h2>New prospect-confirmed CPRPP referral</h2><p><strong>Partner:</strong> ${escapeHtml(partner.partnerId)} - ${escapeHtml(partner.name)}</p><p><strong>Company:</strong> ${escapeHtml(companyName)}</p><p><strong>Contact:</strong> ${escapeHtml(contactName)} (${escapeHtml(contactEmail)})</p><p><strong>Service:</strong> ${escapeHtml(serviceNeeded)}</p>`);
        res.status(201).json({ leadId: lead._id, status: lead.status, emailSent });
    }
    catch (error) {
        next(error);
    }
};
exports.submitProspectReferral = submitProspectReferral;
const pagination = (req) => ({
    page: Math.max(1, Number(req.query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(req.query.limit) || 25)),
});
const getReferralProgramSummary = async (_req, res) => {
    try {
        const [pendingPartners, activePartners, leadsToReview, wonLeads, rewardsToApprove, paidRewards] = await Promise.all([
            ReferralPartner_1.default.countDocuments({ status: "pending" }),
            ReferralPartner_1.default.countDocuments({ status: { $in: ["approved", "active"] } }),
            ReferralLead_1.default.countDocuments({ status: { $in: ["submitted", "under_review", "waiting_for_introduction"] } }),
            ReferralLead_1.default.countDocuments({ status: "won" }),
            ReferralReward_1.default.countDocuments({ status: "earned" }),
            ReferralReward_1.default.countDocuments({ status: "paid" }),
        ]);
        res.json({ metrics: { pendingPartners, activePartners, leadsToReview, wonLeads, rewardsToApprove, paidRewards, attention: pendingPartners + leadsToReview + rewardsToApprove } });
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
            filter.$or = ["name", "email", "country", "partnerId"].map((field) => ({ [field]: new RegExp(escapeRegex(search), "i") }));
        const [partners, total] = await Promise.all([
            ReferralPartner_1.default.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
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
        if (plainSecret) {
            const accessUrl = (0, referralProgramPolicy_1.buildPrivatePartnerAccessUrl)(FRONTEND_URL, partner.partnerId || "", plainSecret);
            const shareUrl = `${FRONTEND_URL}/referral-partners?ref=${encodeURIComponent(partner.referralCode || "")}#referred-business`;
            try {
                await (0, sendEmail_1.default)(partner.email, "Your Creativa Poeta Referral Partner access", `<h2>Welcome to the CPRPP</h2><p>Your application has been approved.</p><p><strong>Partner ID:</strong> ${escapeHtml(partner.partnerId)}</p><p><a href="${accessUrl}">Open your secure partner referral form</a></p><p><a href="${shareUrl}">Copy your prospect referral link</a></p><p>Send the prospect link to businesses that have agreed to the introduction. Keep the partner access link private.</p>`);
                emailSent = true;
            }
            catch (error) {
                console.error("Partner approval email failed:", error);
            }
        }
        else if (status === "rejected") {
            try {
                await (0, sendEmail_1.default)(partner.email, "Update on your Creativa Poeta partner application", `<p>Hello ${escapeHtml(partner.name)},</p><p>We reviewed your application. It has not been accepted at this time.</p><p>${escapeHtml(reason)}</p>`);
                emailSent = true;
            }
            catch (error) {
                console.error("Partner rejection email failed:", error);
            }
        }
        const safePartner = await ReferralPartner_1.default.findById(partner._id);
        res.json({ partner: safePartner, emailSent });
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
        const capCents = Math.max(0, Math.round(Number((_c = req.body) === null || _c === void 0 ? void 0 : _c.capCents) || 20000));
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
