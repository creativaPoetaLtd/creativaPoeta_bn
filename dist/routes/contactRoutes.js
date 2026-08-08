"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const contactController_1 = require("../controllers/contactController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const contactRouter = express_1.default.Router();
// Public route - submit contact form
contactRouter.post("/send", contactController_1.sendContactDetails);
// Admin routes - require authentication (all users are admins)
contactRouter.get("/", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, contactController_1.getAllQueries);
contactRouter.get("/summary", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, contactController_1.getContactSummary);
contactRouter.get("/:id", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, contactController_1.getQuery);
contactRouter.post("/:id/claim", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, contactController_1.claimQuery);
contactRouter.post("/:id/release", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, contactController_1.releaseQuery);
contactRouter.post("/:id/reply", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, contactController_1.replyToQuery);
contactRouter.put("/:id/status", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, contactController_1.updateQueryStatus);
contactRouter.delete("/:id", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, contactController_1.deleteQuery);
exports.default = contactRouter;
