"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const visibilityAuditController_1 = require("../controllers/visibilityAuditController");
const visibilityAuditRouter = (0, express_1.Router)();
visibilityAuditRouter.post("/technical", visibilityAuditController_1.technicalVisibilityAudit);
visibilityAuditRouter.post("/interpret", visibilityAuditController_1.visibilityAuditInterpretation);
exports.default = visibilityAuditRouter;
