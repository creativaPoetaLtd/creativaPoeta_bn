import express from "express";
import { authenticateUser, adminOnly } from "../middleware/authMiddleware";
import {
  createJob,
  deleteJob,
  getAdminJobs,
  getAllJobs,
  getJob,
  updateJob,
} from "../controllers/JobController";
import { authorizeAdminPermission } from "../middleware/permissionMiddleware";
const CareerRouter = express.Router();
const manageJobs = authorizeAdminPermission("jobs:manage", ["admin_1", "admin_2"]);

CareerRouter.post("/", authenticateUser, adminOnly, manageJobs, createJob);
CareerRouter.get("/", getAllJobs);
CareerRouter.get("/admin/all", authenticateUser, adminOnly, manageJobs, getAdminJobs);
CareerRouter.get("/:id", getJob);
CareerRouter.patch("/:id", authenticateUser, adminOnly, manageJobs, updateJob);
CareerRouter.delete("/:id", authenticateUser, adminOnly, manageJobs, deleteJob);

export default CareerRouter;
