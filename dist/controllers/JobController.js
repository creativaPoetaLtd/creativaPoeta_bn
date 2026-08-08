"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchJobs = exports.deleteJob = exports.updateJob = exports.getJob = exports.getAllJobs = exports.createJob = void 0;
const Job_1 = __importDefault(require("../models/Job"));
// Create a new job
const createJob = async (req, res, next) => {
    try {
        const { title, company, location, type, description, responsibilities, requirements, benefits, isRemote, howToApply } = req.body;
        const job = new Job_1.default({
            title,
            company,
            location,
            type,
            description,
            responsibilities: Array.isArray(responsibilities) ? responsibilities : [responsibilities],
            requirements: Array.isArray(requirements) ? requirements : [requirements],
            benefits: Array.isArray(benefits) ? benefits : [benefits],
            isRemote,
            howToApply
        });
        await job.save();
        res.status(201).json({
            message: "Job created successfully",
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
        const jobs = await Job_1.default.find().sort({ createdAt: -1 });
        res.status(200).json({
            message: "Jobs fetched successfully",
            jobs
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getAllJobs = getAllJobs;
// Get single job
const getJob = async (req, res, next) => {
    try {
        const job = await Job_1.default.findById(req.params.id);
        if (!job) {
            res.status(404).json({ message: "Job not found" });
            return;
        }
        res.status(200).json({
            message: "Job fetched successfully",
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
        const job = await Job_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!job) {
            res.status(404).json({ message: "Job not found" });
            return;
        }
        res.status(200).json({
            message: "Job updated successfully",
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
        const job = await Job_1.default.findByIdAndDelete(req.params.id);
        if (!job) {
            res.status(404).json({ message: "Job not found" });
            return;
        }
        res.status(200).json({
            message: "Job deleted successfully"
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
