import express from "express";
import AuthRouter from "./authRoutes";
import BlogRouter from "./BlogRoutes";


const router = express.Router();

router.use("/auth", AuthRouter);
router.use("/blogs", BlogRouter);

export default router;
