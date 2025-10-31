"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const JobController_1 = require("../controllers/JobController");
const CareerRouter = express_1.default.Router();
CareerRouter.post("/", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, JobController_1.createJob);
CareerRouter.get("/", JobController_1.getAllJobs);
CareerRouter.get("/:id", JobController_1.getJob);
CareerRouter.patch("/:id", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, JobController_1.updateJob);
CareerRouter.delete("/:id", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, JobController_1.deleteJob);
exports.default = CareerRouter;
