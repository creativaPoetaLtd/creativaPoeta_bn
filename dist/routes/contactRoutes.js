"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const contactController_1 = require("../controllers/contactController");
const contactRouter = express_1.default.Router();
// Public route - submit contact form
contactRouter.post("/send", contactController_1.sendContactDetails);
// Admin routes - require authentication (all users are admins)
contactRouter.get("/", contactController_1.getAllQueries);
contactRouter.get("/:id", contactController_1.getQuery);
contactRouter.post("/:id/reply", contactController_1.replyToQuery);
contactRouter.put("/:id/status", contactController_1.updateQueryStatus);
contactRouter.delete("/:id", contactController_1.deleteQuery);
exports.default = contactRouter;
