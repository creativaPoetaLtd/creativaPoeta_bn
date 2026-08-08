"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRealtimeAnalytics = exports.buildAnalyticsOverview = exports.resolveAnalyticsDateRange = void 0;
const AnalyticsEvent_1 = __importDefault(require("../models/AnalyticsEvent"));
const AnalyticsSession_1 = __importDefault(require("../models/AnalyticsSession"));
const AnalyticsServerMetric_1 = __importDefault(require("../models/AnalyticsServerMetric"));
const searchConsoleService_1 = require("./searchConsoleService");
const analyticsAnomalyService_1 = require("./analyticsAnomalyService");
const humanSessionFilter = {
    $or: [{ isBot: false }, { isBot: { $exists: false } }],
};
const humanEventFilter = {
    $or: [{ "device.isBot": false }, { "device.isBot": { $exists: false } }],
};
const round = (value, precision = 1) => {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
};
const percentage = (value, total) => total > 0 ? round((value / total) * 100) : 0;
const changePercentage = (current, previous) => {
    if (previous === 0)
        return current === 0 ? 0 : 100;
    return round(((current - previous) / previous) * 100);
};
const resolveAnalyticsDateRange = (query) => {
    const requestedDays = Math.min(395, Math.max(1, Number(query.days) || 30));
    const customFrom = typeof query.from === "string" ? new Date(query.from) : null;
    const customTo = typeof query.to === "string" ? new Date(query.to) : null;
    const to = customTo && !Number.isNaN(customTo.getTime()) ? customTo : new Date();
    if (customTo && !Number.isNaN(customTo.getTime()))
        to.setHours(23, 59, 59, 999);
    const earliestAllowed = new Date(to.getTime() - 395 * 24 * 60 * 60 * 1000);
    let from = customFrom && !Number.isNaN(customFrom.getTime())
        ? customFrom
        : new Date(to.getTime() - requestedDays * 24 * 60 * 60 * 1000);
    if (from < earliestAllowed)
        from = earliestAllowed;
    if (from > to)
        from = new Date(to.getTime() - requestedDays * 24 * 60 * 60 * 1000);
    if (customFrom && !Number.isNaN(customFrom.getTime()))
        from.setHours(0, 0, 0, 0);
    const duration = Math.max(1, to.getTime() - from.getTime());
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - duration);
    const days = Math.max(1, Math.ceil(duration / (24 * 60 * 60 * 1000)));
    return { from, to, previousFrom, previousTo, days };
};
exports.resolveAnalyticsDateRange = resolveAnalyticsDateRange;
const getSummary = async (from, to, includeActive = false) => {
    var _a, _b;
    const sessionRange = { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter };
    const eventRange = { occurredAt: { $gte: from, $lte: to }, ...humanEventFilter };
    const [visitorIds, sessions, newVisitorIds, engagementRows, pageViews, conversions, convertedSessionIds, botSessions, errors, activeVisitorIds,] = await Promise.all([
        AnalyticsSession_1.default.distinct("visitorId", sessionRange),
        AnalyticsSession_1.default.countDocuments(sessionRange),
        AnalyticsSession_1.default.distinct("visitorId", { ...sessionRange, isNewVisitor: true }),
        AnalyticsSession_1.default.aggregate([
            { $match: sessionRange },
            {
                $group: {
                    _id: null,
                    totalEngagementMs: { $sum: "$engagementMs" },
                    engagedSessions: {
                        $sum: {
                            $cond: [
                                { $or: [{ $gte: ["$engagementMs", 10000] }, { $gte: ["$pageViewCount", 2] }] },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]),
        AnalyticsEvent_1.default.countDocuments({ ...eventRange, eventType: "page_view" }),
        AnalyticsEvent_1.default.countDocuments({ ...eventRange, eventType: "conversion" }),
        AnalyticsEvent_1.default.distinct("sessionId", { ...eventRange, eventType: "conversion" }),
        AnalyticsSession_1.default.countDocuments({ startedAt: { $gte: from, $lte: to }, isBot: true }),
        AnalyticsEvent_1.default.countDocuments({
            ...eventRange,
            eventType: { $in: ["error", "api_error", "not_found"] },
        }),
        includeActive
            ? AnalyticsSession_1.default.distinct("visitorId", {
                lastSeenAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
                ...humanSessionFilter,
            })
            : Promise.resolve([]),
    ]);
    const visitors = visitorIds.length;
    const newVisitors = newVisitorIds.length;
    const engagedSessions = Number(((_a = engagementRows[0]) === null || _a === void 0 ? void 0 : _a.engagedSessions) || 0);
    const totalEngagementMs = Number(((_b = engagementRows[0]) === null || _b === void 0 ? void 0 : _b.totalEngagementMs) || 0);
    return {
        visitors,
        sessions,
        pageViews,
        activeVisitors: activeVisitorIds.length,
        newVisitors,
        returningVisitors: Math.max(0, visitors - newVisitors),
        engagedSessions,
        engagementRate: percentage(engagedSessions, sessions),
        bounceRate: percentage(Math.max(0, sessions - engagedSessions), sessions),
        averageEngagementSeconds: sessions > 0 ? round(totalEngagementMs / sessions / 1000) : 0,
        conversions,
        convertedSessions: convertedSessionIds.length,
        conversionRate: percentage(convertedSessionIds.length, sessions),
        botSessions,
        errors,
    };
};
const getTimeline = async (from, to) => {
    const [sessionRows, eventRows] = await Promise.all([
        AnalyticsSession_1.default.aggregate([
            { $match: { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$startedAt", timezone: "UTC" } },
                    sessions: { $sum: 1 },
                    visitors: { $addToSet: "$visitorId" },
                    newVisitors: { $sum: { $cond: ["$isNewVisitor", 1, 0] } },
                },
            },
            { $sort: { _id: 1 } },
        ]),
        AnalyticsEvent_1.default.aggregate([
            { $match: { occurredAt: { $gte: from, $lte: to }, ...humanEventFilter } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt", timezone: "UTC" } },
                    pageViews: { $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] } },
                    conversions: { $sum: { $cond: [{ $eq: ["$eventType", "conversion"] }, 1, 0] } },
                    errors: {
                        $sum: {
                            $cond: [{ $in: ["$eventType", ["error", "api_error", "not_found"]] }, 1, 0],
                        },
                    },
                },
            },
            { $sort: { _id: 1 } },
        ]),
    ]);
    const rows = new Map();
    sessionRows.forEach((row) => {
        rows.set(row._id, {
            date: row._id,
            visitors: row.visitors.length,
            sessions: row.sessions,
            newVisitors: row.newVisitors,
            pageViews: 0,
            conversions: 0,
            errors: 0,
        });
    });
    eventRows.forEach((row) => {
        const current = rows.get(row._id) || {
            date: row._id,
            visitors: 0,
            sessions: 0,
            newVisitors: 0,
            pageViews: 0,
            conversions: 0,
            errors: 0,
        };
        rows.set(row._id, {
            ...current,
            pageViews: row.pageViews,
            conversions: row.conversions,
            errors: row.errors,
        });
    });
    const timeline = [];
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const lastDate = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    while (cursor <= lastDate) {
        const date = cursor.toISOString().slice(0, 10);
        timeline.push(rows.get(date) || {
            date,
            visitors: 0,
            sessions: 0,
            newVisitors: 0,
            pageViews: 0,
            conversions: 0,
            errors: 0,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return timeline;
};
const getBreakdown = async (field, from, to, limit = 12, extraMatch = {}) => {
    const rows = await AnalyticsSession_1.default.aggregate([
        { $match: { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter, ...extraMatch } },
        { $group: { _id: { $ifNull: [`$${field}`, "Unknown"] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
    ]);
    const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    return rows.map((row) => ({
        name: String(row._id || "Unknown"),
        count: Number(row.count || 0),
        percentage: percentage(Number(row.count || 0), total),
    }));
};
const getAudienceAndAcquisition = async (from, to) => {
    const [countries, regions, locales, markets, devices, browsers, operatingSystems, sources, mediums, campaigns, referrers] = await Promise.all([
        getBreakdown("country", from, to, 15),
        getBreakdown("region", from, to, 15),
        getBreakdown("locale", from, to, 10),
        getBreakdown("market", from, to, 10),
        getBreakdown("deviceType", from, to, 10),
        getBreakdown("browser", from, to, 10),
        getBreakdown("os", from, to, 10),
        getBreakdown("trafficSource", from, to, 15),
        getBreakdown("trafficMedium", from, to, 12),
        getBreakdown("campaign", from, to, 15, { campaign: { $nin: [null, ""] } }),
        getBreakdown("referrerHost", from, to, 15, { referrerHost: { $nin: [null, ""] } }),
    ]);
    return {
        audience: { countries, regions, locales, markets, devices, browsers, operatingSystems },
        acquisition: { sources, mediums, campaigns, referrers },
    };
};
const getContent = async (from, to) => {
    const [pageRows, engagementRows, exitRows, landingRows, scrollRows, sessionCount] = await Promise.all([
        AnalyticsEvent_1.default.aggregate([
            {
                $match: {
                    occurredAt: { $gte: from, $lte: to },
                    eventType: "page_view",
                    ...humanEventFilter,
                },
            },
            {
                $group: {
                    _id: "$path",
                    views: { $sum: 1 },
                    visitors: { $addToSet: "$visitorId" },
                    sessions: { $addToSet: "$sessionId" },
                },
            },
            { $sort: { views: -1 } },
            { $limit: 25 },
        ]),
        AnalyticsEvent_1.default.aggregate([
            {
                $match: {
                    occurredAt: { $gte: from, $lte: to },
                    eventType: "engagement",
                    "properties.durationMs": { $gt: 0 },
                    ...humanEventFilter,
                },
            },
            { $group: { _id: "$path", engagementMs: { $sum: "$properties.durationMs" } } },
        ]),
        AnalyticsSession_1.default.aggregate([
            { $match: { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter } },
            {
                $group: {
                    _id: "$exitPath",
                    exits: { $sum: 1 },
                    visitors: { $addToSet: "$visitorId" },
                },
            },
            { $sort: { exits: -1 } },
        ]),
        AnalyticsSession_1.default.aggregate([
            { $match: { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter } },
            {
                $group: {
                    _id: "$landingPath",
                    sessions: { $sum: 1 },
                    visitors: { $addToSet: "$visitorId" },
                },
            },
            { $sort: { sessions: -1 } },
            { $limit: 15 },
        ]),
        AnalyticsEvent_1.default.aggregate([
            {
                $match: {
                    occurredAt: { $gte: from, $lte: to },
                    eventType: "scroll",
                    eventName: "scroll_depth",
                    "properties.depth": { $in: [25, 50, 75, 90] },
                    ...humanEventFilter,
                },
            },
            {
                $group: {
                    _id: "$properties.depth",
                    events: { $sum: 1 },
                    sessions: { $addToSet: "$sessionId" },
                    visitors: { $addToSet: "$visitorId" },
                },
            },
            { $sort: { _id: 1 } },
        ]),
        AnalyticsSession_1.default.countDocuments({
            startedAt: { $gte: from, $lte: to },
            ...humanSessionFilter,
        }),
    ]);
    const engagement = new Map(engagementRows.map((row) => [row._id, Number(row.engagementMs || 0)]));
    const exits = new Map(exitRows.map((row) => [row._id, Number(row.exits || 0)]));
    const pages = pageRows.map((row) => ({
        path: row._id || "/",
        views: Number(row.views || 0),
        visitors: row.visitors.length,
        sessions: row.sessions.length,
        exits: exits.get(row._id) || 0,
        exitRate: percentage(exits.get(row._id) || 0, row.sessions.length),
        averageEngagementSeconds: row.sessions.length > 0 ? round((engagement.get(row._id) || 0) / row.sessions.length / 1000) : 0,
    }));
    return {
        pages,
        insights: {
            landingPages: landingRows.map((row) => ({
                path: row._id || "/",
                sessions: Number(row.sessions || 0),
                visitors: row.visitors.length,
                percentage: percentage(Number(row.sessions || 0), sessionCount),
            })),
            exitPages: exitRows.slice(0, 15).map((row) => ({
                path: row._id || "/",
                exits: Number(row.exits || 0),
                visitors: row.visitors.length,
                percentage: percentage(Number(row.exits || 0), sessionCount),
            })),
            scrollDepth: scrollRows.map((row) => ({
                depth: Number(row._id || 0),
                events: Number(row.events || 0),
                sessions: row.sessions.length,
                visitors: row.visitors.length,
                percentage: percentage(row.sessions.length, sessionCount),
            })),
        },
    };
};
const getConversions = async (from, to) => {
    const eventRange = { occurredAt: { $gte: from, $lte: to }, ...humanEventFilter };
    const [rows, formStarts, formAttempts, attributionRows, formRows] = await Promise.all([
        AnalyticsEvent_1.default.aggregate([
            { $match: { ...eventRange, eventType: "conversion" } },
            {
                $group: {
                    _id: { $ifNull: ["$properties.conversionType", "$eventName"] },
                    count: { $sum: 1 },
                    visitors: { $addToSet: "$visitorId" },
                    sessions: { $addToSet: "$sessionId" },
                },
            },
            { $sort: { count: -1 } },
        ]),
        AnalyticsEvent_1.default.countDocuments({ ...eventRange, eventType: "form", eventName: "form_start" }),
        AnalyticsEvent_1.default.countDocuments({
            ...eventRange,
            eventType: "form",
            eventName: "form_submit_attempt",
        }),
        AnalyticsSession_1.default.aggregate([
            { $match: { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter } },
            {
                $lookup: {
                    from: AnalyticsEvent_1.default.collection.name,
                    let: { currentSessionId: "$sessionId" },
                    pipeline: [
                        {
                            $match: {
                                eventType: "conversion",
                                occurredAt: { $gte: from, $lte: to },
                                ...humanEventFilter,
                                $expr: { $eq: ["$sessionId", "$$currentSessionId"] },
                            },
                        },
                        { $project: { _id: 1 } },
                    ],
                    as: "conversionEvents",
                },
            },
            { $set: { conversionCount: { $size: "$conversionEvents" } } },
            {
                $facet: {
                    sources: [
                        {
                            $group: {
                                _id: { $ifNull: ["$trafficSource", "direct"] },
                                sessions: { $sum: 1 },
                                visitors: { $addToSet: "$visitorId" },
                                convertedSessions: { $sum: { $cond: [{ $gt: ["$conversionCount", 0] }, 1, 0] } },
                                conversions: { $sum: "$conversionCount" },
                            },
                        },
                        { $sort: { convertedSessions: -1, sessions: -1 } },
                        { $limit: 12 },
                    ],
                    devices: [
                        {
                            $group: {
                                _id: { $ifNull: ["$deviceType", "unknown"] },
                                sessions: { $sum: 1 },
                                visitors: { $addToSet: "$visitorId" },
                                convertedSessions: { $sum: { $cond: [{ $gt: ["$conversionCount", 0] }, 1, 0] } },
                                conversions: { $sum: "$conversionCount" },
                            },
                        },
                        { $sort: { convertedSessions: -1, sessions: -1 } },
                        { $limit: 8 },
                    ],
                    countries: [
                        {
                            $group: {
                                _id: { $ifNull: ["$country", "unknown"] },
                                sessions: { $sum: 1 },
                                visitors: { $addToSet: "$visitorId" },
                                convertedSessions: { $sum: { $cond: [{ $gt: ["$conversionCount", 0] }, 1, 0] } },
                                conversions: { $sum: "$conversionCount" },
                            },
                        },
                        { $sort: { convertedSessions: -1, sessions: -1 } },
                        { $limit: 12 },
                    ],
                    landingPages: [
                        {
                            $group: {
                                _id: { $ifNull: ["$landingPath", "/"] },
                                sessions: { $sum: 1 },
                                visitors: { $addToSet: "$visitorId" },
                                convertedSessions: { $sum: { $cond: [{ $gt: ["$conversionCount", 0] }, 1, 0] } },
                                conversions: { $sum: "$conversionCount" },
                            },
                        },
                        { $sort: { convertedSessions: -1, sessions: -1 } },
                        { $limit: 12 },
                    ],
                },
            },
        ]),
        AnalyticsEvent_1.default.aggregate([
            {
                $match: {
                    ...eventRange,
                    eventType: "form",
                    eventName: { $in: ["form_start", "form_submit_attempt"] },
                    "properties.form": { $nin: [null, ""] },
                },
            },
            {
                $group: {
                    _id: { form: "$properties.form", eventName: "$eventName" },
                    events: { $sum: 1 },
                    sessions: { $addToSet: "$sessionId" },
                },
            },
            { $sort: { events: -1 } },
        ]),
    ]);
    const conversions = rows.map((row) => ({
        name: String(row._id || "other"),
        count: Number(row.count || 0),
        visitors: row.visitors.length,
        sessions: row.sessions.length,
    }));
    const mapAttribution = (attribution = []) => attribution.map((row) => ({
        name: String(row._id || "unknown"),
        sessions: Number(row.sessions || 0),
        visitors: row.visitors.length,
        convertedSessions: Number(row.convertedSessions || 0),
        conversions: Number(row.conversions || 0),
        conversionRate: percentage(Number(row.convertedSessions || 0), Number(row.sessions || 0)),
    }));
    const attribution = attributionRows[0] || {};
    const forms = new Map();
    formRows.forEach((row) => {
        var _a, _b;
        const form = String(((_a = row._id) === null || _a === void 0 ? void 0 : _a.form) || "unknown");
        const item = forms.get(form) || {
            form,
            startEvents: 0,
            attemptEvents: 0,
            startedSessions: 0,
            attemptedSessions: 0,
            attemptRate: 0,
        };
        if (((_b = row._id) === null || _b === void 0 ? void 0 : _b.eventName) === "form_start") {
            item.startEvents = Number(row.events || 0);
            item.startedSessions = row.sessions.length;
        }
        else {
            item.attemptEvents = Number(row.events || 0);
            item.attemptedSessions = row.sessions.length;
        }
        forms.set(form, item);
    });
    const formItems = Array.from(forms.values())
        .map((item) => ({
        ...item,
        attemptRate: percentage(item.attemptedSessions, item.startedSessions),
    }))
        .sort((left, right) => right.startedSessions - left.startedSessions);
    return {
        items: conversions,
        funnel: {
            formStarts,
            formSubmitAttempts: formAttempts,
            successfulConversions: conversions.reduce((sum, row) => sum + row.count, 0),
        },
        forms: formItems,
        attribution: {
            sources: mapAttribution(attribution.sources),
            devices: mapAttribution(attribution.devices),
            countries: mapAttribution(attribution.countries),
            landingPages: mapAttribution(attribution.landingPages),
        },
    };
};
const percentile = (values, target) => {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * target) - 1)];
};
const getPerformance = async (from, to) => {
    const events = await AnalyticsEvent_1.default.find({
        occurredAt: { $gte: from, $lte: to },
        eventType: "web_vital",
        ...humanEventFilter,
    })
        .select("properties.metricName properties.metricValue properties.metricRating device.type")
        .sort({ occurredAt: -1 })
        .limit(50000)
        .lean();
    const groups = new Map();
    events.forEach((event) => {
        var _a, _b, _c, _d;
        const metric = String(((_a = event.properties) === null || _a === void 0 ? void 0 : _a.metricName) || "Unknown").toUpperCase();
        const device = String(((_b = event.device) === null || _b === void 0 ? void 0 : _b.type) || "unknown");
        const value = Number((_c = event.properties) === null || _c === void 0 ? void 0 : _c.metricValue);
        if (!Number.isFinite(value))
            return;
        const key = `${metric}:${device}`;
        const group = groups.get(key) || { metric, device, values: [], ratings: [] };
        group.values.push(value);
        group.ratings.push(String(((_d = event.properties) === null || _d === void 0 ? void 0 : _d.metricRating) || "unknown"));
        groups.set(key, group);
    });
    const byDevice = Array.from(groups.values()).map((group) => ({
        metric: group.metric,
        device: group.device,
        samples: group.values.length,
        average: round(group.values.reduce((sum, value) => sum + value, 0) / group.values.length, 2),
        p75: round(percentile(group.values, 0.75), 2),
        good: group.ratings.filter((rating) => rating === "good").length,
        needsImprovement: group.ratings.filter((rating) => rating === "needs-improvement").length,
        poor: group.ratings.filter((rating) => rating === "poor").length,
    }));
    const overallGroups = new Map();
    Array.from(groups.values()).forEach((group) => {
        const current = overallGroups.get(group.metric) || { values: [], ratings: [] };
        current.values.push(...group.values);
        current.ratings.push(...group.ratings);
        overallGroups.set(group.metric, current);
    });
    const overall = Array.from(overallGroups.entries()).map(([metric, group]) => ({
        metric,
        samples: group.values.length,
        average: round(group.values.reduce((sum, value) => sum + value, 0) / group.values.length, 2),
        p75: round(percentile(group.values, 0.75), 2),
        good: group.ratings.filter((rating) => rating === "good").length,
        needsImprovement: group.ratings.filter((rating) => rating === "needs-improvement").length,
        poor: group.ratings.filter((rating) => rating === "poor").length,
    }));
    return { overall, byDevice, sampleLimitReached: events.length === 50000 };
};
const getServerBucketRange = (from, to) => {
    const bucketFrom = new Date(from);
    const startsInsideBucket = bucketFrom.getUTCMinutes() !== 0 ||
        bucketFrom.getUTCSeconds() !== 0 ||
        bucketFrom.getUTCMilliseconds() !== 0;
    bucketFrom.setUTCMinutes(0, 0, 0);
    if (startsInsideBucket)
        bucketFrom.setUTCHours(bucketFrom.getUTCHours() + 1);
    const bucketTo = new Date(to);
    bucketTo.setUTCMinutes(0, 0, 0);
    return { bucketFrom, bucketTo };
};
const getServerMetricTotals = async (from, to) => {
    var _a, _b, _c, _d, _e;
    const { bucketFrom, bucketTo } = getServerBucketRange(from, to);
    const rows = await AnalyticsServerMetric_1.default.aggregate([
        { $match: { bucketStart: { $gte: bucketFrom, $lte: bucketTo } } },
        {
            $group: {
                _id: null,
                serverErrors: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ["$metricType", "api_request"] }, { $gte: ["$statusCode", 500] }] },
                            "$count",
                            0,
                        ],
                    },
                },
                authDenied: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ["$metricType", "auth_attempt"] }, { $eq: ["$outcome", "denied"] }] },
                            "$count",
                            0,
                        ],
                    },
                },
                formFailures: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ["$metricType", "form_submission"] }, { $eq: ["$outcome", "failed"] }] },
                            "$count",
                            0,
                        ],
                    },
                },
                spamBlocked: {
                    $sum: { $cond: [{ $eq: ["$metricType", "spam_blocked"] }, "$count", 0] },
                },
                botRequests: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ["$metricType", "api_request"] }, { $eq: ["$isBot", true] }] },
                            "$count",
                            0,
                        ],
                    },
                },
            },
        },
    ]);
    return {
        serverErrors: Number(((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.serverErrors) || 0),
        authDenied: Number(((_b = rows[0]) === null || _b === void 0 ? void 0 : _b.authDenied) || 0),
        formFailures: Number(((_c = rows[0]) === null || _c === void 0 ? void 0 : _c.formFailures) || 0),
        spamBlocked: Number(((_d = rows[0]) === null || _d === void 0 ? void 0 : _d.spamBlocked) || 0),
        botRequests: Number(((_e = rows[0]) === null || _e === void 0 ? void 0 : _e.botRequests) || 0),
    };
};
const getServerHealth = async (from, to, previousFrom, previousTo) => {
    const { bucketFrom, bucketTo } = getServerBucketRange(from, to);
    const metricRange = { bucketStart: { $gte: bucketFrom, $lte: bucketTo } };
    const [apiRows, statusRows, failingRouteRows, authRows, formRows, spamRows, botRows, timelineRows, currentTotals, previousTotals, lastMetric,] = await Promise.all([
        AnalyticsServerMetric_1.default.aggregate([
            { $match: { ...metricRange, metricType: "api_request" } },
            {
                $group: {
                    _id: null,
                    requests: { $sum: "$count" },
                    durationTotalMs: { $sum: "$durationTotalMs" },
                    durationMaxMs: { $max: "$durationMaxMs" },
                    successfulResponses: {
                        $sum: { $cond: [{ $and: [{ $gte: ["$statusCode", 200] }, { $lt: ["$statusCode", 400] }] }, "$count", 0] },
                    },
                    clientErrors: {
                        $sum: { $cond: [{ $and: [{ $gte: ["$statusCode", 400] }, { $lt: ["$statusCode", 500] }] }, "$count", 0] },
                    },
                    serverErrors: { $sum: { $cond: [{ $gte: ["$statusCode", 500] }, "$count", 0] } },
                    notFoundResponses: { $sum: { $cond: [{ $eq: ["$statusCode", 404] }, "$count", 0] } },
                    botRequests: { $sum: { $cond: ["$isBot", "$count", 0] } },
                },
            },
        ]),
        AnalyticsServerMetric_1.default.aggregate([
            { $match: { ...metricRange, metricType: "api_request" } },
            { $group: { _id: "$statusCode", count: { $sum: "$count" } } },
            { $sort: { count: -1 } },
        ]),
        AnalyticsServerMetric_1.default.aggregate([
            { $match: { ...metricRange, metricType: "api_request", statusCode: { $gte: 400 } } },
            { $group: { _id: { route: "$route", statusCode: "$statusCode" }, count: { $sum: "$count" } } },
            { $sort: { count: -1 } },
            { $limit: 15 },
        ]),
        AnalyticsServerMetric_1.default.aggregate([
            { $match: { ...metricRange, metricType: "auth_attempt" } },
            { $group: { _id: { outcome: "$outcome", isBot: "$isBot" }, count: { $sum: "$count" } } },
        ]),
        AnalyticsServerMetric_1.default.aggregate([
            { $match: { ...metricRange, metricType: "form_submission" } },
            { $group: { _id: { category: "$category", outcome: "$outcome" }, count: { $sum: "$count" } } },
            { $sort: { count: -1 } },
        ]),
        AnalyticsServerMetric_1.default.aggregate([
            { $match: { ...metricRange, metricType: "spam_blocked" } },
            { $group: { _id: "$category", count: { $sum: "$count" } } },
            { $sort: { count: -1 } },
        ]),
        AnalyticsServerMetric_1.default.aggregate([
            { $match: { ...metricRange, metricType: "api_request", isBot: true } },
            { $group: { _id: "$botName", count: { $sum: "$count" } } },
            { $sort: { count: -1 } },
            { $limit: 15 },
        ]),
        AnalyticsServerMetric_1.default.aggregate([
            { $match: metricRange },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$bucketStart", timezone: "UTC" } },
                    requests: { $sum: { $cond: [{ $eq: ["$metricType", "api_request"] }, "$count", 0] } },
                    serverErrors: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ["$metricType", "api_request"] }, { $gte: ["$statusCode", 500] }] },
                                "$count",
                                0,
                            ],
                        },
                    },
                    notFound: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ["$metricType", "api_request"] }, { $eq: ["$statusCode", 404] }] },
                                "$count",
                                0,
                            ],
                        },
                    },
                    authDenied: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ["$metricType", "auth_attempt"] }, { $eq: ["$outcome", "denied"] }] },
                                "$count",
                                0,
                            ],
                        },
                    },
                    formFailures: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ["$metricType", "form_submission"] }, { $eq: ["$outcome", "failed"] }] },
                                "$count",
                                0,
                            ],
                        },
                    },
                    spamBlocked: { $sum: { $cond: [{ $eq: ["$metricType", "spam_blocked"] }, "$count", 0] } },
                    botRequests: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ["$metricType", "api_request"] }, { $eq: ["$isBot", true] }] },
                                "$count",
                                0,
                            ],
                        },
                    },
                },
            },
            { $sort: { _id: 1 } },
        ]),
        getServerMetricTotals(from, to),
        getServerMetricTotals(previousFrom, previousTo),
        AnalyticsServerMetric_1.default.findOne().sort({ lastOccurredAt: -1 }).select("lastOccurredAt").lean(),
    ]);
    const api = apiRows[0] || {};
    const requests = Number(api.requests || 0);
    const authSuccessful = authRows
        .filter((row) => row._id.outcome === "success")
        .reduce((sum, row) => sum + Number(row.count || 0), 0);
    const authDenied = authRows
        .filter((row) => row._id.outcome === "denied")
        .reduce((sum, row) => sum + Number(row.count || 0), 0);
    const authBotAttempts = authRows
        .filter((row) => row._id.isBot)
        .reduce((sum, row) => sum + Number(row.count || 0), 0);
    const formItems = new Map();
    formRows.forEach((row) => {
        const type = String(row._id.category || "other");
        const current = formItems.get(type) || { type, attempts: 0, successful: 0, failed: 0 };
        const count = Number(row.count || 0);
        current.attempts += count;
        if (row._id.outcome === "success")
            current.successful += count;
        if (row._id.outcome === "failed")
            current.failed += count;
        formItems.set(type, current);
    });
    return {
        api: {
            requests,
            successfulResponses: Number(api.successfulResponses || 0),
            clientErrors: Number(api.clientErrors || 0),
            serverErrors: Number(api.serverErrors || 0),
            notFoundResponses: Number(api.notFoundResponses || 0),
            botRequests: Number(api.botRequests || 0),
            observedAvailability: requests > 0
                ? round(((requests - Number(api.serverErrors || 0)) / requests) * 100, 2)
                : 0,
            averageResponseMs: requests > 0 ? round(Number(api.durationTotalMs || 0) / requests) : 0,
            maximumResponseMs: round(Number(api.durationMaxMs || 0)),
            statuses: statusRows.map((row) => ({ status: Number(row._id || 0), count: Number(row.count || 0) })),
            failingRoutes: failingRouteRows.map((row) => ({
                route: String(row._id.route || "unknown"),
                status: Number(row._id.statusCode || 0),
                count: Number(row.count || 0),
            })),
        },
        auth: {
            attempts: authSuccessful + authDenied,
            successful: authSuccessful,
            denied: authDenied,
            botAttempts: authBotAttempts,
        },
        forms: {
            attempts: Array.from(formItems.values()).reduce((sum, item) => sum + item.attempts, 0),
            successful: Array.from(formItems.values()).reduce((sum, item) => sum + item.successful, 0),
            failed: Array.from(formItems.values()).reduce((sum, item) => sum + item.failed, 0),
            byType: Array.from(formItems.values()),
        },
        spam: {
            blocked: spamRows.reduce((sum, row) => sum + Number(row.count || 0), 0),
            byRule: spamRows.map((row) => ({ name: String(row._id || "other"), count: Number(row.count || 0) })),
        },
        bots: botRows.map((row) => ({ name: String(row._id || "unknown"), count: Number(row.count || 0) })),
        timeline: timelineRows.map((row) => ({
            date: row._id,
            requests: Number(row.requests || 0),
            serverErrors: Number(row.serverErrors || 0),
            notFound: Number(row.notFound || 0),
            authDenied: Number(row.authDenied || 0),
            formFailures: Number(row.formFailures || 0),
            spamBlocked: Number(row.spamBlocked || 0),
            botRequests: Number(row.botRequests || 0),
        })),
        comparison: Object.fromEntries(Object.entries(currentTotals).map(([key, value]) => [
            key,
            changePercentage(Number(value || 0), Number(previousTotals[key] || 0)),
        ])),
        lastMetricAt: (lastMetric === null || lastMetric === void 0 ? void 0 : lastMetric.lastOccurredAt) || null,
    };
};
const getHealth = async (from, to, previousFrom, previousTo) => {
    const eventRange = { occurredAt: { $gte: from, $lte: to }, ...humanEventFilter };
    const [errorRows, statusRows, botRows, lastEvent, server, incidents] = await Promise.all([
        AnalyticsEvent_1.default.aggregate([
            { $match: { ...eventRange, eventType: { $in: ["error", "api_error", "not_found"] } } },
            { $group: { _id: "$eventName", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]),
        AnalyticsEvent_1.default.aggregate([
            { $match: { ...eventRange, eventType: "api_error" } },
            { $group: { _id: { $ifNull: ["$properties.statusCode", 0] }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]),
        AnalyticsSession_1.default.aggregate([
            { $match: { startedAt: { $gte: from, $lte: to }, isBot: true } },
            { $group: { _id: { $ifNull: ["$botName", "unknown"] }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 15 },
        ]),
        AnalyticsEvent_1.default.findOne().sort({ receivedAt: -1 }).select("receivedAt eventName").lean(),
        getServerHealth(from, to, previousFrom, previousTo),
        (0, analyticsAnomalyService_1.evaluateAnalyticsAnomalies)(),
    ]);
    return {
        errorsByType: errorRows.map((row) => ({ name: row._id, count: Number(row.count || 0) })),
        apiErrorsByStatus: statusRows.map((row) => ({ status: Number(row._id || 0), count: Number(row.count || 0) })),
        bots: botRows.map((row) => ({ name: row._id, count: Number(row.count || 0) })),
        lastEventAt: (lastEvent === null || lastEvent === void 0 ? void 0 : lastEvent.receivedAt) || null,
        server,
        incidents,
    };
};
const buildAnalyticsOverview = async (range) => {
    const [summary, previousSummary, timeline, audienceAcquisition, content, conversions, performance, health, seo] = await Promise.all([
        getSummary(range.from, range.to, true),
        getSummary(range.previousFrom, range.previousTo),
        getTimeline(range.from, range.to),
        getAudienceAndAcquisition(range.from, range.to),
        getContent(range.from, range.to),
        getConversions(range.from, range.to),
        getPerformance(range.from, range.to),
        getHealth(range.from, range.to, range.previousFrom, range.previousTo),
        (0, searchConsoleService_1.getSearchConsoleReport)(range.from, range.to),
    ]);
    const comparison = Object.fromEntries(Object.entries(summary)
        .filter(([key]) => key !== "activeVisitors")
        .map(([key, value]) => [
        key,
        changePercentage(Number(value || 0), Number(previousSummary[key] || 0)),
    ]));
    return {
        range: {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            previousFrom: range.previousFrom.toISOString(),
            previousTo: range.previousTo.toISOString(),
            days: range.days,
        },
        summary,
        comparison,
        timeline,
        ...audienceAcquisition,
        content: content.pages,
        contentInsights: content.insights,
        conversions,
        performance,
        health,
        seo,
    };
};
exports.buildAnalyticsOverview = buildAnalyticsOverview;
const getRealtimeAnalytics = async () => {
    var _a, _b;
    const generatedAt = new Date();
    const windowMinutes = 5;
    const activeSince = new Date(generatedAt.getTime() - windowMinutes * 60000);
    const [result] = await AnalyticsSession_1.default.aggregate([
        {
            $match: {
                lastSeenAt: { $gte: activeSince, $lte: generatedAt },
                ...humanSessionFilter,
            },
        },
        {
            $facet: {
                summary: [
                    {
                        $group: {
                            _id: null,
                            visitors: { $addToSet: "$visitorId" },
                            sessions: { $sum: 1 },
                            newVisitors: {
                                $addToSet: { $cond: ["$isNewVisitor", "$visitorId", null] },
                            },
                            lastActivityAt: { $max: "$lastSeenAt" },
                        },
                    },
                ],
                pages: [
                    {
                        $group: {
                            _id: { $ifNull: ["$exitPath", "/"] },
                            sessions: { $sum: 1 },
                            visitors: { $addToSet: "$visitorId" },
                        },
                    },
                    { $sort: { sessions: -1 } },
                    { $limit: 10 },
                ],
                countries: [
                    {
                        $group: {
                            _id: { $ifNull: ["$country", "unknown"] },
                            sessions: { $sum: 1 },
                            visitors: { $addToSet: "$visitorId" },
                        },
                    },
                    { $sort: { sessions: -1 } },
                    { $limit: 10 },
                ],
                devices: [
                    {
                        $group: {
                            _id: { $ifNull: ["$deviceType", "unknown"] },
                            sessions: { $sum: 1 },
                            visitors: { $addToSet: "$visitorId" },
                        },
                    },
                    { $sort: { sessions: -1 } },
                    { $limit: 6 },
                ],
                sources: [
                    {
                        $group: {
                            _id: { $ifNull: ["$trafficSource", "direct"] },
                            sessions: { $sum: 1 },
                            visitors: { $addToSet: "$visitorId" },
                        },
                    },
                    { $sort: { sessions: -1 } },
                    { $limit: 10 },
                ],
            },
        },
    ]);
    const summary = ((_a = result === null || result === void 0 ? void 0 : result.summary) === null || _a === void 0 ? void 0 : _a[0]) || {};
    const mapBreakdown = (rows = []) => rows.map((row) => ({
        name: String(row._id || "unknown"),
        sessions: Number(row.sessions || 0),
        visitors: row.visitors.length,
    }));
    return {
        generatedAt,
        activeSince,
        windowMinutes,
        activeVisitors: ((_b = summary.visitors) === null || _b === void 0 ? void 0 : _b.length) || 0,
        activeSessions: Number(summary.sessions || 0),
        newVisitors: Array.isArray(summary.newVisitors)
            ? summary.newVisitors.filter(Boolean).length
            : 0,
        lastActivityAt: summary.lastActivityAt || null,
        pages: mapBreakdown(result === null || result === void 0 ? void 0 : result.pages),
        countries: mapBreakdown(result === null || result === void 0 ? void 0 : result.countries),
        devices: mapBreakdown(result === null || result === void 0 ? void 0 : result.devices),
        sources: mapBreakdown(result === null || result === void 0 ? void 0 : result.sources),
    };
};
exports.getRealtimeAnalytics = getRealtimeAnalytics;
