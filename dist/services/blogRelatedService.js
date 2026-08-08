"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findRelatedBlogs = void 0;
const Blog_1 = __importDefault(require("../models/Blog"));
const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const words = (value) => new Set(normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4));
const relevanceScore = (source, candidate) => {
    let score = 0;
    const sourceCategory = normalize(source.category);
    const sourceKeyword = normalize(source.focusKeyword);
    const sourceTags = new Set((source.tags || []).map(normalize).filter(Boolean));
    if (sourceCategory && sourceCategory === normalize(candidate.category))
        score += 8;
    if (sourceKeyword && sourceKeyword === normalize(candidate.focusKeyword))
        score += 10;
    for (const tag of candidate.tags || []) {
        if (sourceTags.has(normalize(tag)))
            score += 4;
    }
    const sourceTerms = words(`${source.title} ${source.focusKeyword || ""} ${(source.tags || []).join(" ")}`);
    const candidateTerms = words(`${candidate.title} ${candidate.focusKeyword || ""} ${(candidate.tags || []).join(" ")}`);
    for (const term of candidateTerms) {
        if (sourceTerms.has(term))
            score += 1;
    }
    return score;
};
const findRelatedBlogs = async (source, limit = 3) => {
    var _a;
    const publishedFilter = {
        _id: { $ne: source._id },
        language: source.language || "fr",
        $and: [
            {
                $or: [
                    { status: "published" },
                    { status: { $exists: false } },
                    { status: null },
                ],
            },
        ],
    };
    const relevanceClauses = [];
    if (source.category)
        relevanceClauses.push({ category: source.category });
    if ((_a = source.tags) === null || _a === void 0 ? void 0 : _a.length)
        relevanceClauses.push({ tags: { $in: source.tags } });
    if (source.focusKeyword)
        relevanceClauses.push({ focusKeyword: source.focusKeyword });
    const relevantFilter = relevanceClauses.length
        ? {
            ...publishedFilter,
            $and: [...publishedFilter.$and, { $or: relevanceClauses }],
        }
        : publishedFilter;
    const relevant = (await Blog_1.default.find(relevantFilter)
        .select("title slug excerpt image imageAlt category tags language focusKeyword publishedAt createdAt")
        .sort({ publishedAt: -1, createdAt: -1 })
        .limit(100)
        .lean());
    const candidates = [...relevant];
    if (candidates.length < limit) {
        const fallback = (await Blog_1.default.find({
            ...publishedFilter,
            _id: { $nin: [source._id, ...candidates.map((candidate) => candidate._id)] },
        })
            .select("title slug excerpt image imageAlt category tags language focusKeyword publishedAt createdAt")
            .sort({ publishedAt: -1, createdAt: -1 })
            .limit(limit - candidates.length)
            .lean());
        candidates.push(...fallback);
    }
    return candidates
        .map((candidate) => ({ candidate, score: relevanceScore(source, candidate) }))
        .sort((left, right) => {
        if (right.score !== left.score)
            return right.score - left.score;
        const rightDate = new Date(right.candidate.publishedAt || right.candidate.createdAt || 0).getTime();
        const leftDate = new Date(left.candidate.publishedAt || left.candidate.createdAt || 0).getTime();
        return rightDate - leftDate;
    })
        .slice(0, Math.max(0, limit))
        .map(({ candidate }) => candidate);
};
exports.findRelatedBlogs = findRelatedBlogs;
