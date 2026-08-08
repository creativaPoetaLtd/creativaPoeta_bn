"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const CommentSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true },
    text: { type: String, required: true, trim: true, minlength: 5, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });
const BlogSchema = new mongoose_1.Schema({
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, trim: true, lowercase: true, maxlength: 200 },
    excerpt: { type: String, trim: true, maxlength: 420 },
    content: { type: String, required: true },
    author: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
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
}, { timestamps: true });
BlogSchema.index({ slug: 1, language: 1 }, {
    unique: true,
    partialFilterExpression: {
        slug: { $type: "string" },
        language: { $type: "string" },
    },
});
BlogSchema.index({ status: 1, language: 1, publishedAt: -1 });
BlogSchema.index({ category: 1, language: 1 });
BlogSchema.index({ title: "text", excerpt: "text", content: "text" });
exports.default = mongoose_1.default.model("Blog", BlogSchema);
