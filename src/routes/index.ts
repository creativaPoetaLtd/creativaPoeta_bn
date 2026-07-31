import express from "express";
import AuthRouter from "./authRoutes";
import BlogRouter from "./BlogRoutes";
import projectRouter from "./projectRoute";
import jobRouter from "./jobRoutes";
import contactRouter from "./contactRoutes";
import CareerRouter from "./CareerRoute";
import { testEmail } from "../controllers/emailTestController";
import visibilityAuditRouter from "./visibilityAuditRoutes";
import emailRouter from "./emailRoutes";
import adminNotificationRouter from "./adminNotificationRoutes";
import internalMessageRouter from "./internalMessageRoutes";

const router = express.Router();

router.use("/auth", AuthRouter);
router.use("/blogs", BlogRouter);
router.use("/project", projectRouter);
router.use("/job", jobRouter);
router.use("/contact", contactRouter);
router.use("/emails", emailRouter);
router.use("/admin-notifications", adminNotificationRouter);
router.use("/internal-messages", internalMessageRouter);
router.use("/jobs", CareerRouter);
router.use("/visibility-audit", visibilityAuditRouter);

// Email test endpoint for debugging
router.get("/test-email", testEmail);

export default router;
