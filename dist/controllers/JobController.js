"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchJobs = exports.deleteJob = exports.updateJob = exports.getJob = exports.getAllJobs = exports.createJob = void 0;
const Job_1 = __importDefault(require("../models/Job"));
// Create a new job
const createJob = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
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
        yield job.save();
        res.status(201).json({
            message: "Job created successfully",
            job
        });
    }
    catch (error) {
        next(error);
    }
});
exports.createJob = createJob;
// Get all jobs
const getAllJobs = (_req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const jobs = yield Job_1.default.find().sort({ createdAt: -1 });
        res.status(200).json({
            message: "Jobs fetched successfully",
            jobs
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getAllJobs = getAllJobs;
// Get single job
const getJob = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const job = yield Job_1.default.findById(req.params.id);
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
});
exports.getJob = getJob;
// Update job
const updateJob = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Check if user is admin
        if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
            res.status(403).json({ message: "Access denied. Only admins can update jobs." });
            return;
        }
        const job = yield Job_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
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
});
exports.updateJob = updateJob;
// Delete job
const deleteJob = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Check if user is admin
        if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
            res.status(403).json({ message: "Access denied. Only admins can delete jobs." });
            return;
        }
        const job = yield Job_1.default.findByIdAndDelete(req.params.id);
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
});
exports.deleteJob = deleteJob;
// Search jobs
const searchJobs = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query } = req.query;
        const searchRegex = new RegExp(String(query), 'i');
        const jobs = yield Job_1.default.find({
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
});
exports.searchJobs = searchJobs;
