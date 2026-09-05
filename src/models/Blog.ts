import mongoose, { Document, Schema } from "mongoose";
import { softDeletePlugin } from "../plugins/softDeletePlugin";

export type BlogLanguage = "fr" | "en" | "nl" | "kiny";
export type BlogStatus = "draft" | "published" | "archived";

export interface IComment {
  _id?: mongoose.Types.ObjectId;
  name: string;
  email: string;
  text: string;
  createdAt: Date;
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedById?: string;
  deletedByEmail?: string;
  deletedByName?: string;
}

export interface IBlog extends Document {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  author: mongoose.Types.ObjectId;
  image?: string;
  imageAlt?: string;
  category?: string;
  tags: string[];
  language?: BlogLanguage;
  translationKey?: string;
  seoTitle?: string;
  seoDescription?: string;
  focusKeyword?: string;
  status?: BlogStatus;
  publishedAt?: Date;
  cta?: {
    label?: string;
    url?: string;
    type?: "service" | "affiliate" | "contact";
  };
  affiliateDisclosure?: boolean;
  generation?: {
    source: "manual" | "openai" | "template";
    batchId?: string;
    seed?: string;
    qualityScore?: number;
    qualityIssues?: string[];
    wordCount?: number;
    generatedAt?: Date;
  };
  comments: IComment[];
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true },
    text: { type: String, required: true, trim: true, minlength: 5, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedById: { type: String, trim: true },
    deletedByEmail: { type: String, trim: true, lowercase: true },
    deletedByName: { type: String, trim: true },
  },
  { _id: true }
);

const BlogSchema = new Schema<IBlog>(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, trim: true, lowercase: true, maxlength: 200 },
    excerpt: { type: String, trim: true, maxlength: 420 },
    content: { type: String, required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    image: { type: String },
    imageAlt: { type: String, trim: true, maxlength: 180 },
    category: { type: String, trim: true, maxlength: 80, default: "Conseils" },
    tags: [{ type: String, trim: true, lowercase: true, maxlength: 60 }],
    language: {
      type: String,
      enum: ["fr", "en", "nl", "kiny"],
      default: "fr",
    },
    translationKey: { type: String, trim: true, maxlength: 120 },
    seoTitle: { type: String, trim: true, maxlength: 70 },
    seoDescription: { type: String, trim: true, maxlength: 180 },
    focusKeyword: { type: String, trim: true, maxlength: 100 },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    publishedAt: { type: Date },
    cta: {
      label: { type: String, trim: true, maxlength: 100 },
      url: { type: String, trim: true, maxlength: 500 },
      type: {
        type: String,
        enum: ["service", "affiliate", "contact"],
        default: "service",
      },
    },
    affiliateDisclosure: { type: Boolean, default: false },
    generation: {
      source: {
        type: String,
        enum: ["manual", "openai", "template"],
        default: "manual",
      },
      batchId: { type: String, trim: true, maxlength: 80 },
      seed: { type: String, trim: true, maxlength: 240 },
      qualityScore: { type: Number, min: 0, max: 100 },
      qualityIssues: [{ type: String, maxlength: 240 }],
      wordCount: { type: Number, min: 0 },
      generatedAt: { type: Date },
    },
    comments: [CommentSchema],
  },
  { timestamps: true }
);

BlogSchema.plugin(softDeletePlugin, { entityType: "blog" });

BlogSchema.index(
  { slug: 1, language: 1 },
  {
    unique: true,
    partialFilterExpression: {
      slug: { $type: "string" },
      language: { $type: "string" },
      isDeleted: false,
    },
    name: "active_blog_slug_language_unique",
  }
);
BlogSchema.index({ status: 1, language: 1, publishedAt: -1 });
BlogSchema.index({ category: 1, language: 1 });
BlogSchema.index({ title: "text", excerpt: "text", content: "text" });

export default mongoose.model<IBlog>("Blog", BlogSchema);
