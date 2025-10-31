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
BlogRouter.post("/", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, multer_1.upload.single("image"), BlogController_1.createBlog);
BlogRouter.get("/", BlogController_1.fetchBlogs);
BlogRouter.get("/:id", BlogController_1.getSingleBlog);
BlogRouter.patch("/:id", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, multer_1.upload.single("image"), BlogController_1.updateBlog);
// Comment routes - no authentication required
BlogRouter.post("/:id/comment", BlogController_1.addComment);
BlogRouter.get("/:id/comments", BlogController_1.getComments);
BlogRouter.delete("/:blogId/comment/:commentId", authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly, BlogController_1.deleteComment);
exports.default = BlogRouter;
