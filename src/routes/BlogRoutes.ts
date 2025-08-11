import express from "express";
import {
  createBlog,
  fetchBlogs,
  getSingleBlog,
  updateBlog,
  addComment,
  getComments,
  deleteComment,
} from "../controllers/BlogController";
import { authenticateUser, adminOnly } from "../middleware/authMiddleware";
import { upload } from "../utils/multer";
const BlogRouter = express.Router();

BlogRouter.post(
  "/",
  authenticateUser,
  adminOnly,
  upload.single("image"),
  createBlog
);
BlogRouter.get("/", fetchBlogs);
BlogRouter.get("/:id", getSingleBlog);
BlogRouter.patch(
  "/:id",
  authenticateUser,
  adminOnly,
  upload.single("image"),
  updateBlog
);

// Comment routes - no authentication required
BlogRouter.post("/:id/comment", addComment);
BlogRouter.get("/:id/comments", getComments);
BlogRouter.delete(
  "/:blogId/comment/:commentId",
  authenticateUser,
  adminOnly,
  deleteComment
);

export default BlogRouter;
