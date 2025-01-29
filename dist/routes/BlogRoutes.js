"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const BlogController_1 = require("../controllers/BlogController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const multer_1 = require("../utils/multer");
const BlogRouter = express_1.default.Router();
BlogRouter.post("/", authMiddleware_1.authenticateUser, (0, authMiddleware_1.authorizeRoles)(["admin"]), multer_1.upload.single("image"), BlogController_1.createBlog);
BlogRouter.get("/", authMiddleware_1.authenticateUser, (0, authMiddleware_1.authorizeRoles)(["admin"]), BlogController_1.fetchBlogs);
BlogRouter.get("/:id", authMiddleware_1.authenticateUser, (0, authMiddleware_1.authorizeRoles)(["admin"]), BlogController_1.getSingleBlog);
BlogRouter.patch("/:id", authMiddleware_1.authenticateUser, (0, authMiddleware_1.authorizeRoles)(["admin"]), multer_1.upload.single("image"), BlogController_1.updateBlog);
BlogRouter.post("/:id/like", authMiddleware_1.authenticateUser, BlogController_1.likeBlog);
BlogRouter.post("/:id/comment", authMiddleware_1.authenticateUser, BlogController_1.addComment);
exports.default = BlogRouter;
