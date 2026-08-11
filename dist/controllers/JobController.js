"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchJobs = exports.deleteJob = exports.updateJob = exports.getJob = exports.getAdminJobs = exports.getAllJobs = exports.createJob = void 0;
const Job_1 = __importDefault(require("../models/Job"));
const allowedTypes = ["fulltime", "parttime", "internship", "contract"];
const allowedStatuses = ["draft", "published", "closed"];
const cleanList = (value) => (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 30);
const buildJobPayload = (body, partial = false) => {
    const payload = {};
    ["title", "summary", "company", "department", "location", "description", "howToApply"].forEach((field) => {
        if (!partial || body[field] !== undefined)
            payload[field] = String(body[field] || "").trim();
    });
    if (!partial || body.type !== undefined)
        payload.type = allowedTypes.includes(body.type) ? body.type : "contract";
    if (!partial || body.status !== undefined)
        payload.status = allowedStatuses.includes(body.status) ? body.status : "draft";
    if (!partial || body.isRemote !== undefined)
        payload.isRemote = Boolean(body.isRemote);
    ["responsibilities", "requirements", "benefits"].forEach((field) => {
        if (!partial || body[field] !== undefined)
            payload[field] = cleanList(body[field]);
    });
    if (!partial || body.applicationDeadline !== undefined) {
        payload.applicationDeadline = body.applicationDeadline ? new Date(String(body.applicationDeadline)) : undefined;
    }
    return payload;
};
// Create a new job
const createJob = async (req, res, next) => {
    try {
        const payload = buildJobPayload(req.body || {});
        if (!payload.title || !payload.company || !payload.location || !payload.description) {
            res.status(400).json({ message: "Title, company, location and description are required." });
            return;
        }
        const job = await Job_1.default.create(payload);
        res.status(201).json({
            message: "Career opportunity created successfully.",
            job
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createJob = createJob;
// Get all jobs
const getAllJobs = async (_req, res, next) => {
    try {
        const now = new Date();
        const jobs = await Job_1.default.find({ $and: [
                { $or: [{ status: "published" }, { status: { $exists: false } }] },
                { $or: [{ applicationDeadline: { $exists: false } }, { applicationDeadline: null }, { applicationDeadline: { $gte: now } }] },
            ] }).sort({ createdAt: -1 });
        res.status(200).json({
            message: "Career opportunities fetched successfully.",
            jobs
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getAllJobs = getAllJobs;
const getAdminJobs = async (_req, res, next) => {
    try {
        const jobs = await Job_1.default.find().sort({ createdAt: -1 });
        res.status(200).json({ message: "Career opportunities fetched successfully.", jobs });
    }
    catch (error) {
        next(error);
    }
};
exports.getAdminJobs = getAdminJobs;
// Get single job
const getJob = async (req, res, next) => {
    try {
        const job = await Job_1.default.findById(req.params.id);
        if (!job || (job.status && job.status !== "published")) {
            res.status(404).json({ message: "Career opportunity not found." });
            return;
        }
        res.status(200).json({
            message: "Career opportunity fetched successfully.",
            job
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getJob = getJob;
// Update job
const updateJob = async (req, res, next) => {
    try {
        const job = await Job_1.default.findByIdAndUpdate(req.params.id, buildJobPayload(req.body || {}, true), { new: true, runValidators: true });
        if (!job) {
            res.status(404).json({ message: "Career opportunity not found." });
            return;
        }
        res.status(200).json({
            message: "Career opportunity updated successfully.",
            job
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateJob = updateJob;
// Delete job
const deleteJob = async (req, res, next) => {
    try {
        const job = await Job_1.default.findByIdAndUpdate(req.params.id, { status: "closed" }, { new: true });
        if (!job) {
            res.status(404).json({ message: "Career opportunity not found." });
            return;
        }
        res.status(200).json({
            message: "Career opportunity closed successfully.",
            job
        });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteJob = deleteJob;
// Search jobs
const searchJobs = async (req, res, next) => {
    try {
        const { query } = req.query;
        const searchRegex = new RegExp(String(query), 'i');
        const jobs = await Job_1.default.find({
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
    }
    catch (error) {
        next(error);
    }
};
exports.searchJobs = searchJobs;
