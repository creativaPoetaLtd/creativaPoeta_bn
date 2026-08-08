import express from "express";
import {
  addComment,
  createBlog,
  deleteBlog,
  deleteComment,
  fetchAdminBlogs,
  fetchBlogs,
  getComments,
  getSingleBlog,
  generateProgrammaticBlogs,
  planProgrammaticBlogTopics,
  rebuildBlogSeo,
  updateBlog,
} from "../controllers/BlogController";
import { adminOnly, authenticateUser } from "../middleware/authMiddleware";
import { upload } from "../utils/multer";

const BlogRouter = express.Router();

BlogRouter.get("/", fetchBlogs);
BlogRouter.get(
  "/admin",
  authenticateUser,
  adminOnly,
  fetchAdminBlogs
);
BlogRouter.post(
  "/admin/rebuild",
  authenticateUser,
  adminOnly,
  rebuildBlogSeo
);
BlogRouter.post(
  "/admin/generate",
  authenticateUser,
  adminOnly,
  generateProgrammaticBlogs
);
BlogRouter.post(
  "/admin/assistant/topics",
  authenticateUser,
  adminOnly,
  planProgrammaticBlogTopics
);
BlogRouter.post(
  "/",
  authenticateUser,
  adminOnly,
  upload.single("image"),
  createBlog
);
BlogRouter.patch(
  "/:id",
  authenticateUser,
  adminOnly,
  upload.single("image"),
  updateBlog
);
BlogRouter.delete(
  "/:id",
  authenticateUser,
  adminOnly,
  deleteBlog
);
BlogRouter.post("/:id/comment", addComment);
BlogRouter.get("/:id/comments", getComments);
BlogRouter.delete(
  "/:blogId/comment/:commentId",
  authenticateUser,
  adminOnly,
  deleteComment
);
BlogRouter.get("/:identifier", getSingleBlog);

export default BlogRouter;