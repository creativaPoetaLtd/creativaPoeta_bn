import express from "express";
import {
  sendContactDetails,
  getAllQueries,
  getQuery,
  replyToQuery,
  updateQueryStatus,
  deleteQuery,
} from "../controllers/contactController";
import { authenticateUser, adminOnly } from "../middleware/authMiddleware";

const contactRouter = express.Router();

// Public route - submit contact form
contactRouter.post("/send", sendContactDetails);

// Admin routes - require authentication (all users are admins)
contactRouter.get("/", getAllQueries);
contactRouter.get("/:id", getQuery);
contactRouter.post("/:id/reply", replyToQuery);
contactRouter.put(
  "/:id/status",
  updateQueryStatus
);
contactRouter.delete("/:id", deleteQuery);

export default contactRouter;
