"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const projectFormController_1 = require("../controllers/projectFormController");
const projectRouter = express_1.default.Router();
projectRouter.post("/send-inquiry", projectFormController_1.sendProjectInquiry);
exports.default = projectRouter;
