"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeAuditSnapshot = exports.recordAuditEvent = void 0;
const AuditEvent_1 = __importDefault(require("../models/AuditEvent"));
const auditContext_1 = require("../middleware/auditContext");
const blockedKey = /(password|secret|token|authorization|cookie|\bdata\b|html|signature)/i;
const sanitize = (value, depth = 0) => {
    if (depth > 8 || value === undefined)
        return undefined;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return typeof value === "string" && value.length > 12000 ? `${value.slice(0, 12000)}...` : value;
    }
    if (value instanceof Date)
        return value;
    if (Buffer.isBuffer(value))
        return `[binary:${value.length}]`;
    if (Array.isArray(value))
        return value.slice(0, 250).map((item) => sanitize(item, depth + 1));
    if (typeof value === "object") {
        return Object.entries(value).reduce((result, [key, entry]) => {
            if (!blockedKey.test(key))
                result[key] = sanitize(entry, depth + 1);
            return result;
        }, {});
    }
    return String(value);
};
const changedPaths = (before, after) => {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    return [...keys].filter((key) => JSON.stringify(before === null || before === void 0 ? void 0 : before[key]) !== JSON.stringify(after === null || after === void 0 ? void 0 : after[key])).slice(0, 250);
};
const recordAuditEvent = async ({ entityType, entityId, action, before, after, required = false, session, }) => {
    var _a, _b, _c, _d;
    const context = (0, auditContext_1.getAuditContext)();
    const safeBefore = before ? sanitize(before) : undefined;
    const safeAfter = after ? sanitize(after) : undefined;
    try {
        await AuditEvent_1.default.create([{
                entityType,
                entityId,
                action,
                before: safeBefore,
                after: safeAfter,
                changedPaths: changedPaths(safeBefore, safeAfter),
                actorId: (_a = context === null || context === void 0 ? void 0 : context.actor) === null || _a === void 0 ? void 0 : _a.id,
                actorEmail: (_b = context === null || context === void 0 ? void 0 : context.actor) === null || _b === void 0 ? void 0 : _b.email,
                actorName: (_c = context === null || context === void 0 ? void 0 : context.actor) === null || _c === void 0 ? void 0 : _c.name,
                actorRole: (_d = context === null || context === void 0 ? void 0 : context.actor) === null || _d === void 0 ? void 0 : _d.role,
                requestId: context === null || context === void 0 ? void 0 : context.requestId,
            }], session ? { session } : undefined);
    }
    catch (error) {
        console.error("Audit event write failed:", error instanceof Error ? error.message : "unknown_error");
        if (required)
            throw error;
    }
};
exports.recordAuditEvent = recordAuditEvent;
const safeAuditSnapshot = (value) => sanitize(value);
exports.safeAuditSnapshot = safeAuditSnapshot;
