import { NextFunction, Request, Response } from "express";
import fs from "fs";
import mongoose from "mongoose";
import Blog, { BlogLanguage, BlogStatus, IBlog } from "../models/Blog";
import { uploadToCloudinary } from "../utils/cloudinary";
import { triggerFrontendBuild } from "../services/frontendBuildService";
import { findRelatedBlogs } from "../services/blogRelatedService";
import {
  BlogGenerationInput,
  evaluateDraftQuality,
  generateBlogDrafts,
} from "../services/blogGenerationService";

const LANGUAGES = new Set<BlogLanguage>(["fr", "en", "nl", "kiny"]);
const STATUSES = new Set<BlogStatus>(["draft", "published", "archived"]);

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "article";

const plainText = (html: string) =>
  html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const parseTags = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Comma-separated form values are supported.
  }
  return value.split(",");
};

const cleanTags = (value: unknown) =>
  Array.from(
    new Set(
      parseTags(value)
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
    )
  );

const uploadBlogImage = async (req: Request) => {
  if (!req.file) return undefined;
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const result = await uploadToCloudinary(fileBuffer, "blogs");
    return (result as any).secure_url as string;
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
};

const uniqueSlug = async (
  requested: string,
  language: BlogLanguage,
  excludedId?: string
) => {
  const base = slugify(requested);
  let candidate = base;
  let suffix = 2;

  while (
    await Blog.exists({
      slug: candidate,
      language,
      ...(excludedId ? { _id: { $ne: excludedId } } : {}),
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
};

const publicFilter = (language?: string) => {
  const clauses: any[] = [
    {
      $or: [
        { status: "published" },
        { status: { $exists: false } },
        { status: null },
      ],
    },
  ];

  if (language && LANGUAGES.has(language as BlogLanguage)) {
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

const basePayload = async (
  req: Request,
  existing?: IBlog
): Promise<Record<string, unknown>> => {
  const title = String(req.body.title ?? existing?.title ?? "").trim();
  const content = String(req.body.content ?? existing?.content ?? "").trim();
  const requestedLanguage = String(
    req.body.language ?? existing?.language ?? "fr"
  ) as BlogLanguage;
  const language = LANGUAGES.has(requestedLanguage) ? requestedLanguage : "fr";
  const requestedStatus = String(
    req.body.status ?? existing?.status ?? "draft"
  ) as BlogStatus;
  const status = STATUSES.has(requestedStatus) ? requestedStatus : "draft";
  const requestedSlug = String(req.body.slug || title);
  const slug = await uniqueSlug(
    requestedSlug,
    language,
    existing?.id
  );
  const excerpt =
    String(req.body.excerpt || "").trim() ||
    existing?.excerpt ||
    plainText(content).slice(0, 240);
  const image = await uploadBlogImage(req);

  return {
    title,
    slug,
    excerpt,
    content,
    image: image ?? existing?.image,
    imageAlt:
      String(req.body.imageAlt || "").trim() ||
      existing?.imageAlt ||
      title,
    category:
      String(req.body.category || "").trim() ||
      existing?.category ||
      "Conseils",
    tags:
      req.body.tags !== undefined ? cleanTags(req.body.tags) : existing?.tags || [],
    language,
    translationKey:
      String(req.body.translationKey || "").trim() ||
      existing?.translationKey ||
      slugify(title),
    seoTitle:
      String(req.body.seoTitle || "").trim() ||
      existing?.seoTitle ||
      title.slice(0, 65),
    seoDescription:
      String(req.body.seoDescription || "").trim() ||
      existing?.seoDescription ||
      excerpt.slice(0, 175),
    focusKeyword:
      String(req.body.focusKeyword || "").trim() ||
      existing?.focusKeyword ||
      "",
    status,
    publishedAt:
      status === "published"
        ? existing?.publishedAt || new Date()
        : existing?.publishedAt,
    cta: {
      label:
        String(req.body.ctaLabel || "").trim() ||
        existing?.cta?.label ||
        "",
      url:
        String(req.body.ctaUrl || "").trim() ||
        existing?.cta?.url ||
        "",
      type: ["service", "affiliate", "contact"].includes(
        String(req.body.ctaType)
      )
        ? req.body.ctaType
        : existing?.cta?.type || "service",
    },
    affiliateDisclosure:
      req.body.affiliateDisclosure !== undefined
        ? ["true", "1", "on", true].includes(req.body.affiliateDisclosure)
        : existing?.affiliateDisclosure || false,
  };
};

export const createBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!String(req.body.title || "").trim() || !String(req.body.content || "").trim()) {
      res.status(400).json({ message: "Title and content are required." });
      return;
    }

    const payload = await basePayload(req);
    const blog = await Blog.create({
      ...payload,
      author: req.user._id,
      comments: [],
    });

    const seoRebuild =
      blog.status === "published"
        ? await triggerFrontendBuild(`article published: ${blog.slug || blog.id}`)
        : undefined;
    res.status(201).json({
      message: "Blog created successfully",
      blog,
      seoRebuild,
    });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(error);
  }
};

export const generateProgrammaticBlogs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const topic = String(req.body.topic || "").trim().slice(0, 200);
    if (topic.length < 3) {
      res.status(400).json({ message: "A topic of at least 3 characters is required." });
      return;
    }

    const requestedLanguage = String(req.body.language || "fr") as BlogLanguage;
    const language = LANGUAGES.has(requestedLanguage) ? requestedLanguage : "fr";
    const requestedIntent = String(req.body.intent || "informational");
    const intent = ["informational", "commercial", "comparison", "local"].includes(requestedIntent)
      ? requestedIntent as BlogGenerationInput["intent"]
      : "informational";
    const count = Math.min(10, Math.max(1, Number(req.body.count) || 1));
    const rawKeywords: unknown[] = Array.isArray(req.body.keywords)
      ? req.body.keywords
      : String(req.body.keywords || "").split(/[\n,;]/);
    const keywords = Array.from(
      new Set<string>(rawKeywords.map((value: unknown) => String(value).trim()).filter(Boolean))
    ).slice(0, 20);
    const category = String(req.body.category || "Conseils").trim().slice(0, 80);
    const ctaType = ["service", "affiliate", "contact"].includes(String(req.body.ctaType))
      ? req.body.ctaType
      : "service";

    const input: BlogGenerationInput = {
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

    const result = await generateBlogDrafts(input);
    const existing = await Blog.find({ language }).select("title focusKeyword").lean();
    const knownTitles = new Set(existing.map((blog) => slugify(blog.title)));
    const knownKeywords = new Set(
      existing.map((blog) => slugify(blog.focusKeyword || "")).filter(Boolean)
    );
    const created: IBlog[] = [];
    const skipped: Array<{ title: string; reason: string }> = [];

    for (const draft of result.drafts) {
      const titleKey = slugify(draft.title);
      const keywordKey = slugify(draft.focusKeyword);
      if (knownTitles.has(titleKey) || (keywordKey && knownKeywords.has(keywordKey))) {
        skipped.push({ title: draft.title, reason: "duplicate" });
        continue;
      }

      const quality = evaluateDraftQuality(draft, input.ctaUrl);
      const slug = await uniqueSlug(draft.title, language);
      const blog = await Blog.create({
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
      if (keywordKey) knownKeywords.add(keywordKey);
    }

    res.status(201).json({
      message: `${created.length} draft(s) created for editorial review.`,
      source: result.source,
      batchId: result.batchId,
      created,
      skipped,
    });
  } catch (error) {
    next(error);
  }
};
export const fetchBlogs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
    const language = String(req.query.language || "");
    const category = String(req.query.category || "").trim();
    const search = String(req.query.search || "").trim();

    const filter: any = publicFilter(language);
    if (category) filter.$and.push({ category });
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
      Blog.find(filter)
        .select("-comments.email")
        .populate("author", "name")
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Blog.countDocuments(filter),
      Blog.distinct("category", publicFilter(language)),
    ]);

    res.status(200).json({
      blogs,
      categories: categories.filter(Boolean).sort(),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const fetchAdminBlogs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const blogs = await Blog.find()
      .populate("author", "name email")
      .sort({ updatedAt: -1 });
    res.status(200).json({ blogs });
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
    const identifier = req.params.identifier;
    const language = String(req.query.language || "");
    const identity = mongoose.isValidObjectId(identifier)
      ? { _id: identifier }
      : { slug: identifier.toLowerCase() };
    const filter: any = publicFilter(language);
    filter.$and.push(identity);

    const blog = await Blog.findOne(filter)
      .select("-comments.email")
      .populate("author", "name");

    if (!blog) {
      res.status(404).json({ message: "Blog not found" });
      return;
    }

    const translations = blog.translationKey
      ? await Blog.find({
          translationKey: blog.translationKey,
          _id: { $ne: blog._id },
          $or: [
            { status: "published" },
            { status: { $exists: false } },
            { status: null },
          ],
        }).select("title slug language")
      : [];

    const relatedArticles = await findRelatedBlogs(blog.toObject(), 3);

    res.status(200).json({ blog, translations, relatedArticles });
  } catch (error) {
    next(error);
  }
};

export const updateBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const existing = await Blog.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ message: "Blog not found" });
      return;
    }

    const wasPublished = (existing.status || "published") === "published";
    const payload = await basePayload(req, existing);
    if (existing.generation?.source && existing.generation.source !== "manual") {
      const cta = payload.cta as { url?: string } | undefined;
      const quality = evaluateDraftQuality(
        {
          title: String(payload.title || ""),
          excerpt: String(payload.excerpt || ""),
          content: String(payload.content || ""),
          seoTitle: String(payload.seoTitle || ""),
          seoDescription: String(payload.seoDescription || ""),
          focusKeyword: String(payload.focusKeyword || ""),
          tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
          imageAlt: String(payload.imageAlt || ""),
        },
        String(cta?.url || "")
      );
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

    const seoRebuild =
      existing.status === "published"
        ? await triggerFrontendBuild(
            `${wasPublished ? "article updated" : "article published"}: ${existing.slug || existing.id}`
          )
        : wasPublished
          ? await triggerFrontendBuild(`article unpublished: ${existing.slug || existing.id}`)
          : undefined;
    res.status(200).json({
      message: "Blog updated successfully",
      blog: existing,
      seoRebuild,
    });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(error);
  }
};

