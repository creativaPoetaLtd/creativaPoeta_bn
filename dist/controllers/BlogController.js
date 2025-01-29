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
exports.getBlogDetails = exports.addComment = exports.likeBlog = exports.updateBlog = exports.getSingleBlog = exports.fetchBlogs = exports.createBlog = void 0;
const Blog_1 = __importDefault(require("../models/Blog"));
const cloudinary_1 = require("../utils/cloudinary");
const createBlog = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { title, content } = req.body;
        if (!title || !content) {
            res.status(400).json({ message: "Title and content are required." });
            return;
        }
        // Use the uploaded file's Cloudinary URL if a file exists
        const imageUrl = ((_a = req.file) === null || _a === void 0 ? void 0 : _a.path) || ""; // Multer stores the Cloudinary URL in `req.file.path`
        const blogData = {
            title,
            content,
            author: req.user._id, // Assumes `req.user` is populated by your auth middleware
            image: imageUrl, // Save image URL in the blog
        };
        const blog = new Blog_1.default(blogData);
        yield blog.save();
        res.status(201).json({ message: "Blog created successfully", blog });
    }
    catch (error) {
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
// Get a single blog
const getSingleBlog = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const blogId = req.params.id;
        const blog = yield Blog_1.default.findById(blogId);
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
    try {
        const blogId = req.params.id;
        // Handle image upload if a new file is provided
        let imageUrl = req.body.image; // Retain the existing image URL if no new image is uploaded
        if (req.file) {
            const result = yield (0, cloudinary_1.uploadToCloudinary)(req.file.buffer, "blogs");
            imageUrl = result.secure_url;
        }
        const updatedData = Object.assign(Object.assign({}, req.body), { image: imageUrl });
        const blog = yield Blog_1.default.findByIdAndUpdate(blogId, updatedData, { new: true });
        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        res.status(200).json({ message: "Blog updated successfully", blog });
    }
    catch (error) {
        next(error);
    }
});
exports.updateBlog = updateBlog;
const likeBlog = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const blogId = req.params.id;
        const userId = req.user._id; // Assuming `req.user` contains authenticated user info
        const blog = yield Blog_1.default.findById(blogId);
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
        }
        else {
            // Otherwise, add the user's like
            blog.likes.push(userId);
        }
        yield blog.save();
        res.status(200).json({ message: "Like toggled successfully", likes: blog.likes.length });
    }
    catch (error) {
        next(error);
    }
});
exports.likeBlog = likeBlog;
const addComment = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const blogId = req.params.id;
        const { text } = req.body;
        if (!text) {
            res.status(400).json({ message: "Comment text is required." });
            return;
        }
        const blog = yield Blog_1.default.findById(blogId);
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
        yield blog.save();
        res.status(201).json({ message: "Comment added successfully", comments: blog.comments });
    }
    catch (error) {
        next(error);
    }
});
exports.addComment = addComment;
const getBlogDetails = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { blogId } = req.params;
        const blog = yield Blog_1.default.findById(blogId)
            .populate("author", "name") // Populate author details
            .populate("comments.user", "name"); // Populate commenter details
        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        res.status(200).json({ blog });
    }
    catch (error) {
        next(error);
    }
});
exports.getBlogDetails = getBlogDetails;
