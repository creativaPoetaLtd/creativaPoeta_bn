"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsServerMiddleware = void 0;
const analyticsServerMetricService_1 = require("../services/analyticsServerMetricService");
const botPattern = /(googlebot|bingbot|yandexbot|baiduspider|duckduckbot|facebookexternalhit|linkedinbot|twitterbot|slurp|semrushbot|ahrefsbot|mj12bot|crawler|spider|bot)/i;
const normalizeRoute = (originalUrl) => {
    const path = String(originalUrl || "/").split(/[?#]/)[0] || "/";
    return path
        .split("/")
        .map((segment) => {
        if (/^[a-f0-9]{24}$/i.test(segment))
            return ":id";
        if (/^[0-9]+$/.test(segment))
            return ":id";
        if (/^[a-f0-9-]{32,36}$/i.test(segment))
            return ":id";
        if (/^[A-Za-z0-9_-]{40,}$/.test(segment))
            return ":token";
        return segment.slice(0, 60);
    })
        .join("/")
        .slice(0, 180);
};
const getBot = (req) => {
    var _a;
    const match = (_a = String(req.get("user-agent") || "").match(botPattern)) === null || _a === void 0 ? void 0 : _a[1];
    return { isBot: Boolean(match), botName: (match === null || match === void 0 ? void 0 : match.toLowerCase()) || "none" };
};
const getCountry = (req) => String(req.get("x-vercel-ip-country") || "unknown").trim().slice(0, 4).toUpperCase();
const formRoutes = {
    "/api/contact/send": "contact",
    "/api/project/send-inquiry": "project",
    "/api/partnership-requests": "partnership",
    "/api/job/apply": "job_application",
    "/api/visibility-audit/technical": "visibility_audit",
    "/api/visibility-audit/interpret": "visibility_audit",
};
const analyticsServerMiddleware = (req, res, next) => {
    if (String(req.originalUrl || "").split(/[?#]/)[0] === "/api/health/live") {
        next();
        return;
    }
    const startedAt = process.hrtime.bigint();
    res.once("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
        const route = normalizeRoute(req.originalUrl);
        const bot = getBot(req);
        const country = getCountry(req);
        const outcome = res.statusCode >= 500
            ? "server_error"
            : res.statusCode === 404
                ? "not_found"
                : res.statusCode >= 400
                    ? "rejected"
                    : "success";
        void (0, analyticsServerMetricService_1.recordServerMetric)({
            metricType: "api_request",
            route,
            method: req.method,
            statusCode: res.statusCode,
            outcome,
            category: route.startsWith("/api/") ? "api" : "service",
            country,
            ...bot,
            durationMs,
        });
        if (route === "/api/auth/login" && req.method === "POST") {
            void (0, analyticsServerMetricService_1.recordServerMetric)({
                metricType: "auth_attempt",
                route,
                method: req.method,
                statusCode: res.statusCode,
                outcome: res.statusCode >= 200 && res.statusCode < 300 ? "success" : "denied",
                category: "admin_login",
                country,
                ...bot,
                durationMs,
            });
        }
        const formType = req.method === "POST" ? formRoutes[route] : undefined;
        if (formType) {
            void (0, analyticsServerMetricService_1.recordServerMetric)({
                metricType: "form_submission",
                route,
                method: req.method,
                statusCode: res.statusCode,
                outcome: res.statusCode >= 200 && res.statusCode < 300 ? "success" : "failed",
                category: formType,
                country,
                ...bot,
                durationMs,
            });
        }
    });
    next();
};
exports.analyticsServerMiddleware = analyticsServerMiddleware;
