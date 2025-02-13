import express from "express";
import { authenticateUser, authorizeRoles } from "../middleware/authMiddleware";
import { createJob, deleteJob, getAllJobs, getJob, updateJob } from "../controllers/JobController";
const CareerRouter = express.Router();


CareerRouter.post("/", authenticateUser, authorizeRoles(["admin"]), createJob);
CareerRouter.get("/", getAllJobs);
CareerRouter.get("/:id", getJob);
CareerRouter.patch("/:id", authenticateUser, authorizeRoles(["admin"]), updateJob);
CareerRouter.delete("/:id", authenticateUser, authorizeRoles(["admin"]), deleteJob);




export default CareerRouter;
