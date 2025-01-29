import express from "express";
import { sendProjectInquiry } from "../controllers/projectFormController";

const projectRouter = express.Router();

projectRouter.post("/send-inquiry", sendProjectInquiry);

export default projectRouter;
