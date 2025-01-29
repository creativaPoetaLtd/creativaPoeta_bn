"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authRoutes_1 = __importDefault(require("./authRoutes"));
const BlogRoutes_1 = __importDefault(require("./BlogRoutes"));
const projectRoute_1 = __importDefault(require("./projectRoute"));
const jobRoutes_1 = __importDefault(require("./jobRoutes"));
const contactRoutes_1 = __importDefault(require("./contactRoutes"));
const router = express_1.default.Router();
router.use("/auth", authRoutes_1.default);
router.use("/blogs", BlogRoutes_1.default);
router.use("/project", projectRoute_1.default);
router.use("/job", jobRoutes_1.default);
router.use("/contact", contactRoutes_1.default);
exports.default = router;
