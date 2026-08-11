import { Router } from "express";
import { getJobApplications, sendJobApplication, updateJobApplication } from "../controllers/jobApplicationController";
import { authenticateUser, adminOnly } from "../middleware/authMiddleware";
import { authorizeAdminPermission } from "../middleware/permissionMiddleware";
const jobRouter = Router();
const manageJobs = authorizeAdminPermission("jobs:manage", ["admin_1", "admin_2"]);

jobRouter.post("/apply", sendJobApplication);
jobRouter.get("/applications", authenticateUser, adminOnly, manageJobs, getJobApplications);
jobRouter.patch("/applications/:id", authenticateUser, adminOnly, manageJobs, updateJobApplication);

export default jobRouter;
