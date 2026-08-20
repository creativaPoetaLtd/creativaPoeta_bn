"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const jobApplicationController_1 = require("../controllers/jobApplicationController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const permissionMiddleware_1 = require("../middleware/permissionMiddleware");
const jobRouter = (0, express_1.Router)();
const manageJobs = (0, permissionMiddleware_1.authorizeAdminPermission)("jobs:manage", ["admin_1", "admin_2"]);
const acceptedCvTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const careerCvUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => acceptedCvTypes.has(file.mimetype) ? callback(null, true) : callback(new Error("INVALID_CV_TYPE")),
});
const receiveCareerCv = (req, res, next) => {
    careerCvUpload.single("cv")(req, res, (error) => {
        if (error) {
            res.status(400).json({ message: error instanceof multer_1.default.MulterError && error.code === "LIMIT_FILE_SIZE" ? "The CV exceeds the 4 MB limit." : "The CV must be a PDF, DOC or DOCX file." });
            return;
        }
        next();
    });
};
jobRouter.post("/apply", receiveCareerCv, jobApplicationController_1.sendJobApplication);
jobRouter.get("/applications", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, manageJobs, jobApplicationController_1.getJobApplications);
jobRouter.get("/applications/:id/cv", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, manageJobs, jobApplicationController_1.downloadJobApplicationCv);
jobRouter.patch("/applications/:id", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, manageJobs, jobApplicationController_1.updateJobApplication);
jobRouter.delete("/applications/:id", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, manageJobs, jobApplicationController_1.deleteJobApplication);
exports.default = jobRouter;
