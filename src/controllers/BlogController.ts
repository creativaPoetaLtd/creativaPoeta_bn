import { NextFunction, Request, Response } from "express";
import Blog from "../models/Blog";
import { IBlog } from "../models/Blog";
import { uploadToCloudinary } from "../utils/cloudinary";

export const createBlog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { title, content } = req.body;

        if (!title || !content) {
            res.status(400).json({ message: "Title and content are required." });
            return;
        }

        // Use the uploaded file's Cloudinary URL if a file exists
        const imageUrl = req.file?.path || ""; // Multer stores the Cloudinary URL in `req.file.path`

        const blogData = {
            title,
            content,
            author: req.user._id, // Assumes `req.user` is populated by your auth middleware
            image: imageUrl, // Save image URL in the blog
        };

        const blog: IBlog = new Blog(blogData);
        await blog.save();

        res.status(201).json({ message: "Blog created successfully", blog });
    } catch (error) {
        next(error);
    }
};

// Fetch all blogs
export const fetchBlogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const blogs = await Blog.find().populate("author", "name email");
        res.status(200).json({ message: "Blogs fetched successfully", blogs });
    } catch (error) {
        next(error);
    }
};

// Get a single blog
export const getSingleBlog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const blogId = req.params.id;
        const blog = await Blog.findById(blogId);
        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        res.status(200).json({ message: "Blog fetched successfully", blog });
    } catch (error) {
        next(error);
    }
};

// Update a blog
export const updateBlog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const blogId = req.params.id;

        // Handle image upload if a new file is provided
        let imageUrl = req.body.image; // Retain the existing image URL if no new image is uploaded
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, "blogs");
            imageUrl = (result as { secure_url: string }).secure_url;
        }

        const updatedData = {
            ...req.body,
            image: imageUrl, // Update the image URL
        };

        const blog = await Blog.findByIdAndUpdate(blogId, updatedData, { new: true });
        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }

        res.status(200).json({ message: "Blog updated successfully", blog });
    } catch (error) {
        next(error);
    }
};

export const likeBlog = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const blogId = req.params.id;
        const userId = req.user._id; // Assuming `req.user` contains authenticated user info

        const blog = await Blog.findById(blogId);

        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }

        if (!Array.isArray(blog.likes)) {
            blog.likes = [];
        }

        if (blog.likes.includes(userId)) {
            // If the user already liked the blog, remove the like
            blog.likes = blog.likes.filter((id) => id.toString() !== userId.toString());
        } else {
            // Otherwise, add the user's like
            blog.likes.push(userId);
        }

        await blog.save();

        res.status(200).json({ message: "Like toggled successfully", likes: blog.likes.length });
    } catch (error) {
        next(error);
    }
};

export const addComment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const blogId = req.params.id;
        const { text } = req.body;

        if (!text) {
            res.status(400).json({ message: "Comment text is required." });
            return;
        }

        const blog = await Blog.findById(blogId);

        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }

        const comment = {
            user: req.user._id, // Assuming `req.user` contains authenticated user info
            text,
            createdAt: new Date(),
        };

        blog.comments.push(comment);

        await blog.save();

        res.status(201).json({ message: "Comment added successfully", comments: blog.comments });
    } catch (error) {
        next(error);
    }
};

export const getBlogDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { blogId } = req.params;

        const blog = await Blog.findById(blogId)
            .populate("author", "name") // Populate author details
            .populate("comments.user", "name"); // Populate commenter details

        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }

        res.status(200).json({ blog });
    } catch (error) {
        next(error);
    }
};
