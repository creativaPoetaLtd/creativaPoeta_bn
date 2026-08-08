"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.visibilityAuditInterpretation = exports.technicalVisibilityAudit = void 0;
const visibilityAuditService_1 = require("../services/visibilityAuditService");
const visibilityAiService_1 = require("../services/visibilityAiService");
const requestsByIp = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 10;
const consumeRateLimit = (ip) => {
    const now = Date.now();
    const current = requestsByIp.get(ip);
    if (!current || current.resetAt <= now) {
        requestsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return true;
    }
    if (current.count >= MAX_REQUESTS)
        return false;
    current.count += 1;
    return true;
};
const technicalVisibilityAudit = async (req, res, next) => {
    var _a;
    try {
        if (!consumeRateLimit(`${req.ip || "unknown"}:technical`)) {
            res.status(429).json({ message: "Trop de diagnostics. Reessayez dans quelques minutes." });
            return;
        }
        const url = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.url) === "string" ? req.body.url.trim() : "";
        if (!url || url.length > 2048) {
            res.status(400).json({ message: "Une adresse de site valide est requise." });
            return;
        }
        const audit = await (0, visibilityAuditService_1.runTechnicalVisibilityAudit)(url);
        res.status(200).json({ audit });
    }
    catch (error) {
        if (error instanceof visibilityAuditService_1.VisibilityAuditError) {
            res.status(error.statusCode).json({ message: error.message });
            return;
        }
        next(error);
    }
};
exports.technicalVisibilityAudit = technicalVisibilityAudit;
const supportedLocales = new Set(["fr", "en", "nl", "kiny"]);
const visibilityAuditInterpretation = async (req, res) => {
    var _a, _b, _c, _d;
    if (!consumeRateLimit(`${req.ip || "unknown"}:interpret`)) {
        res.status(429).json({
            message: "Trop de diagnostics. Reessayez dans quelques minutes.",
        });
        return;
    }
    const body = req.body;
    const score = Number(body === null || body === void 0 ? void 0 : body.finalScore);
    const locale = supportedLocales.has(String(body === null || body === void 0 ? void 0 : body.locale))
        ? body.locale
        : "fr";
    if (!Number.isFinite(score) || score < 0 || score > 100) {
        res.status(400).json({ message: "Le score du diagnostic est invalide." });
        return;
    }
    const input = {
        locale,
        finalScore: Math.round(score),
        goal: String(body.goal || "").slice(0, 180),
        company: String(body.company || "").slice(0, 180),
        city: String(body.city || "").slice(0, 180),
        languages: String(body.languages || "").slice(0, 180),
        signals: {
            googleProfile: String(((_a = body.signals) === null || _a === void 0 ? void 0 : _a.googleProfile) || "not-sure").slice(0, 20),
            social: String(((_b = body.signals) === null || _b === void 0 ? void 0 : _b.social) || "not-sure").slice(0, 20),
            consistentInfo: String(((_c = body.signals) === null || _c === void 0 ? void 0 : _c.consistentInfo) || "not-sure").slice(0, 20),
            reviews: String(((_d = body.signals) === null || _d === void 0 ? void 0 : _d.reviews) || "not-sure").slice(0, 20),
        },
        technical: body.technical
            ? {
                score: Math.max(0, Math.min(100, Number(body.technical.score) || 0)),
                verdict: String(body.technical.verdict || "").slice(0, 180),
                failedChecks: Array.isArray(body.technical.failedChecks)
                    ? body.technical.failedChecks.slice(0, 8).map((check) => ({
                        label: String(check.label || "").slice(0, 120),
                        detail: String(check.detail || "").slice(0, 240),
                        priority: String(check.priority || "").slice(0, 240),
                        weight: Math.max(0, Math.min(20, Number(check.weight) || 0)),
                    }))
                    : [],
                passedChecks: Array.isArray(body.technical.passedChecks)
                    ? body.technical.passedChecks
                        .slice(0, 8)
                        .map((value) => String(value).slice(0, 120))
                    : [],
            }
            : null,
    };
    const interpretation = await (0, visibilityAiService_1.interpretVisibilityAudit)(input);
    res.status(200).json({ interpretation });
};
exports.visibilityAuditInterpretation = visibilityAuditInterpretation;
