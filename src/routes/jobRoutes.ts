import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { downloadJobApplicationCv, getJobApplications, sendJobApplication, updateJobApplication } from "../controllers/jobApplicationController";
import { authenticateUser, adminOnly } from "../middleware/authMiddleware";
import { authorizeAdminPermission } from "../middleware/permissionMiddleware";
const jobRouter = Router();
const manageJobs = authorizeAdminPermission("jobs:manage", ["admin_1", "admin_2"]);
const acceptedCvTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const careerCvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => acceptedCvTypes.has(file.mimetype) ? callback(null, true) : callback(new Error("INVALID_CV_TYPE")),
});
const receiveCareerCv = (req: Request, res: Response, next: NextFunction) => {
  careerCvUpload.single("cv")(req, res, (error) => {
    if (error) {
      res.status(400).json({ message: error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? "The CV exceeds the 4 MB limit." : "The CV must be a PDF, DOC or DOCX file." });
      return;
    }
    next();
  });
};

jobRouter.post("/apply", receiveCareerCv, sendJobApplication);
jobRouter.get("/applications", authenticateUser, adminOnly, manageJobs, getJobApplications);
jobRouter.get("/applications/:id/cv", authenticateUser, adminOnly, manageJobs, downloadJobApplicationCv);
jobRouter.patch("/applications/:id", authenticateUser, adminOnly, manageJobs, updateJobApplication);

export default jobRouter;
