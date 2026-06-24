import { Router } from "express";
import {
  technicalVisibilityAudit,
  visibilityAuditInterpretation,
} from "../controllers/visibilityAuditController";

const visibilityAuditRouter = Router();
visibilityAuditRouter.post("/technical", technicalVisibilityAudit);
visibilityAuditRouter.post("/interpret", visibilityAuditInterpretation);
export default visibilityAuditRouter;