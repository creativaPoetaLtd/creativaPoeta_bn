import Blog from "../models/Blog";

type RelatedBlogCandidate = {
  _id: unknown;
  title: string;
  slug?: string;
  excerpt?: string;
  image?: string;
  imageAlt?: string;
  category?: string;
  tags?: string[];
  language?: string;
  focusKeyword?: string;
  publishedAt?: Date;
  createdAt?: Date;
};

const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const words = (value: unknown) =>
  new Set(
    normalize(value)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4)
  );

const relevanceScore = (
  source: RelatedBlogCandidate,
  candidate: RelatedBlogCandidate
) => {
  let score = 0;
  const sourceCategory = normalize(source.category);
  const sourceKeyword = normalize(source.focusKeyword);
  const sourceTags = new Set((source.tags || []).map(normalize).filter(Boolean));

  if (sourceCategory && sourceCategory === normalize(candidate.category)) score += 8;
  if (sourceKeyword && sourceKeyword === normalize(candidate.focusKeyword)) score += 10;

  for (const tag of candidate.tags || []) {
    if (sourceTags.has(normalize(tag))) score += 4;
  }

  const sourceTerms = words(
    `${source.title} ${source.focusKeyword || ""} ${(source.tags || []).join(" ")}`
  );
  const candidateTerms = words(
    `${candidate.title} ${candidate.focusKeyword || ""} ${(candidate.tags || []).join(" ")}`
  );
  for (const term of candidateTerms) {
    if (sourceTerms.has(term)) score += 1;
  }

  return score;
};

export const findRelatedBlogs = async (
  source: RelatedBlogCandidate,
  limit = 3
) => {
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
  const relevanceClauses: Record<string, unknown>[] = [];
  if (source.category) relevanceClauses.push({ category: source.category });
  if (source.tags?.length) relevanceClauses.push({ tags: { $in: source.tags } });
  if (source.focusKeyword) relevanceClauses.push({ focusKeyword: source.focusKeyword });

  const relevantFilter = relevanceClauses.length
    ? {
        ...publishedFilter,
        $and: [...publishedFilter.$and, { $or: relevanceClauses }],
      }
    : publishedFilter;

  const relevant = (await Blog.find(relevantFilter)
    .select(
      "title slug excerpt image imageAlt category tags language focusKeyword publishedAt createdAt"
    )
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(100)
    .lean()) as RelatedBlogCandidate[];

  const candidates = [...relevant];
  if (candidates.length < limit) {
    const fallback = (await Blog.find({
      ...publishedFilter,
      _id: { $nin: [source._id, ...candidates.map((candidate) => candidate._id)] },
    })
      .select(
        "title slug excerpt image imageAlt category tags language focusKeyword publishedAt createdAt"
      )
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit - candidates.length)
      .lean()) as RelatedBlogCandidate[];
    candidates.push(...fallback);
  }

  return candidates
    .map((candidate) => ({ candidate, score: relevanceScore(source, candidate) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const rightDate = new Date(
        right.candidate.publishedAt || right.candidate.createdAt || 0
      ).getTime();
      const leftDate = new Date(
        left.candidate.publishedAt || left.candidate.createdAt || 0
      ).getTime();
      return rightDate - leftDate;
    })
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => candidate);
};
