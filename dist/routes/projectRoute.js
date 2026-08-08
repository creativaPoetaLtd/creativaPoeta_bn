"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const projectFormController_1 = require("../controllers/projectFormController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const projectRouter = express_1.default.Router();
// Public route - submit project inquiry
projectRouter.post("/send-inquiry", projectFormController_1.sendProjectInquiry);
// Admin routes - require authentication (all users are admins)
projectRouter.get("/", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, projectFormController_1.getAllProjectRequests);
projectRouter.get("/summary", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, projectFormController_1.getProjectRequestSummary);
projectRouter.get("/:id", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, projectFormController_1.getProjectRequest);
projectRouter.post("/:id/claim", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, projectFormController_1.claimProjectRequest);
projectRouter.post("/:id/release", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, projectFormController_1.releaseProjectRequest);
projectRouter.post("/:id/reply", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, projectFormController_1.replyToProjectRequest);
projectRouter.put("/:id/status", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, projectFormController_1.updateProjectRequestStatus);
projectRouter.delete("/:id", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, projectFormController_1.deleteProjectRequest);
exports.default = projectRouter;
