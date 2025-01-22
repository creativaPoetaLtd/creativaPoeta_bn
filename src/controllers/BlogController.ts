// src/controllers/blogController.ts
import { NextFunction, Request, Response } from "express";
import Blog from "../models/Blog";
import { IBlog } from "../models/Blog";

export const createBlog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const blogData = {
            ...req.body,
            author: req.user._id, 
        };
        const blog: IBlog = new Blog(blogData);
        await blog.save();
        res.status(201).json({ message: "Blog created successfully", blog });
    } catch (error) {
        next(error);
    }
};

// fetch blogs

export const fetchBlogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const blogs = await Blog.find().populate("author", "name email");
      res.status(200).json({ message: "Blogs fetched successfully", blogs });
    } catch (error) {
        next(error);
    }
};

//get single blog

export const getSingleBlog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const blogId = req.params.id;
        const blog = await Blog.findById(blogId);
        res.status(200).json({ message: "Blog fetched successfully", blog });
    } catch (error) {
        next(error);
    }
};

//update blog
export const updateBlog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const blogId = req.params.id;
        const blog = await Blog.findByIdAndUpdate
        (blogId, req.body, { new: true });
        res.status(200).json({ message: "Blog updated successfully", blog });
    } catch (error) {
        next(error);
    }
}