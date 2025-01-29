import express from "express";
import AuthRouter from "./authRoutes";
import BlogRouter from "./BlogRoutes";
import projectRouter from "./projectRoute";
import jobRouter from "./jobRoutes";
import contactRouter from "./contactRoutes";


const router = express.Router();

router.use("/auth", AuthRouter);
router.use("/blogs", BlogRouter);
router.use("/project", projectRouter);
router.use("/job", jobRouter);
router.use("/contact", contactRouter);

export default router;