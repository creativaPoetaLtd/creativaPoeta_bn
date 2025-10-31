import express from "express";
import {
  sendProjectInquiry,
  getAllProjectRequests,
  getProjectRequest,
  replyToProjectRequest,
  updateProjectRequestStatus,
  deleteProjectRequest,
} from "../controllers/projectFormController";
import { authenticateUser, adminOnly } from "../middleware/authMiddleware";

const projectRouter = express.Router();

// Public route - submit project inquiry
projectRouter.post("/send-inquiry", sendProjectInquiry);

// Admin routes - require authentication (all users are admins)
projectRouter.get("/",authenticateUser, adminOnly,getAllProjectRequests);
projectRouter.get("/:id", authenticateUser, adminOnly, getProjectRequest);
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
