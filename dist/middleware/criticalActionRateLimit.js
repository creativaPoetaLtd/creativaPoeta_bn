"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.criticalActionRateLimit = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const CriticalActionRateLimit_1 = __importDefault(require("../models/CriticalActionRateLimit"));
const criticalActionRateLimit = ({ action, limit, windowMs }) => async (req, res, next) => {
    var _a, _b;
    try {
        const now = Date.now();
        const windowStart = Math.floor(now / windowMs) * windowMs;
        const actor = String(((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || "unknown");
        const ip = String(req.ip || req.socket.remoteAddress || "unknown");
        const secret = process.env.SECURITY_RATE_LIMIT_SALT || process.env.JWT_SECRET;
        if (!secret) {
            res.status(503).json({ message: "Critical-action protection is not configured." });
            return;
        }
        const digest = node_crypto_1.default.createHmac("sha256", secret)
            .update(`${action}:${actor}:${ip}:${windowStart}`)
            .digest("hex");
        const expiresAt = new Date(windowStart + (windowMs * 2));
        let record;
        try {
            record = await CriticalActionRateLimit_1.default.findOneAndUpdate({ key: digest }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true, new: true, setDefaultsOnInsert: true });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) !== 11000)
                throw error;
            record = await CriticalActionRateLimit_1.default.findOneAndUpdate({ key: digest }, { $inc: { count: 1 } }, { new: true });
        }
        const count = (record === null || record === void 0 ? void 0 : record.count) || 1;
        const resetAt = windowStart + windowMs;
        res.setHeader("RateLimit-Limit", String(limit));
        res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - count)));
        res.setHeader("RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
        if (count > limit) {
            res.setHeader("Retry-After", String(Math.max(1, Math.ceil((resetAt - now) / 1000))));
            res.status(429).json({ message: "Too many critical actions. Please wait before trying again." });
            return;
        }
        next();
    }
    catch (error) {
        console.error("Critical action rate limit failed:", error instanceof Error ? error.message : "unknown_error");
        res.status(503).json({ message: "Critical-action protection is temporarily unavailable." });
    }
};
exports.criticalActionRateLimit = criticalActionRateLimit;
