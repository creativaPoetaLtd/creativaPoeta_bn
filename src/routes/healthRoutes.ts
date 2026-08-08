import { Router } from "express";
import {
  getLiveness,
  getReadiness,
  runMonitoringEvaluation,
} from "../controllers/healthController";

const router = Router();

router.get("/live", getLiveness);
router.get("/ready", getReadiness);
router.get("/monitor", runMonitoringEvaluation);

export default router;
