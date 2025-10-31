"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jobApplicationController_1 = require("../controllers/jobApplicationController");
const jobRouter = (0, express_1.Router)();
jobRouter.post("/apply", jobApplicationController_1.sendJobApplication);
exports.default = jobRouter;