export const deleteBlog = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const deleted = await Blog.findByIdAndDelete(req.params.id);
    if (!deleted) {
      res.status(404).json({ message: "Blog not found" });
      return;
    }
    const seoRebuild =
      (deleted.status || "published") === "published"
        ? await triggerFrontendBuild(`article deleted: ${deleted.slug || deleted.id}`)
        : undefined;
    res.status(200).json({ message: "Blog deleted successfully", seoRebuild });
  } catch (error) {
    next(error);
  }
};

export const rebuildBlogSeo = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const seoRebuild = await triggerFrontendBuild("manual blog SEO rebuild");
    res.status(seoRebuild.status === "queued" ? 202 : 200).json({
      message: seoRebuild.message,
      seoRebuild,
    });
  } catch (error) {
    next(error);
  }
};
export const addComment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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

    const blog = await Blog.findOne({
      _id: req.params.id,
      ...publicFilter(),
    });
    if (!blog) {
      res.status(404).json({ message: "Blog not found" });
      return;
    }

    blog.comments.push({
      name: String(name).trim().slice(0, 100),
      email: String(email).trim().toLowerCase(),
      text: String(text).trim().slice(0, 1000),
      createdAt: new Date(),
    });
    await blog.save();

    res.status(201).json({
      message: "Comment added successfully",
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
    const blog = await Blog.findById(req.params.id).select(
      "comments.name comments.text comments.createdAt"
    );
    if (!blog) {
      res.status(404).json({ message: "Blog not found" });
      return;
    }
    res.status(200).json({
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
    const blog = await Blog.findById(req.params.blogId);
    if (!blog) {
      res.status(404).json({ message: "Blog not found" });
      return;
    }
    const index = blog.comments.findIndex(
      (comment) => comment._id?.toString() === req.params.commentId
    );
    if (index < 0) {
      res.status(404).json({ message: "Comment not found" });
      return;
    }
    blog.comments.splice(index, 1);
    await blog.save();
    res.status(200).json({ message: "Comment deleted" });
  } catch (error) {
    next(error);
  }
};