import { NextFunction, Request, Response } from "express";
import Blog from "../models/Blog";
import { IBlog } from "../models/Blog";
import { uploadToCloudinary } from "../utils/cloudinary";
import fs from "fs";

export const createBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      res.status(400).json({ message: "Title and content are required." });
      return;
    }

    let imageUrl = "";

    if (req.file) {
      try {
        // Read the file buffer from the temporary file
        const fileBuffer = fs.readFileSync(req.file.path);

        // Upload to Cloudinary
        const cloudinaryResult = await uploadToCloudinary(fileBuffer, "blogs");

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
          throw new Error("Failed to upload image due to an unknown error.");
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
        image: imageUrl, // Ensure the response includes the Cloudinary URL
      },
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
export const fetchBlogs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const blogs = await Blog.find().populate("author", "name email");
    res.status(200).json({ message: "Blogs fetched successfully", blogs });
  } catch (error) {
    next(error);
  }
};

export const getSingleBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const blogId = req.params.id;
    const blog = await Blog.findById(blogId).populate({
      path: "author",
      select: "name email",
    });

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
export const updateBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
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
        const cloudinaryResult = await uploadToCloudinary(fileBuffer, "blogs");
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
          throw new Error("Failed to upload image due to an unknown error.");
        }
      }
    }

    const updatedData = {
      ...req.body,
      image: imageUrl,
    };

    // Update the blog
    const updatedBlog = await Blog.findByIdAndUpdate(blogId, updatedData, {
      new: true,
    }).populate({
      path: "author",
      select: "name email",
    });

    res.status(200).json({
      message: "Blog updated successfully",
      blog: updatedBlog,
    });
  } catch (error) {
    // Clean up any temporary files if they exist
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

export const addComment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const blogId = req.params.id;
    const { name, email, text } = req.body;

    // Validation
    if (!name || !email || !text) {
      res
        .status(400)
        .json({ message: "Name, email and comment text are required." });
      return;
    }

    // Additional validation for field lengths
    if (name.trim().length < 2) {
      res
        .status(400)
        .json({ message: "Name must be at least 2 characters long." });
      return;
    }

    if (text.trim().length < 5) {
      res
        .status(400)
        .json({ message: "Comment must be at least 5 characters long." });
      return;
    }

    if (text.trim().length > 1000) {
      res
        .status(400)
        .json({ message: "Comment must not exceed 1000 characters." });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res
        .status(400)
        .json({ message: "Please provide a valid email address." });
      return;
    }

    const blog = await Blog.findById(blogId);

    if (!blog) {
      res.status(404).json({ message: "Blog not found" });
      return;
    }

    const comment = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      text: text.trim(),
      createdAt: new Date(),
    };

    blog.comments.push(comment);
    await blog.save();

    res.status(201).json({
      message: "Comment added successfully",
      comment: blog.comments[blog.comments.length - 1], // Return the newly added comment
      totalComments: blog.comments.length,
    });
  } catch (error) {
    next(error);
  }
};

export const getComments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const blogId = req.params.id;

    const blog = await Blog.findById(blogId).select("comments");

    if (!blog) {
      res.status(404).json({ message: "Blog not found" });
      return;
    }

    res.status(200).json({
      message: "Comments fetched successfully",
      comments: blog.comments,
      totalComments: blog.comments.length,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteComment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { blogId, commentId } = req.params;

    const blog = await Blog.findById(blogId);

    if (!blog) {
      res.status(404).json({ message: "Blog not found" });
      return;
    }

    // Find the comment index
    const commentIndex = blog.comments.findIndex(
      (comment) => (comment as any)._id?.toString() === commentId
    );

    if (commentIndex === -1) {
      res.status(404).json({ message: "Comment not found" });
      return;
    }

    // Remove the comment
    blog.comments.splice(commentIndex, 1);
    await blog.save();

    res.status(200).json({
      message: "Comment deleted successfully",
      comments: blog.comments,
      totalComments: blog.comments.length,
    });
  } catch (error) {
    next(error);
  }
};
