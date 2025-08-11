import express from "express";
import { authenticateUser, adminOnly } from "../middleware/authMiddleware";
import {
  createJob,
  deleteJob,
  getAllJobs,
  getJob,
  updateJob,
} from "../controllers/JobController";
const CareerRouter = express.Router();

CareerRouter.post("/", authenticateUser, adminOnly, createJob);
CareerRouter.get("/", getAllJobs);
CareerRouter.get("/:id", getJob);
CareerRouter.patch("/:id", authenticateUser, adminOnly, updateJob);
CareerRouter.delete("/:id", authenticateUser, adminOnly, deleteJob);

export default CareerRouter;
