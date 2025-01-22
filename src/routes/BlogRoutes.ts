import express from "express";
import { createBlog, fetchBlogs, getSingleBlog, updateBlog } from "../controllers/BlogController";
import { authenticateUser, authorizeRoles } from "../middleware/authMiddleware";

const BlogRouter = express.Router();
BlogRouter.post("/", authenticateUser, authorizeRoles(["admin"]), createBlog);
BlogRouter.get("/", authenticateUser, authorizeRoles(["admin"]), fetchBlogs);
BlogRouter.get("/:id", authenticateUser, authorizeRoles(["admin"]), getSingleBlog);
BlogRouter.patch("/:id", authenticateUser, authorizeRoles(["admin"]), updateBlog);

export default BlogRouter;
