import { NextFunction, Request, Response } from "express";
import Blog from "../models/Blog";
import { IBlog } from "../models/Blog";
import { uploadToCloudinary } from "../utils/cloudinary";
import fs from 'fs';

export const createBlog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { title, content } = req.body;

        if (!title || !content) {
            res.status(400).json({ message: "Title and content are required." });
            return;
        }

        let imageUrl = '';

        if (req.file) {
            try {
                // Read the file buffer from the temporary file
                const fileBuffer = fs.readFileSync(req.file.path);
                
                // Upload to Cloudinary
                const cloudinaryResult = await uploadToCloudinary(fileBuffer, 'blogs');
                
                // Get the secure URL from Cloudinary
                imageUrl = (cloudinaryResult as any).secure_url;
                
                // Clean up: Delete the temporary file after upload
                fs.unlinkSync(req.file.path);
            } catch (uploadError) {
                // If there's an error uploading to Cloudinary, clean up the temporary file
                if (req.file?.path && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                if (uploadError instanceof Error) {
                    throw new Error(`Failed to upload image: ${uploadError.message}`);
                } else {
                    throw new Error('Failed to upload image due to an unknown error.');
                }
            }
        }

        const blogData = {
            title,
            content,
            author: req.user._id, // Assumes req.user is populated by auth middleware
            image: imageUrl, // Store the Cloudinary URL
        };

        const blog: IBlog = new Blog(blogData);
        await blog.save();

        res.status(201).json({
            message: "Blog created successfully",
            blog: {
                ...blog.toJSON(),
                image: imageUrl // Ensure the response includes the Cloudinary URL
            }
        });
    } catch (error) {
        // Clean up any temporary files if they exist
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
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

export const getSingleBlog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const blogId = req.params.id;
        const blog = await Blog.findById(blogId).populate([
            {
                path: 'author',
                select: 'name email'
            },
            {
                path: 'comments.user',
                select: 'name email'
            }
        ]);
        
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

        // First check if blog exists
        const existingBlog = await Blog.findById(blogId);
        if (!existingBlog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }

        // Handle image upload if a new file is provided
        let imageUrl = existingBlog.image; // Keep existing image by default
        if (req.file) {
            try {
                // Read the file buffer from the temporary file
                const fileBuffer = fs.readFileSync(req.file.path);
                
                // Upload to Cloudinary
                const cloudinaryResult = await uploadToCloudinary(fileBuffer, 'blogs');
                imageUrl = (cloudinaryResult as any).secure_url;
                
                // Clean up: Delete the temporary file after upload
                fs.unlinkSync(req.file.path);
            } catch (uploadError) {
                // Clean up temporary file if upload fails
                if (req.file?.path && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                if (uploadError instanceof Error) {
                    throw new Error(`Failed to upload image: ${uploadError.message}`);
                } else {
                    throw new Error('Failed to upload image due to an unknown error.');
                }
            }
        }

        const updatedData = {
            ...req.body,
            image: imageUrl,
        };

        // Update the blog
        const updatedBlog = await Blog.findByIdAndUpdate(
            blogId,
            updatedData,
            { new: true }
        ).populate({
            path: 'author',
            select: 'name email'
        });

        res.status(200).json({ 
            message: "Blog updated successfully", 
            blog: updatedBlog 
        });
    } catch (error) {
        // Clean up any temporary files if they exist
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        next(error);
    }
};

export const likeBlog = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const blogId = req.params.id;
        const { userName } = req.body; // Accept user name from request body

        if (!userName) {
            res.status(400).json({ message: "User name is required." });
            return;
        }

        const blog = await Blog.findById(blogId);

        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }

        if (!Array.isArray(blog.likes)) {
            blog.likes = [];
        }

        if (blog.likes.includes(userName)) {
            // If the user already liked the blog, remove the like
            blog.likes = blog.likes.filter((name) => name !== userName);
        } else {
            // Otherwise, add the user's like
            blog.likes.push(userName);
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
        const { userName, text } = req.body; // Accept user name and comment text from request body

        if (!text || !userName) {
            res.status(400).json({ message: "User name and comment text are required." });
            return;
        }

        const blog = await Blog.findById(blogId);

        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }

        const comment = {
            user: userName, // Store user name instead of user ID
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
