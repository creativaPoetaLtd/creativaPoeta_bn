"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsCollectionHealth = exports.collectAnalyticsEvents = void 0;
const AnalyticsEvent_1 = __importDefault(require("../models/AnalyticsEvent"));
const AnalyticsSession_1 = __importDefault(require("../models/AnalyticsSession"));
const AnalyticsVisitor_1 = __importDefault(require("../models/AnalyticsVisitor"));
const MAX_EVENTS_PER_REQUEST = 20;
const MAX_REQUESTS_PER_MINUTE = 120;
const allowedEventTypes = new Set([
    "page_view",
    "engagement",
    "scroll",
    "click",
    "form",
    "conversion",
    "web_vital",
    "error",
    "api_error",
    "not_found",
]);
const defaultAllowedOrigins = [
    "https://creativapoeta.com",
    "https://www.creativapoeta.com",
    "https://be.creativapoeta.com",
    "https://fr.creativapoeta.com",
    "https://rw.creativapoeta.com",
    "https://nl.creativapoeta.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
];
const allowedOrigins = new Set((process.env.ANALYTICS_ALLOWED_ORIGINS || defaultAllowedOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean));
const requestsByClient = new Map();
const consumeCollectionRateLimit = (clientKey) => {
    const now = Date.now();
    const current = requestsByClient.get(clientKey);
    if (!current || current.resetAt <= now) {
        requestsByClient.set(clientKey, { count: 1, resetAt: now + 60000 });
        return true;
    }
    if (current.count >= MAX_REQUESTS_PER_MINUTE)
        return false;
    current.count += 1;
    if (requestsByClient.size > 5000) {
        for (const [key, value] of requestsByClient.entries()) {
            if (value.resetAt <= now)
                requestsByClient.delete(key);
        }
    }
    return true;
};
const safeText = (value, maxLength) => typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
const redactSensitiveText = (value, maxLength) => safeText(value, maxLength)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[phone]")
    .replace(/([?&](?:token|key|secret|password|email)=)[^&#\s]+/gi, "$1[redacted]");
const safeNumber = (value, min, max) => {
    const number = Number(value);
    if (!Number.isFinite(number))
        return undefined;
    return Math.min(max, Math.max(min, number));
};
const safeId = (value) => {
    const id = safeText(value, 80);
    return /^[a-zA-Z0-9_-]{12,80}$/.test(id) ? id : "";
};
const safePath = (value) => {
    const path = safeText(value, 1000);
    if (!path)
        return "/";
    try {
        const parsed = new URL(path, "https://creativapoeta.com");
        return `${parsed.pathname || "/"}`.slice(0, 500);
    }
    catch {
        return path.startsWith("/") ? path.slice(0, 500) : "/";
    }
};
const safeTarget = (value) => {
    const target = safeText(value, 1000);
    if (!target)
        return undefined;
    try {
        const parsed = new URL(target, "https://creativapoeta.com");
        const host = parsed.hostname === "creativapoeta.com" ? "" : parsed.hostname;
        return `${host}${parsed.pathname || "/"}`.slice(0, 300);
    }
    catch {
        return target.split(/[?#]/)[0].slice(0, 300);
    }
};
const decodeHeader = (value, maxLength) => {
    if (!value)
        return undefined;
    try {
        return safeText(decodeURIComponent(value), maxLength) || undefined;
    }
    catch {
        return safeText(value, maxLength) || undefined;
    }
};
const getRequestGeo = (req) => ({
    continent: safeText(req.get("x-vercel-ip-continent"), 4).toUpperCase() || undefined,
    country: safeText(req.get("x-vercel-ip-country"), 4).toUpperCase() || undefined,
    region: safeText(req.get("x-vercel-ip-country-region"), 12).toUpperCase() || undefined,
    city: decodeHeader(req.get("x-vercel-ip-city"), 120),
});
const getBotInfo = (req) => {
    var _a;
    const userAgent = safeText(req.get("user-agent"), 500).toLowerCase();
    const knownBot = (_a = userAgent.match(/(googlebot|bingbot|yandexbot|baiduspider|duckduckbot|facebookexternalhit|linkedinbot|twitterbot|slurp|semrushbot|ahrefsbot|mj12bot|crawler|spider|bot)/)) === null || _a === void 0 ? void 0 : _a[1];
    return {
        isBot: Boolean(knownBot),
        botName: knownBot ? safeText(knownBot, 40) : undefined,
    };
};
const getClientKey = (req) => safeText(req.get("x-vercel-forwarded-for") || req.get("x-forwarded-for") || req.ip || "unknown", 120)
    .split(",")[0]
    .trim();
const isAllowedOrigin = (req) => {
    const origin = safeText(req.get("origin"), 300).replace(/\/$/, "");
    return !origin || allowedOrigins.has(origin);
};
const normalizeOccurredAt = (value) => {
    const date = new Date(typeof value === "string" || typeof value === "number" ? value : Date.now());
    const now = Date.now();
    if (Number.isNaN(date.getTime()) ||
        date.getTime() < now - 24 * 60 * 60 * 1000 ||
        date.getTime() > now + 5 * 60 * 1000) {
        return new Date(now);
    }
    return date;
};
const normalizeProperties = (value) => ({
    label: redactSensitiveText(value === null || value === void 0 ? void 0 : value.label, 120) || undefined,
    target: safeTarget(value === null || value === void 0 ? void 0 : value.target),
    form: redactSensitiveText(value === null || value === void 0 ? void 0 : value.form, 120) || undefined,
    conversionType: redactSensitiveText(value === null || value === void 0 ? void 0 : value.conversionType, 80) || undefined,
    depth: safeNumber(value === null || value === void 0 ? void 0 : value.depth, 0, 100),
    durationMs: safeNumber(value === null || value === void 0 ? void 0 : value.durationMs, 0, 86400000),
    value: safeNumber(value === null || value === void 0 ? void 0 : value.value, -1000000000, 1000000000),
    metricName: safeText(value === null || value === void 0 ? void 0 : value.metricName, 20).toUpperCase() || undefined,
    metricValue: safeNumber(value === null || value === void 0 ? void 0 : value.metricValue, 0, 86400000),
    metricDelta: safeNumber(value === null || value === void 0 ? void 0 : value.metricDelta, 0, 86400000),
    metricRating: safeText(value === null || value === void 0 ? void 0 : value.metricRating, 24) || undefined,
    metricId: safeText(value === null || value === void 0 ? void 0 : value.metricId, 120) || undefined,
    errorMessage: redactSensitiveText(value === null || value === void 0 ? void 0 : value.errorMessage, 300) || undefined,
    errorSource: safeTarget(value === null || value === void 0 ? void 0 : value.errorSource),
    line: safeNumber(value === null || value === void 0 ? void 0 : value.line, 0, 10000000),
    column: safeNumber(value === null || value === void 0 ? void 0 : value.column, 0, 10000000),
    statusCode: safeNumber(value === null || value === void 0 ? void 0 : value.statusCode, 0, 999),
    endpoint: safeTarget(value === null || value === void 0 ? void 0 : value.endpoint),
});
const normalizeEvent = (raw, visitorId, sessionId, geo, bot) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const eventId = safeId(raw === null || raw === void 0 ? void 0 : raw.eventId);
    const eventType = safeText(raw === null || raw === void 0 ? void 0 : raw.eventType, 30);
    const eventName = redactSensitiveText(raw === null || raw === void 0 ? void 0 : raw.eventName, 80);
    if (!eventId || !allowedEventTypes.has(eventType) || !eventName)
        return null;
    return {
        eventId,
        visitorId,
        sessionId,
        eventType,
        eventName,
        occurredAt: normalizeOccurredAt(raw === null || raw === void 0 ? void 0 : raw.occurredAt),
        receivedAt: new Date(),
        path: safePath(raw === null || raw === void 0 ? void 0 : raw.path),
        pageTitle: redactSensitiveText(raw === null || raw === void 0 ? void 0 : raw.pageTitle, 200) || undefined,
        locale: safeText(raw === null || raw === void 0 ? void 0 : raw.locale, 12) || undefined,
        market: safeText(raw === null || raw === void 0 ? void 0 : raw.market, 24) || undefined,
        referrerHost: safeText(raw === null || raw === void 0 ? void 0 : raw.referrerHost, 255).toLowerCase() || undefined,
        trafficSource: redactSensitiveText(raw === null || raw === void 0 ? void 0 : raw.trafficSource, 120).toLowerCase() || undefined,
        trafficMedium: redactSensitiveText(raw === null || raw === void 0 ? void 0 : raw.trafficMedium, 80).toLowerCase() || undefined,
        utm: {
            source: redactSensitiveText((_a = raw === null || raw === void 0 ? void 0 : raw.utm) === null || _a === void 0 ? void 0 : _a.source, 120).toLowerCase() || undefined,
            medium: redactSensitiveText((_b = raw === null || raw === void 0 ? void 0 : raw.utm) === null || _b === void 0 ? void 0 : _b.medium, 80).toLowerCase() || undefined,
            campaign: redactSensitiveText((_c = raw === null || raw === void 0 ? void 0 : raw.utm) === null || _c === void 0 ? void 0 : _c.campaign, 160) || undefined,
            content: redactSensitiveText((_d = raw === null || raw === void 0 ? void 0 : raw.utm) === null || _d === void 0 ? void 0 : _d.content, 160) || undefined,
            term: redactSensitiveText((_e = raw === null || raw === void 0 ? void 0 : raw.utm) === null || _e === void 0 ? void 0 : _e.term, 160) || undefined,
        },
        device: {
            type: safeText((_f = raw === null || raw === void 0 ? void 0 : raw.device) === null || _f === void 0 ? void 0 : _f.type, 24).toLowerCase() || undefined,
            browser: safeText((_g = raw === null || raw === void 0 ? void 0 : raw.device) === null || _g === void 0 ? void 0 : _g.browser, 40) || undefined,
            os: safeText((_h = raw === null || raw === void 0 ? void 0 : raw.device) === null || _h === void 0 ? void 0 : _h.os, 40) || undefined,
            viewportWidth: safeNumber((_j = raw === null || raw === void 0 ? void 0 : raw.device) === null || _j === void 0 ? void 0 : _j.viewportWidth, 0, 20000),
            viewportHeight: safeNumber((_k = raw === null || raw === void 0 ? void 0 : raw.device) === null || _k === void 0 ? void 0 : _k.viewportHeight, 0, 20000),
            isBot: bot.isBot,
            botName: bot.botName,
        },
        geo,
        properties: normalizeProperties(raw === null || raw === void 0 ? void 0 : raw.properties),
    };
};
const collectAnalyticsEvents = async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        if (!isAllowedOrigin(req)) {
            res.status(403).json({ message: "Analytics origin is not allowed." });
            return;
        }
        if (!consumeCollectionRateLimit(getClientKey(req))) {
            res.status(429).json({ message: "Too many analytics requests." });
            return;
        }
        if (((_a = req.body) === null || _a === void 0 ? void 0 : _a.consent) !== true) {
            res.status(400).json({ message: "Analytics consent is required." });
            return;
        }
        const visitorId = safeId((_b = req.body) === null || _b === void 0 ? void 0 : _b.visitorId);
        const sessionId = safeId((_c = req.body) === null || _c === void 0 ? void 0 : _c.sessionId);
        const rawEvents = Array.isArray((_d = req.body) === null || _d === void 0 ? void 0 : _d.events)
            ? req.body.events.slice(0, MAX_EVENTS_PER_REQUEST)
            : [];
        if (!visitorId || !sessionId || rawEvents.length === 0) {
            res.status(400).json({ message: "A valid analytics batch is required." });
            return;
        }
        const geo = getRequestGeo(req);
        const bot = getBotInfo(req);
        const normalizedEvents = rawEvents
            .map((event) => normalizeEvent(event, visitorId, sessionId, geo, bot))
            .filter(Boolean);
        if (normalizedEvents.length === 0) {
            res.status(400).json({ message: "No valid analytics event was provided." });
            return;
        }
        const existingIds = new Set((await AnalyticsEvent_1.default.find({
            eventId: { $in: normalizedEvents.map((event) => event.eventId) },
        })
            .select("eventId")
            .lean()).map((event) => event.eventId));
        const freshEvents = normalizedEvents.filter((event) => !existingIds.has(event.eventId));
        if (freshEvents.length === 0) {
            res.status(202).json({ accepted: 0, duplicates: normalizedEvents.length });
            return;
        }
        const [existingVisitor, existingSession] = await Promise.all([
            AnalyticsVisitor_1.default.exists({ visitorId }),
            AnalyticsSession_1.default.exists({ sessionId }),
        ]);
        const bulkResult = await AnalyticsEvent_1.default.bulkWrite(freshEvents.map((event) => ({
            updateOne: {
                filter: { eventId: event.eventId },
                update: { $setOnInsert: event },
                upsert: true,
            },
        })), { ordered: false });
        const accepted = bulkResult.upsertedCount;
        const acceptedIndexes = new Set(Object.keys(bulkResult.upsertedIds || {}).map((index) => Number(index)));
        const acceptedEvents = freshEvents.filter((_event, index) => acceptedIndexes.has(index));
        if (acceptedEvents.length === 0) {
            res.status(202).json({ accepted: 0, duplicates: normalizedEvents.length });
            return;
        }
        const firstEvent = acceptedEvents[0];
        const lastEvent = acceptedEvents[acceptedEvents.length - 1];
        const lastSeenAt = acceptedEvents.reduce((latest, event) => (event.occurredAt > latest ? event.occurredAt : latest), firstEvent.occurredAt);
        const pageViewCount = acceptedEvents.filter((event) => event.eventType === "page_view").length;
        const engagementMs = acceptedEvents.reduce((total, event) => total + (event.eventType === "engagement" ? Number(event.properties.durationMs || 0) : 0), 0);
        await Promise.all([
            AnalyticsVisitor_1.default.updateOne({ visitorId }, {
                $setOnInsert: {
                    visitorId,
                    firstSeenAt: firstEvent.occurredAt,
                    firstLocale: firstEvent.locale,
                    firstMarket: firstEvent.market,
                    firstCountry: geo.country,
                },
                $set: {
                    lastSeenAt,
                    lastLocale: lastEvent.locale,
                    lastMarket: lastEvent.market,
                    lastCountry: geo.country,
                },
                $inc: {
                    sessionCount: existingSession ? 0 : 1,
                    pageViewCount,
                    eventCount: accepted,
                },
            }, { upsert: true }),
            AnalyticsSession_1.default.updateOne({ sessionId }, {
                $setOnInsert: {
                    sessionId,
                    visitorId,
                    startedAt: firstEvent.occurredAt,
                    landingPath: firstEvent.path,
                    referrerHost: firstEvent.referrerHost,
                    trafficSource: firstEvent.trafficSource,
                    trafficMedium: firstEvent.trafficMedium,
                    campaign: (_e = firstEvent.utm) === null || _e === void 0 ? void 0 : _e.campaign,
                    country: geo.country,
                    region: geo.region,
                    city: geo.city,
                    deviceType: (_f = firstEvent.device) === null || _f === void 0 ? void 0 : _f.type,
                    browser: (_g = firstEvent.device) === null || _g === void 0 ? void 0 : _g.browser,
                    os: (_h = firstEvent.device) === null || _h === void 0 ? void 0 : _h.os,
                    isBot: bot.isBot,
                    botName: bot.botName,
                    isNewVisitor: !existingVisitor,
                },
                $set: {
                    lastSeenAt,
                    exitPath: lastEvent.path,
                    locale: lastEvent.locale,
                    market: lastEvent.market,
                },
                $inc: {
                    pageViewCount,
                    eventCount: accepted,
                    engagementMs,
                },
            }, { upsert: true }),
        ]);
        res.status(202).json({
            accepted,
            duplicates: normalizedEvents.length - accepted,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.collectAnalyticsEvents = collectAnalyticsEvents;
const getAnalyticsCollectionHealth = async (_req, res, next) => {
    try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [latestEvent, eventsLast24h, sessionsLast24h, visitorsLast24h] = await Promise.all([
            AnalyticsEvent_1.default.findOne().sort({ receivedAt: -1 }).select("receivedAt eventType eventName path").lean(),
            AnalyticsEvent_1.default.countDocuments({ receivedAt: { $gte: since } }),
            AnalyticsSession_1.default.countDocuments({ lastSeenAt: { $gte: since } }),
            AnalyticsVisitor_1.default.countDocuments({ lastSeenAt: { $gte: since } }),
        ]);
        res.status(200).json({
            enabled: true,
            retentionDays: Number.isFinite(Number(process.env.ANALYTICS_RETENTION_DAYS || 395))
                ? Math.max(30, Number(process.env.ANALYTICS_RETENTION_DAYS || 395))
                : 395,
            eventsLast24h,
            sessionsLast24h,
            visitorsLast24h,
            latestEvent,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getAnalyticsCollectionHealth = getAnalyticsCollectionHealth;
