"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const healthController_1 = require("../controllers/healthController");
const router = (0, express_1.Router)();
router.get("/live", healthController_1.getLiveness);
router.get("/ready", healthController_1.getReadiness);
router.get("/monitor", healthController_1.runMonitoringEvaluation);
exports.default = router;
