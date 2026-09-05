"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteComment = exports.getComments = exports.addComment = exports.rebuildBlogSeo = exports.deleteBlog = exports.updateBlog = exports.getSingleBlog = exports.fetchAdminBlogs = exports.fetchBlogs = exports.generateProgrammaticBlogs = exports.planProgrammaticBlogTopics = exports.createBlog = void 0;
const fs_1 = __importDefault(require("fs"));
const mongoose_1 = __importDefault(require("mongoose"));
const Blog_1 = __importDefault(require("../models/Blog"));
const cloudinary_1 = require("../utils/cloudinary");
const frontendBuildService_1 = require("../services/frontendBuildService");
const blogRelatedService_1 = require("../services/blogRelatedService");
const adminNotificationEmail_1 = require("../utils/adminNotificationEmail");
const trashService_1 = require("../services/trashService");
const emailTemplate_1 = require("../utils/emailTemplate");
const blogGenerationService_1 = require("../services/blogGenerationService");
const LANGUAGES = new Set(["fr", "en", "nl", "kiny"]);
const STATUSES = new Set(["draft", "published", "archived"]);
const hideDeletedComments = (blog) => {
    const value = typeof (blog === null || blog === void 0 ? void 0 : blog.toObject) === "function" ? blog.toObject() : { ...blog };
    if (Array.isArray(value.comments)) {
        value.comments = value.comments.filter((comment) => (comment === null || comment === void 0 ? void 0 : comment.isDeleted) !== true);
    }
    return value;
};
const slugify = (value) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "article";
const plainText = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const parseTags = (value) => {
    if (Array.isArray(value))
        return value.map(String);
    if (typeof value !== "string")
        return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed))
            return parsed.map(String);
    }
    catch {
        // Comma-separated form values are supported.
    }
    return value.split(",");
};
const cleanTags = (value) => Array.from(new Set(parseTags(value)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12)));
const uploadBlogImage = async (req) => {
    var _a;
    if (!req.file)
        return undefined;
    try {
        const fileBuffer = fs_1.default.readFileSync(req.file.path);
        const result = await (0, cloudinary_1.uploadToCloudinary)(fileBuffer, "blogs");
        return result.secure_url;
    }
    finally {
        if (((_a = req.file) === null || _a === void 0 ? void 0 : _a.path) && fs_1.default.existsSync(req.file.path)) {
            fs_1.default.unlinkSync(req.file.path);
        }
    }
};
const uniqueSlug = async (requested, language, excludedId) => {
    const base = slugify(requested);
    let candidate = base;
    let suffix = 2;
    while (await Blog_1.default.exists({
        slug: candidate,
        language,
        ...(excludedId ? { _id: { $ne: excludedId } } : {}),
    })) {
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
    return candidate;
};
const publicFilter = (language) => {
    const clauses = [
        {
            $or: [
                { status: "published" },
                { status: { $exists: false } },
                { status: null },
            ],
        },
    ];
    if (language && LANGUAGES.has(language)) {
        clauses.push({
            $or: [
                { language },
                { language: { $exists: false } },
                { language: null },
            ],
        });
    }
    return { $and: clauses };
};
const basePayload = async (req, existing) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const title = String((_b = (_a = req.body.title) !== null && _a !== void 0 ? _a : existing === null || existing === void 0 ? void 0 : existing.title) !== null && _b !== void 0 ? _b : "").trim();
    const content = String((_d = (_c = req.body.content) !== null && _c !== void 0 ? _c : existing === null || existing === void 0 ? void 0 : existing.content) !== null && _d !== void 0 ? _d : "").trim();
    const requestedLanguage = String((_f = (_e = req.body.language) !== null && _e !== void 0 ? _e : existing === null || existing === void 0 ? void 0 : existing.language) !== null && _f !== void 0 ? _f : "fr");
    const language = LANGUAGES.has(requestedLanguage) ? requestedLanguage : "fr";
    const requestedStatus = String((_h = (_g = req.body.status) !== null && _g !== void 0 ? _g : existing === null || existing === void 0 ? void 0 : existing.status) !== null && _h !== void 0 ? _h : "draft");
    const status = STATUSES.has(requestedStatus) ? requestedStatus : "draft";
    const requestedSlug = String(req.body.slug || title);
    const slug = await uniqueSlug(requestedSlug, language, existing === null || existing === void 0 ? void 0 : existing.id);
    const excerpt = String(req.body.excerpt || "").trim() ||
        (existing === null || existing === void 0 ? void 0 : existing.excerpt) ||
        plainText(content).slice(0, 240);
    const image = await uploadBlogImage(req);
    return {
        title,
        slug,
        excerpt,
        content,
        image: image !== null && image !== void 0 ? image : existing === null || existing === void 0 ? void 0 : existing.image,
        imageAlt: String(req.body.imageAlt || "").trim() ||
            (existing === null || existing === void 0 ? void 0 : existing.imageAlt) ||
            title,
        category: String(req.body.category || "").trim() ||
            (existing === null || existing === void 0 ? void 0 : existing.category) ||
            "Conseils",
        tags: req.body.tags !== undefined ? cleanTags(req.body.tags) : (existing === null || existing === void 0 ? void 0 : existing.tags) || [],
        language,
        translationKey: String(req.body.translationKey || "").trim() ||
            (existing === null || existing === void 0 ? void 0 : existing.translationKey) ||
            slugify(title),
        seoTitle: String(req.body.seoTitle || "").trim() ||
            (existing === null || existing === void 0 ? void 0 : existing.seoTitle) ||
            title.slice(0, 65),
        seoDescription: String(req.body.seoDescription || "").trim() ||
            (existing === null || existing === void 0 ? void 0 : existing.seoDescription) ||
            excerpt.slice(0, 175),
        focusKeyword: String(req.body.focusKeyword || "").trim() ||
            (existing === null || existing === void 0 ? void 0 : existing.focusKeyword) ||
            "",
        status,
        publishedAt: status === "published"
            ? (existing === null || existing === void 0 ? void 0 : existing.publishedAt) || new Date()
            : existing === null || existing === void 0 ? void 0 : existing.publishedAt,
        cta: {
            label: String(req.body.ctaLabel || "").trim() ||
                ((_j = existing === null || existing === void 0 ? void 0 : existing.cta) === null || _j === void 0 ? void 0 : _j.label) ||
                "",
            url: String(req.body.ctaUrl || "").trim() ||
                ((_k = existing === null || existing === void 0 ? void 0 : existing.cta) === null || _k === void 0 ? void 0 : _k.url) ||
                "",
            type: ["service", "affiliate", "contact"].includes(String(req.body.ctaType))
                ? req.body.ctaType
                : ((_l = existing === null || existing === void 0 ? void 0 : existing.cta) === null || _l === void 0 ? void 0 : _l.type) || "service",
        },
        affiliateDisclosure: req.body.affiliateDisclosure !== undefined
            ? ["true", "1", "on", true].includes(req.body.affiliateDisclosure)
            : (existing === null || existing === void 0 ? void 0 : existing.affiliateDisclosure) || false,
    };
};
const createBlog = async (req, res, next) => {
    var _a;
    try {
        if (!String(req.body.title || "").trim() || !String(req.body.content || "").trim()) {
            res.status(400).json({ message: "Title and content are required." });
            return;
        }
        const payload = await basePayload(req);
        const blog = await Blog_1.default.create({
            ...payload,
            author: req.user._id,
            comments: [],
        });
        const seoRebuild = blog.status === "published"
            ? await (0, frontendBuildService_1.triggerFrontendBuild)(`article published: ${blog.slug || blog.id}`)
            : undefined;
        res.status(201).json({
            message: "Blog created successfully",
            blog,
            seoRebuild,
        });
    }
    catch (error) {
        if (((_a = req.file) === null || _a === void 0 ? void 0 : _a.path) && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(error);
    }
};
exports.createBlog = createBlog;
const planProgrammaticBlogTopics = async (req, res, next) => {
    try {
        const seed = String(req.body.seed || "").trim().slice(0, 180);
        const requestedLanguage = String(req.body.language || "fr");
        const language = LANGUAGES.has(requestedLanguage) ? requestedLanguage : "fr";
        const count = Math.min(10, Math.max(1, Number(req.body.count) || 10));
        const input = {
            seed,
            audience: String(req.body.audience || "PME, independants et associations").trim().slice(0, 180),
            location: String(req.body.location || "Belgique").trim().slice(0, 120),
            goal: String(req.body.goal || "generer des articles utiles qui convertissent vers les services CP").trim().slice(0, 220),
            language,
            count,
            includeAffiliate: ["true", "1", "on", true].includes(req.body.includeAffiliate),
        };
        const result = await (0, blogGenerationService_1.planSeoTopics)(input);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
};
exports.planProgrammaticBlogTopics = planProgrammaticBlogTopics;
const generateProgrammaticBlogs = async (req, res, next) => {
    try {
        const topic = String(req.body.topic || "").trim().slice(0, 200);
        if (topic.length < 3) {
            res.status(400).json({ message: "A topic of at least 3 characters is required." });
            return;
        }
        const requestedLanguage = String(req.body.language || "fr");
        const language = LANGUAGES.has(requestedLanguage) ? requestedLanguage : "fr";
        const requestedIntent = String(req.body.intent || "informational");
        const intent = ["informational", "commercial", "comparison", "local"].includes(requestedIntent)
            ? requestedIntent
            : "informational";
        const count = Math.min(10, Math.max(1, Number(req.body.count) || 1));
        const rawKeywords = Array.isArray(req.body.keywords)
            ? req.body.keywords
            : String(req.body.keywords || "").split(/[\n,;]/);
        const keywords = Array.from(new Set(rawKeywords.map((value) => String(value).trim()).filter(Boolean))).slice(0, 20);
        const category = String(req.body.category || "Conseils").trim().slice(0, 80);
        const ctaType = ["service", "affiliate", "contact"].includes(String(req.body.ctaType))
            ? req.body.ctaType
            : "service";
        const input = {
            topic,
            keywords,
            audience: String(req.body.audience || "").trim().slice(0, 180),
            location: String(req.body.location || "").trim().slice(0, 120),
            intent,
            language,
            category,
            count,
            ctaLabel: String(req.body.ctaLabel || "").trim().slice(0, 100),
            ctaUrl: String(req.body.ctaUrl || "").trim().slice(0, 500),
        };
        const result = await (0, blogGenerationService_1.generateBlogDrafts)(input);
        const existing = await Blog_1.default.find({ language }).select("title focusKeyword").lean();
        const knownTitles = new Set(existing.map((blog) => slugify(blog.title)));
        const knownKeywords = new Set(existing.map((blog) => slugify(blog.focusKeyword || "")).filter(Boolean));
        const created = [];
        const skipped = [];
        for (const draft of result.drafts) {
            const titleKey = slugify(draft.title);
            const keywordKey = slugify(draft.focusKeyword);
            if (knownTitles.has(titleKey) || (keywordKey && knownKeywords.has(keywordKey))) {
                skipped.push({ title: draft.title, reason: "duplicate" });
                continue;
            }
            const quality = (0, blogGenerationService_1.evaluateDraftQuality)(draft, input.ctaUrl);
            const slug = await uniqueSlug(draft.title, language);
            const blog = await Blog_1.default.create({
                ...draft,
                slug,
                language,
                category,
                translationKey: slug,
                status: "draft",
                author: req.user._id,
                cta: { label: input.ctaLabel, url: input.ctaUrl, type: ctaType },
                affiliateDisclosure: ctaType === "affiliate",
                generation: {
                    source: result.source,
                    batchId: result.batchId,
                    seed: topic,
                    qualityScore: quality.score,
                    qualityIssues: quality.issues,
                    wordCount: quality.wordCount,
                    generatedAt: new Date(),
                },
                comments: [],
            });
            created.push(blog);
            knownTitles.add(titleKey);
            if (keywordKey)
                knownKeywords.add(keywordKey);
        }
        res.status(201).json({
            message: `${created.length} draft(s) created for editorial review.`,
            source: result.source,
            batchId: result.batchId,
            created,
            skipped,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.generateProgrammaticBlogs = generateProgrammaticBlogs;
const fetchBlogs = async (req, res, next) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
        const language = String(req.query.language || "");
        const category = String(req.query.category || "").trim();
        const search = String(req.query.search || "").trim();
        const filter = publicFilter(language);
        if (category)
            filter.$and.push({ category });
        if (search) {
            filter.$and.push({
                $or: [
                    { title: { $regex: search, $options: "i" } },
                    { excerpt: { $regex: search, $options: "i" } },
                    { tags: { $in: [new RegExp(search, "i")] } },
                ],
            });
        }
        const [blogs, total, categories] = await Promise.all([
            Blog_1.default.find(filter)
                .select("-comments.email")
                .populate("author", "name")
                .sort({ publishedAt: -1, createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Blog_1.default.countDocuments(filter),
            Blog_1.default.distinct("category", publicFilter(language)),
        ]);
        res.status(200).json({
            blogs: blogs.map(hideDeletedComments),
            categories: categories.filter(Boolean).sort(),
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.fetchBlogs = fetchBlogs;
const fetchAdminBlogs = async (req, res, next) => {
    try {
        const blogs = await Blog_1.default.find()
            .populate("author", "name email")
            .sort({ updatedAt: -1 });
        res.status(200).json({ blogs: blogs.map(hideDeletedComments) });
    }
    catch (error) {
        next(error);
    }
};
exports.fetchAdminBlogs = fetchAdminBlogs;
const getSingleBlog = async (req, res, next) => {
    try {
        const identifier = req.params.identifier;
        const language = String(req.query.language || "");
        const identity = mongoose_1.default.isValidObjectId(identifier)
            ? { _id: identifier }
            : { slug: identifier.toLowerCase() };
        const filter = publicFilter(language);
        filter.$and.push(identity);
        const blog = await Blog_1.default.findOne(filter)
            .select("-comments.email")
            .populate("author", "name");
        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        const translations = blog.translationKey
            ? await Blog_1.default.find({
                translationKey: blog.translationKey,
                _id: { $ne: blog._id },
                $or: [
                    { status: "published" },
                    { status: { $exists: false } },
                    { status: null },
                ],
            }).select("title slug language")
            : [];
        const relatedArticles = await (0, blogRelatedService_1.findRelatedBlogs)(blog.toObject(), 3);
        res.status(200).json({ blog: hideDeletedComments(blog), translations, relatedArticles });
    }
    catch (error) {
        next(error);
    }
};
exports.getSingleBlog = getSingleBlog;
const updateBlog = async (req, res, next) => {
    var _a, _b;
    try {
        const existing = await Blog_1.default.findById(req.params.id);
        if (!existing) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        const wasPublished = (existing.status || "published") === "published";
        const payload = await basePayload(req, existing);
        if (((_a = existing.generation) === null || _a === void 0 ? void 0 : _a.source) && existing.generation.source !== "manual") {
            const cta = payload.cta;
            const quality = (0, blogGenerationService_1.evaluateDraftQuality)({
                title: String(payload.title || ""),
                excerpt: String(payload.excerpt || ""),
                content: String(payload.content || ""),
                seoTitle: String(payload.seoTitle || ""),
                seoDescription: String(payload.seoDescription || ""),
                focusKeyword: String(payload.focusKeyword || ""),
                tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
                imageAlt: String(payload.imageAlt || ""),
            }, String((cta === null || cta === void 0 ? void 0 : cta.url) || ""));
            payload.generation = {
                source: existing.generation.source,
                batchId: existing.generation.batchId,
                seed: existing.generation.seed,
                generatedAt: existing.generation.generatedAt,
                qualityScore: quality.score,
                qualityIssues: quality.issues,
                wordCount: quality.wordCount,
            };
        }
        existing.set(payload);
        await existing.save();
        await existing.populate("author", "name email");
        const seoRebuild = existing.status === "published"
            ? await (0, frontendBuildService_1.triggerFrontendBuild)(`${wasPublished ? "article updated" : "article published"}: ${existing.slug || existing.id}`)
            : wasPublished
                ? await (0, frontendBuildService_1.triggerFrontendBuild)(`article unpublished: ${existing.slug || existing.id}`)
                : undefined;
        res.status(200).json({
            message: "Blog updated successfully",
            blog: existing,
            seoRebuild,
        });
    }
    catch (error) {
        if (((_b = req.file) === null || _b === void 0 ? void 0 : _b.path) && fs_1.default.existsSync(req.file.path))
            fs_1.default.unlinkSync(req.file.path);
        next(error);
    }
};
exports.updateBlog = updateBlog;
const deleteBlog = async (req, res, next) => {
    try {
        const deleted = await Blog_1.default.findById(req.params.id);
        if (!deleted) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        await (0, trashService_1.moveDocumentToTrash)({
            entityType: "blog",
            document: deleted,
            label: `${deleted.title || "Blog"} · ${deleted.slug || deleted._id}`,
            req,
        });
        const seoRebuild = (deleted.status || "published") === "published"
            ? await (0, frontendBuildService_1.triggerFrontendBuild)(`article deleted: ${deleted.slug || deleted.id}`)
            : undefined;
        res.status(200).json({ message: "Blog deleted successfully", seoRebuild });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteBlog = deleteBlog;
const rebuildBlogSeo = async (_req, res, next) => {
    try {
        const seoRebuild = await (0, frontendBuildService_1.triggerFrontendBuild)("manual blog SEO rebuild");
        res.status(seoRebuild.status === "queued" ? 202 : 200).json({
            message: seoRebuild.message,
            seoRebuild,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.rebuildBlogSeo = rebuildBlogSeo;
const addComment = async (req, res, next) => {
    try {
        const { name, email, text } = req.body;
        if (!name || !email || !text) {
            res.status(400).json({ message: "Name, email and comment text are required." });
            return;
        }
        if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(String(email))) {
            res.status(400).json({ message: "Please provide a valid email address." });
            return;
        }
        const blog = await Blog_1.default.findOne({
            _id: req.params.id,
            ...publicFilter(),
        });
        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        const commentName = String(name).trim().slice(0, 100);
        const commentEmail = String(email).trim().toLowerCase();
        const commentText = String(text).trim().slice(0, 1000);
        blog.comments.push({
            name: commentName,
            email: commentEmail,
            text: commentText,
            createdAt: new Date(),
        });
        await blog.save();
        const emailSent = await (0, adminNotificationEmail_1.sendAdminNotificationEmail)(`New blog comment - ${blog.title}`, `
        <h2>New blog comment</h2>
        <p><strong>Article:</strong> ${(0, emailTemplate_1.escapeHtml)(blog.title)}</p>
        <p><strong>Name:</strong> ${(0, emailTemplate_1.escapeHtml)(commentName)}</p>
        <p><strong>Email:</strong> ${(0, emailTemplate_1.escapeHtml)(commentEmail)}</p>
        <p><strong>Comment:</strong></p>
        <p>${(0, emailTemplate_1.escapeHtml)(commentText).replace(/\n/g, "<br>")}</p>
        <p>Open the Blogs tab in the Creativa Poeta dashboard to review it.</p>
      `);
        res.status(201).json({
            message: "Comment added successfully",
            totalComments: blog.comments.filter((comment) => comment.isDeleted !== true).length,
            emailSent,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.addComment = addComment;
const getComments = async (req, res, next) => {
    try {
        const blog = await Blog_1.default.findById(req.params.id).select("comments.name comments.text comments.createdAt");
        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        const comments = blog.comments.filter((comment) => comment.isDeleted !== true);
        res.status(200).json({ comments, totalComments: comments.length });
    }
    catch (error) {
        next(error);
    }
};
exports.getComments = getComments;
const deleteComment = async (req, res, next) => {
    try {
        const blog = await Blog_1.default.findById(req.params.blogId);
        if (!blog) {
            res.status(404).json({ message: "Blog not found" });
            return;
        }
        const index = blog.comments.findIndex((comment) => { var _a; return ((_a = comment._id) === null || _a === void 0 ? void 0 : _a.toString()) === req.params.commentId; });
        if (index < 0) {
            res.status(404).json({ message: "Comment not found" });
            return;
        }
        const comment = blog.comments[index];
        await (0, trashService_1.moveSnapshotToTrash)({
            entityType: "blog_comment",
            originalId: String(comment._id),
            label: `${comment.name || "Blog comment"} · ${blog.title}`,
            snapshot: { blogId: blog._id, comment: (0, trashService_1.snapshotForTrash)(comment) },
            req,
        });
        res.status(200).json({ message: "Comment deleted" });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteComment = deleteComment;
