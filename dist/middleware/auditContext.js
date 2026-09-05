"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuditContext = exports.setAuditActor = exports.auditContextMiddleware = void 0;
const node_async_hooks_1 = require("node:async_hooks");
const node_crypto_1 = __importDefault(require("node:crypto"));
const auditContext = new node_async_hooks_1.AsyncLocalStorage();
const auditContextMiddleware = (req, res, next) => {
    const requestId = String(req.headers["x-request-id"] || node_crypto_1.default.randomUUID()).slice(0, 120);
    res.setHeader("X-Request-Id", requestId);
    auditContext.run({ requestId }, next);
};
exports.auditContextMiddleware = auditContextMiddleware;
const setAuditActor = (actor) => {
    const context = auditContext.getStore();
    if (context)
        context.actor = actor;
};
exports.setAuditActor = setAuditActor;
const getAuditContext = () => auditContext.getStore();
exports.getAuditContext = getAuditContext;
