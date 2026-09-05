import { Request, Response, NextFunction } from "express";
import sendEmail from "../utils/sendEmail";
import { getAdminNotificationEmail } from "../utils/adminNotificationEmail";
import { normalizeCommunicationLocale } from "../utils/communicationLocale";
import dotenv from "dotenv";
import Job from "../models/Job";
import JobApplication, { JobApplicationStatus } from "../models/JobApplication";
import JobApplicationFile from "../models/JobApplicationFile";
import { consumeReferralRateLimit } from "../services/referralRateLimitService";
import { moveDocumentToTrash, moveSnapshotToTrash, snapshotForTrash } from "../services/trashService";


dotenv.config();



const clean = (value: unknown, max = 5000) => String(value || "").trim().slice(0, max);
const discoverySources = new Set(["google", "facebook", "instagram", "linkedin", "tiktok", "youtube", "recommendation", "client_or_partner", "creativa_poeta_team", "event", "school", "job_platform", "article_or_website", "other"]);
const cleanPublicUrl = (value: unknown) => {
    const candidate = clean(value, 500);
    if (!candidate) return undefined;
    try {
        const parsed = new URL(candidate);
        return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : undefined;
    } catch {
        return undefined;
    }
};
const escapeHtml = (value: unknown) => clean(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[character] || character));

export const sendJobApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (req.body?.websiteConfirmation) {
            res.status(201).json({ message: "Application received successfully." });
            return;
        }
        if (!(await consumeReferralRateLimit(req, res, "career_application"))) {
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

        const job = req.body.jobId ? await Job.findOne({ _id: req.body.jobId, $or: [{ status: "published" }, { status: { $exists: false } }] }) : null;
        if (req.body.jobId && !job) {
            res.status(404).json({ message: "This career opportunity is no longer available." });
            return;
        }

        const skillsValue = Array.isArray(req.body.skills) ? req.body.skills.join(", ") : req.body.skills;
        const application = await JobApplication.create({
            kind: job ? "job" : "spontaneous",
            job: job?._id,
            jobTitle: job?.title || clean(req.body.desiredRole || req.body.desiredJobTitles, 180),
            fullName,
            email: email || undefined,
            phone: phone || undefined,
            country: clean(req.body.country || req.body.preferredLocation, 120),
            desiredRole: clean(req.body.desiredRole || req.body.desiredJobTitles || job?.title, 180),
            experience: clean(req.body.experience || req.body.yearsOfExperience || req.body.currentJobTitle, 180),
            skills: clean(skillsValue, 2000),
            linkedin: cleanPublicUrl(req.body.linkedin),
            portfolio: cleanPublicUrl(req.body.portfolio),
            hasCv: Boolean(req.file),
            cvOriginalName: req.file ? clean(req.file.originalname.replace(/[\\/]/g, "-"), 240) : undefined,
            cvMimeType: req.file?.mimetype,
            discoverySource,
            discoverySourceOther: discoverySource === "other" ? discoverySourceOther : undefined,
            availability: clean(req.body.availability, 180),
            message: clean(req.body.message || req.body.additionalComments, 5000),
            locale: normalizeCommunicationLocale(req.body.locale),
            consentAcceptedAt: new Date(),
        });

        if (req.file) {
            try {
                await JobApplicationFile.create({
                    application: application._id,
                    originalName: application.cvOriginalName,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    data: req.file.buffer,
                });
            } catch (fileError) {
                await moveDocumentToTrash({ entityType: "job_application", document: application as any, req, reason: "CV storage failed during submission" });
                throw fileError;
            }
        }

        const emailUser = getAdminNotificationEmail();
        if (emailUser) {
            const htmlContent = `
                <h2>New ${job ? "job" : "spontaneous"} application</h2>
                <p><strong>Candidate:</strong> ${escapeHtml(fullName)}</p>
                <p><strong>Opportunity:</strong> ${escapeHtml(job?.title || application.desiredRole || "Spontaneous application")}</p>
                <p><strong>Email:</strong> ${escapeHtml(email || "N/A")}</p>
                <p><strong>Phone:</strong> ${escapeHtml(phone || "N/A")}</p>
                <p><strong>How they found Creativa Poeta:</strong> ${escapeHtml(discoverySource === "other" ? discoverySourceOther : discoverySource)}</p>
                <p><strong>CV:</strong> ${req.file ? "Available securely in the Career dashboard" : "Not provided"}</p>
                <p><strong>Skills:</strong> ${escapeHtml(application.skills || "N/A")}</p>
                <p><strong>Message:</strong> ${escapeHtml(application.message || "N/A")}</p>
                <p>Open the Career tab in the Creativa Poeta dashboard to review this application.</p>`;
            try {
                await sendEmail(emailUser, `Career application — ${fullName}`, htmlContent);
            } catch (emailError) {
                console.warn("Career application stored, but notification email failed.", emailError instanceof Error ? emailError.message : "unknown_error");
            }
        }

        res.status(201).json({ message: "Application received successfully.", applicationId: application._id });
    } catch (error) { next(error); }
};

export const downloadJobApplicationCv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const application = await JobApplication.findById(req.params.id).select("hasCv cvOriginalName cvMimeType");
        if (!application?.hasCv) {
            res.status(404).json({ message: "No CV is attached to this application." });
            return;
        }
        const file = await JobApplicationFile.findOne({ application: application._id });
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
    } catch (error) { next(error); }
};

export const getJobApplications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const status = clean(req.query.status, 40);
        const query = status && status !== "all" ? { status } : {};
        const applications = await JobApplication.find(query).populate("job", "title status").sort({ createdAt: -1 });
        res.status(200).json({ applications });
    } catch (error) { next(error); }
};

export const updateJobApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const allowed: JobApplicationStatus[] = ["new", "reviewing", "shortlisted", "rejected", "archived"];
        const status = clean(req.body.status, 40) as JobApplicationStatus;
        if (!allowed.includes(status)) {
            res.status(400).json({ message: "Invalid application status." });
            return;
        }
        const application = await JobApplication.findByIdAndUpdate(req.params.id, {
            status,
            reviewedByEmail: req.user?.email,
            reviewedAt: new Date(),
        }, { new: true }).populate("job", "title status");
        if (!application) {
            res.status(404).json({ message: "Application not found." });
            return;
        }
        res.status(200).json({ message: "Application updated.", application });
    } catch (error) { next(error); }
};

export const deleteJobApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const application = await JobApplication.findById(req.params.id);
        if (!application) {
            res.status(404).json({ message: "Application not found." });
            return;
        }
        const applicationFile = await JobApplicationFile.findOne({ application: application._id });
        await moveSnapshotToTrash({
            entityType: "job_application",
            originalId: String(application._id),
            label: `${application.fullName || "Job application"} · ${application.email || application._id}`,
            snapshot: snapshotForTrash(application),
            relatedSnapshots: applicationFile
                ? [{ entityType: "job_application_file", snapshot: snapshotForTrash(applicationFile) }]
                : [],
            req,
        });
        res.status(200).json({ message: "Application deleted." });
    } catch (error) { next(error); }
};

