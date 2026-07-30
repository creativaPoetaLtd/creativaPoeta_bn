import express from "express";
import {
  sendProjectInquiry,
  getProjectRequestSummary,
  getAllProjectRequests,
  getProjectRequest,
  replyToProjectRequest,
  updateProjectRequestStatus,
  claimProjectRequest,
  releaseProjectRequest,
  deleteProjectRequest,
} from "../controllers/projectFormController";
import { authenticateUser, adminOnly } from "../middleware/authMiddleware";

const projectRouter = express.Router();

// Public route - submit project inquiry
projectRouter.post("/send-inquiry", sendProjectInquiry);

// Admin routes - require authentication (all users are admins)
projectRouter.get("/", authenticateUser, adminOnly, getAllProjectRequests);
projectRouter.get("/summary", authenticateUser, adminOnly, getProjectRequestSummary);
projectRouter.get("/:id", authenticateUser, adminOnly, getProjectRequest);
projectRouter.post("/:id/claim", authenticateUser, adminOnly, claimProjectRequest);
projectRouter.post("/:id/release", authenticateUser, adminOnly, releaseProjectRequest);
projectRouter.post(
  "/:id/reply",
  authenticateUser,
  adminOnly,
  replyToProjectRequest
);
projectRouter.put(
  "/:id/status",
  authenticateUser,
  adminOnly,
  updateProjectRequestStatus
);
projectRouter.delete("/:id", authenticateUser, adminOnly, deleteProjectRequest);

export default projectRouter;
