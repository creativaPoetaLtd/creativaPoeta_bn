"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateJobApplication = exports.getJobApplications = exports.downloadJobApplicationCv = exports.sendJobApplication = void 0;
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const adminNotificationEmail_1 = require("../utils/adminNotificationEmail");
const dotenv_1 = __importDefault(require("dotenv"));
const Job_1 = __importDefault(require("../models/Job"));
const JobApplication_1 = __importDefault(require("../models/JobApplication"));
const JobApplicationFile_1 = __importDefault(require("../models/JobApplicationFile"));
const referralRateLimitService_1 = require("../services/referralRateLimitService");
dotenv_1.default.config();
const clean = (value, max = 5000) => String(value || "").trim().slice(0, max);
const discoverySources = new Set(["google", "facebook", "instagram", "linkedin", "tiktok", "youtube", "recommendation", "client_or_partner", "creativa_poeta_team", "event", "school", "job_platform", "article_or_website", "other"]);
const cleanPublicUrl = (value) => {
    const candidate = clean(value, 500);
    if (!candidate)
        return undefined;
    try {
        const parsed = new URL(candidate);
        return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : undefined;
    }
    catch {
        return undefined;
    }
};
const escapeHtml = (value) => clean(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[character] || character));
const sendJobApplication = async (req, res, next) => {
    var _a, _b;
    try {
        if ((_a = req.body) === null || _a === void 0 ? void 0 : _a.websiteConfirmation) {
            res.status(201).json({ message: "Application received successfully." });
            return;
        }
        if (!(await (0, referralRateLimitService_1.consumeReferralRateLimit)(req, res, "career_application"))) {
            res.status(429).json({ message: "Too many applications. Please try again later." });
            return;
        }
        const fullName = clean(req.body.fullName, 180);
        const email = clean(req.body.email, 240).toLowerCase();
        const phone = clean(req.body.phone, 80);
        const consentAccepted = req.body.consentAccepted === true || req.body.consentAccepted === "true";
        const discoverySource = clean(req.body.discoverySource, 80);
        const discoverySourceOther = clean(req.body.discoverySourceOther, 300);
        if (!fullName || (!email && !phone) || !consentAccepted || !discoverySources.has(discoverySource) || (discoverySource === "other" && !discoverySourceOther)) {
            res.status(400).json({ message: "Name, consent, discovery source and at least one contact method are required." });
            return;
        }
        const job = req.body.jobId ? await Job_1.default.findOne({ _id: req.body.jobId, $or: [{ status: "published" }, { status: { $exists: false } }] }) : null;
        if (req.body.jobId && !job) {
            res.status(404).json({ message: "This career opportunity is no longer available." });
            return;
        }
        const skillsValue = Array.isArray(req.body.skills) ? req.body.skills.join(", ") : req.body.skills;
        const application = await JobApplication_1.default.create({
            kind: job ? "job" : "spontaneous",
            job: job === null || job === void 0 ? void 0 : job._id,
            jobTitle: (job === null || job === void 0 ? void 0 : job.title) || clean(req.body.desiredRole || req.body.desiredJobTitles, 180),
            fullName,
            email: email || undefined,
            phone: phone || undefined,
            country: clean(req.body.country || req.body.preferredLocation, 120),
            desiredRole: clean(req.body.desiredRole || req.body.desiredJobTitles || (job === null || job === void 0 ? void 0 : job.title), 180),
            experience: clean(req.body.experience || req.body.yearsOfExperience || req.body.currentJobTitle, 180),
            skills: clean(skillsValue, 2000),
            linkedin: cleanPublicUrl(req.body.linkedin),
            portfolio: cleanPublicUrl(req.body.portfolio),
            hasCv: Boolean(req.file),
            cvOriginalName: req.file ? clean(req.file.originalname.replace(/[\\/]/g, "-"), 240) : undefined,
            cvMimeType: (_b = req.file) === null || _b === void 0 ? void 0 : _b.mimetype,
            discoverySource,
            discoverySourceOther: discoverySource === "other" ? discoverySourceOther : undefined,
            availability: clean(req.body.availability, 180),
            message: clean(req.body.message || req.body.additionalComments, 5000),
            locale: clean(req.body.locale, 12),
            consentAcceptedAt: new Date(),
        });
        if (req.file) {
            try {
                await JobApplicationFile_1.default.create({
                    application: application._id,
                    originalName: application.cvOriginalName,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    data: req.file.buffer,
                });
            }
            catch (fileError) {
                await JobApplication_1.default.findByIdAndDelete(application._id);
                throw fileError;
            }
        }
        const emailUser = (0, adminNotificationEmail_1.getAdminNotificationEmail)();
        if (emailUser) {
            const htmlContent = `
                <h2>New ${job ? "job" : "spontaneous"} application</h2>
                <p><strong>Candidate:</strong> ${escapeHtml(fullName)}</p>
                <p><strong>Opportunity:</strong> ${escapeHtml((job === null || job === void 0 ? void 0 : job.title) || application.desiredRole || "Spontaneous application")}</p>
                <p><strong>Email:</strong> ${escapeHtml(email || "N/A")}</p>
                <p><strong>Phone:</strong> ${escapeHtml(phone || "N/A")}</p>
                <p><strong>How they found Creativa Poeta:</strong> ${escapeHtml(discoverySource === "other" ? discoverySourceOther : discoverySource)}</p>
                <p><strong>CV:</strong> ${req.file ? "Available securely in the Career dashboard" : "Not provided"}</p>
                <p><strong>Skills:</strong> ${escapeHtml(application.skills || "N/A")}</p>
                <p><strong>Message:</strong> ${escapeHtml(application.message || "N/A")}</p>
                <p>Open the Career tab in the Creativa Poeta dashboard to review this application.</p>`;
            try {
                await (0, sendEmail_1.default)(emailUser, `Career application — ${fullName}`, htmlContent);
            }
            catch (emailError) {
                console.warn("Career application stored, but notification email failed.", emailError instanceof Error ? emailError.message : "unknown_error");
            }
        }
        res.status(201).json({ message: "Application received successfully.", applicationId: application._id });
    }
    catch (error) {
        next(error);
    }
};
exports.sendJobApplication = sendJobApplication;
const downloadJobApplicationCv = async (req, res, next) => {
    try {
        const application = await JobApplication_1.default.findById(req.params.id).select("hasCv cvOriginalName cvMimeType");
        if (!(application === null || application === void 0 ? void 0 : application.hasCv)) {
            res.status(404).json({ message: "No CV is attached to this application." });
            return;
        }
        const file = await JobApplicationFile_1.default.findOne({ application: application._id });
        if (!file) {
            res.status(404).json({ message: "CV file not found." });
            return;
        }
        const safeName = file.originalName.replace(/[\r\n"\\/]/g, "-");
        res.setHeader("Content-Type", file.mimeType);
        res.setHeader("Content-Length", String(file.size));
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
        res.setHeader("Cache-Control", "private, no-store");
        res.status(200).send(file.data);
    }
    catch (error) {
        next(error);
    }
};
exports.downloadJobApplicationCv = downloadJobApplicationCv;
const getJobApplications = async (req, res, next) => {
    try {
        const status = clean(req.query.status, 40);
        const query = status && status !== "all" ? { status } : {};
        const applications = await JobApplication_1.default.find(query).populate("job", "title status").sort({ createdAt: -1 });
        res.status(200).json({ applications });
    }
    catch (error) {
        next(error);
    }
};
exports.getJobApplications = getJobApplications;
const updateJobApplication = async (req, res, next) => {
    var _a;
    try {
        const allowed = ["new", "reviewing", "shortlisted", "rejected", "archived"];
        const status = clean(req.body.status, 40);
        if (!allowed.includes(status)) {
            res.status(400).json({ message: "Invalid application status." });
            return;
        }
        const application = await JobApplication_1.default.findByIdAndUpdate(req.params.id, {
            status,
            reviewedByEmail: (_a = req.user) === null || _a === void 0 ? void 0 : _a.email,
            reviewedAt: new Date(),
        }, { new: true }).populate("job", "title status");
        if (!application) {
            res.status(404).json({ message: "Application not found." });
            return;
        }
        res.status(200).json({ message: "Application updated.", application });
    }
    catch (error) {
        next(error);
    }
};
exports.updateJobApplication = updateJobApplication;
