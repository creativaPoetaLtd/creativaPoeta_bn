import express from "express";
import {
  sendContactDetails,
  getContactSummary,
  getAllQueries,
  getQuery,
  replyToQuery,
  updateQueryStatus,
  claimQuery,
  releaseQuery,
  deleteQuery,
} from "../controllers/contactController";
import { authenticateUser, adminOnly } from "../middleware/authMiddleware";

const contactRouter = express.Router();

// Public route - submit contact form
contactRouter.post("/send", sendContactDetails);

// Admin routes - require authentication (all users are admins)
contactRouter.get("/", authenticateUser, adminOnly, getAllQueries);
contactRouter.get("/summary", authenticateUser, adminOnly, getContactSummary);
contactRouter.get("/:id", authenticateUser, adminOnly, getQuery);
contactRouter.post("/:id/claim", authenticateUser, adminOnly, claimQuery);
contactRouter.post("/:id/release", authenticateUser, adminOnly, releaseQuery);
contactRouter.post("/:id/reply", authenticateUser, adminOnly, replyToQuery);
contactRouter.put("/:id/status", authenticateUser, adminOnly, updateQueryStatus);
contactRouter.delete("/:id", authenticateUser, adminOnly, deleteQuery);

export default contactRouter;
