import { Router } from "express";
import { sendJobApplication } from "../controllers/jobApplicationController";
const jobRouter = Router();

jobRouter.post("/apply", sendJobApplication);

export default jobRouter;
