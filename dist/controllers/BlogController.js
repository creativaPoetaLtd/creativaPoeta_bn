"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteComment = exports.getComments = exports.addComment = exports.updateBlog = exports.getSingleBlog = exports.fetchBlogs = exports.createBlog = void 0;
const Blog_1 = __importDefault(require("../models/Blog"));
const cloudinary_1 = require("../utils/cloudinary");
const fs_1 = __importDefault(require("fs"));
const createBlog = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
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
                const fileBuffer = fs_1.default.readFileSync(req.file.path);
                // Upload to Cloudinary
                const cloudinaryResult = yield (0, cloudinary_1.uploadToCloudinary)(fileBuffer, "blogs");
                // Get the secure URL from Cloudinary
                imageUrl = cloudinaryResult.secure_url;
                // Clean up: Delete the temporary file after upload
                fs_1.default.unlinkSync(req.file.path);
            }
            catch (uploadError) {
                // If there's an error uploading to Cloudinary, clean up the temporary file
                if (((_a = req.file) === null || _a === void 0 ? void 0 : _a.path) && fs_1.default.existsSync(req.file.path)) {
                    fs_1.default.unlinkSync(req.file.path);
                }
                if (uploadError instanceof Error) {
                    throw new Error(`Failed to upload image: ${uploadError.message}`);
                }
                else {
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
        const blog = new Blog_1.default(blogData);
        yield blog.save();
        res.status(201).json({
            message: "Blog created successfully",
            blog: Object.assign(Object.assign({}, blog.toJSON()), { image: imageUrl }),
        });
    }
    catch (error) {
        // Clean up any temporary files if they exist
        if (((_b = req.file) === null || _b === void 0 ? void 0 : _b.path) && fs_1.default.existsSync(req.file.path)) {
            fs_1.default.unlinkSync(req.file.path);
        }
        next(error);
    }
});
exports.createBlog = createBlog;
// Fetch all blogs
const fetchBlogs = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const blogs = yield Blog_1.default.find().populate("author", "name email");
        res.status(200).json({ message: "Blogs fetched successfully", blogs });
    }
    catch (error) {
        next(error);
    }
});
exports.fetchBlogs = fetchBlogs;
const getSingleBlog = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const blogId = req.params.id;
        const blog = yield Blog_1.default.findById(blogId).populate({
            path: "author",
            select: "name email",
        });
        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        res.status(200).json({ message: "Blog fetched successfully", blog });
    }
    catch (error) {
        next(error);
    }
});
exports.getSingleBlog = getSingleBlog;
// Update a blog
const updateBlog = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const blogId = req.params.id;
        // First check if blog exists
        const existingBlog = yield Blog_1.default.findById(blogId);
        if (!existingBlog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        // Handle image upload if a new file is provided
        let imageUrl = existingBlog.image; // Keep existing image by default
        if (req.file) {
            try {
                // Read the file buffer from the temporary file
                const fileBuffer = fs_1.default.readFileSync(req.file.path);
                // Upload to Cloudinary
                const cloudinaryResult = yield (0, cloudinary_1.uploadToCloudinary)(fileBuffer, "blogs");
                imageUrl = cloudinaryResult.secure_url;
                // Clean up: Delete the temporary file after upload
                fs_1.default.unlinkSync(req.file.path);
            }
            catch (uploadError) {
                // Clean up temporary file if upload fails
                if (((_a = req.file) === null || _a === void 0 ? void 0 : _a.path) && fs_1.default.existsSync(req.file.path)) {
                    fs_1.default.unlinkSync(req.file.path);
                }
                if (uploadError instanceof Error) {
                    throw new Error(`Failed to upload image: ${uploadError.message}`);
                }
                else {
                    throw new Error("Failed to upload image due to an unknown error.");
                }
            }
        }
        const updatedData = Object.assign(Object.assign({}, req.body), { image: imageUrl });
        // Update the blog
        const updatedBlog = yield Blog_1.default.findByIdAndUpdate(blogId, updatedData, {
            new: true,
        }).populate({
            path: "author",
            select: "name email",
        });
        res.status(200).json({
            message: "Blog updated successfully",
            blog: updatedBlog,
        });
    }
    catch (error) {
        // Clean up any temporary files if they exist
        if (((_b = req.file) === null || _b === void 0 ? void 0 : _b.path) && fs_1.default.existsSync(req.file.path)) {
            fs_1.default.unlinkSync(req.file.path);
        }
        next(error);
    }
});
exports.updateBlog = updateBlog;
const addComment = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
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
        const blog = yield Blog_1.default.findById(blogId);
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
        yield blog.save();
        res.status(201).json({
            message: "Comment added successfully",
            comment: blog.comments[blog.comments.length - 1], // Return the newly added comment
            totalComments: blog.comments.length,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.addComment = addComment;
const getComments = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const blogId = req.params.id;
        const blog = yield Blog_1.default.findById(blogId).select("comments");
        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        res.status(200).json({
            message: "Comments fetched successfully",
            comments: blog.comments,
            totalComments: blog.comments.length,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getComments = getComments;
const deleteComment = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { blogId, commentId } = req.params;
        const blog = yield Blog_1.default.findById(blogId);
        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        // Find the comment index
        const commentIndex = blog.comments.findIndex((comment) => { var _a; return ((_a = comment._id) === null || _a === void 0 ? void 0 : _a.toString()) === commentId; });
        if (commentIndex === -1) {
            res.status(404).json({ message: "Comment not found" });
            return;
        }
        // Remove the comment
        blog.comments.splice(commentIndex, 1);
        yield blog.save();
        res.status(200).json({
            message: "Comment deleted successfully",
            comments: blog.comments,
            totalComments: blog.comments.length,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.deleteComment = deleteComment;
