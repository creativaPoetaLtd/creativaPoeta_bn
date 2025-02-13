import { Request, Response, NextFunction } from "express";
import Job from "../models/Job";

// Create a new job
export const createJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {

        const {
            title,
            company,
            location,
            type,
            description,
            responsibilities,
            requirements,
            benefits,
            isRemote,
            howToApply
        } = req.body;

        const job = new Job({
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
    } catch (error) {
        next(error);
    }
};

// Get all jobs
export const getAllJobs = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 });
        res.status(200).json({
            message: "Jobs fetched successfully",
            jobs
        });
    } catch (error) {
        next(error);
    }
};

// Get single job
export const getJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) {
            res.status(404).json({ message: "Job not found" });
            return;
        }
        res.status(200).json({
            message: "Job fetched successfully",
            job
        });
    } catch (error) {
        next(error);
    }
};

// Update job
export const updateJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Check if user is admin
        if (req.user?.role !== 'admin') {
            res.status(403).json({ message: "Access denied. Only admins can update jobs." });
            return;
        }

        const job = await Job.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!job) {
            res.status(404).json({ message: "Job not found" });
            return;
        }

        res.status(200).json({
            message: "Job updated successfully",
            job
        });
    } catch (error) {
        next(error);
    }
};

// Delete job
export const deleteJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Check if user is admin
        if (req.user?.role !== 'admin') {
            res.status(403).json({ message: "Access denied. Only admins can delete jobs." });
            return;
        }

        const job = await Job.findByIdAndDelete(req.params.id);
        if (!job) {
            res.status(404).json({ message: "Job not found" });
            return;
        }

        res.status(200).json({
            message: "Job deleted successfully"
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