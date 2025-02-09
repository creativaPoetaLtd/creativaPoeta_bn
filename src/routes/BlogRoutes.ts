import express from "express";
import { createBlog, fetchBlogs, getSingleBlog, updateBlog, likeBlog, addComment } from "../controllers/BlogController";
import { authenticateUser, authorizeRoles } from "../middleware/authMiddleware";
import { upload } from "../utils/multer";
const BlogRouter = express.Router();


BlogRouter.post("/", upload.single("image"), createBlog);
BlogRouter.get("/", fetchBlogs);
BlogRouter.get("/:id", getSingleBlog);
BlogRouter.patch("/:id", upload.single("image"), updateBlog);
BlogRouter.post("/:id/like", likeBlog);
BlogRouter.post("/:id/comment", addComment);




export default BlogRouter;
