import { Request, Response, NextFunction } from "express";
import Job, { JobStatus, JobType } from "../models/Job";

const allowedTypes: JobType[] = ["fulltime", "parttime", "internship", "contract"];
const allowedStatuses: JobStatus[] = ["draft", "published", "closed"];
const cleanList = (value: unknown) => (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 30);

const buildJobPayload = (body: Record<string, unknown>, partial = false) => {
    const payload: Record<string, unknown> = {};
    ["title", "summary", "company", "department", "location", "description", "howToApply"].forEach((field) => {
        if (!partial || body[field] !== undefined) payload[field] = String(body[field] || "").trim();
    });
    if (!partial || body.type !== undefined) payload.type = allowedTypes.includes(body.type as JobType) ? body.type : "contract";
    if (!partial || body.status !== undefined) payload.status = allowedStatuses.includes(body.status as JobStatus) ? body.status : "draft";
    if (!partial || body.isRemote !== undefined) payload.isRemote = Boolean(body.isRemote);
    ["responsibilities", "requirements", "benefits"].forEach((field) => {
        if (!partial || body[field] !== undefined) payload[field] = cleanList(body[field]);
    });
    if (!partial || body.applicationDeadline !== undefined) {
        payload.applicationDeadline = body.applicationDeadline ? new Date(String(body.applicationDeadline)) : undefined;
    }
    return payload;
};

// Create a new job
export const createJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const payload = buildJobPayload(req.body || {});
        if (!payload.title || !payload.company || !payload.location || !payload.description) {
            res.status(400).json({ message: "Title, company, location and description are required." });
            return;
        }
        const job = await Job.create(payload);

        res.status(201).json({
            message: "Career opportunity created successfully.",
            job
        });
    } catch (error) {
        next(error);
    }
};

// Get all jobs
export const getAllJobs = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const now = new Date();
        const jobs = await Job.find({ $and: [
            { $or: [{ status: "published" }, { status: { $exists: false } }] },
            { $or: [{ applicationDeadline: { $exists: false } }, { applicationDeadline: null }, { applicationDeadline: { $gte: now } }] },
        ] }).sort({ createdAt: -1 });
        res.status(200).json({
            message: "Career opportunities fetched successfully.",
            jobs
        });
    } catch (error) {
        next(error);
    }
};

export const getAdminJobs = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 });
        res.status(200).json({ message: "Career opportunities fetched successfully.", jobs });
    } catch (error) {
        next(error);
    }
};

// Get single job
export const getJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job || (job.status && job.status !== "published")) {
            res.status(404).json({ message: "Career opportunity not found." });
            return;
        }
        res.status(200).json({
            message: "Career opportunity fetched successfully.",
            job
        });
    } catch (error) {
        next(error);
    }
};

// Update job
export const updateJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

        const job = await Job.findByIdAndUpdate(req.params.id, buildJobPayload(req.body || {}, true), { new: true, runValidators: true });

        if (!job) {
            res.status(404).json({ message: "Career opportunity not found." });
            return;
        }

        res.status(200).json({
            message: "Career opportunity updated successfully.",
            job
        });
    } catch (error) {
        next(error);
    }
};

// Delete job
export const deleteJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

        const job = await Job.findByIdAndUpdate(req.params.id, { status: "closed" }, { new: true });
        if (!job) {
            res.status(404).json({ message: "Career opportunity not found." });
            return;
        }

        res.status(200).json({
            message: "Career opportunity closed successfully.",
            job
        });
    } catch (error) {
        next(error);
    }
};

// Search jobs
export const searchJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { query } = req.query;
        const searchRegex = new RegExp(String(query), 'i');

        const jobs = await Job.find({
            $or: [
                { title: searchRegex },
                { company: searchRegex },
                { location: searchRegex },
                { description: searchRegex }
            ]
        }).sort({ createdAt: -1 });

        res.status(200).json({
            message: "Search results fetched successfully",
            jobs
        });
    } catch (error) {
        next(error);
    }
};
