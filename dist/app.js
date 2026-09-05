"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = __importDefault(require("./routes"));
const errorHandler_1 = __importDefault(require("./middleware/errorHandler"));
const analyticsServerMiddleware_1 = require("./middleware/analyticsServerMiddleware");
const auditContext_1 = require("./middleware/auditContext");
require("./models/AuditEvent");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(auditContext_1.auditContextMiddleware);
const configuredOrigins = String(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
const allowedOrigins = new Set([
    "https://creativapoeta.com", "https://www.creativapoeta.com",
    "https://creativapoeta.be", "https://www.creativapoeta.be",
    "https://be.creativapoeta.com", "https://fr.creativapoeta.com",
    "https://nl.creativapoeta.com", "https://rw.creativapoeta.com",
    ...configuredOrigins,
]);
const isDevelopmentOrigin = (origin) => process.env.NODE_ENV !== "production"
    && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin.replace(/\/$/, "")) || isDevelopmentOrigin(origin))
            return callback(null, true);
        return callback(new Error("Origin is not allowed by CORS."));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept", "X-Cron-Token", "X-Requested-With"],
    credentials: false,
    maxAge: 86400,
}));
app.use(analyticsServerMiddleware_1.analyticsServerMiddleware);
app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
});
app.use(express_1.default.json({
    limit: "256kb",
    strict: true,
    verify: (req, _res, buffer) => {
        req.rawBody = Buffer.from(buffer);
    },
}));
const rateBuckets = new Map();
const rateProfile = (req) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method))
        return null;
    if (req.path === "/api/whatsapp/webhook" || req.path === "/api/emails/cron-sync")
        return null;
    if (/^\/api\/auth\/(login|mfa\/|forgot-password|reset-password)/.test(req.path))
        return { name: "auth", limit: 15, windowMs: 15 * 60000 };
    if (/^\/api\/analytics/.test(req.path))
        return { name: "analytics", limit: 400, windowMs: 10 * 60000 };
    return { name: "mutation", limit: 80, windowMs: 10 * 60000 };
};
app.use((req, res, next) => {
    const profile = rateProfile(req);
    if (!profile)
        return next();
    const now = Date.now();
    const key = `${profile.name}:${req.ip || req.socket.remoteAddress || "unknown"}`;
    const current = rateBuckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + profile.windowMs } : current;
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    res.setHeader("RateLimit-Limit", String(profile.limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, profile.limit - bucket.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (rateBuckets.size > 10000) {
        for (const [bucketKey, value] of rateBuckets)
            if (value.resetAt <= now)
                rateBuckets.delete(bucketKey);
    }
    if (bucket.count > profile.limit) {
        res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
        return void res.status(429).json({ message: "Too many requests. Please wait a moment and try again." });
    }
    next();
});
app.use("/api/trash", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, private");
    next();
});
app.get("/", (req, res) => {
    res.setHeader("X-CP-Commit", process.env.VERCEL_GIT_COMMIT_SHA || "local");
    res.send("Creativa Poeta Backend is running ✅");
});
app.use("/api", routes_1.default);
app.use((_req, res) => {
    res.status(404).json({ message: "Route not found." });
});
app.use(errorHandler_1.default);
exports.default = app;
