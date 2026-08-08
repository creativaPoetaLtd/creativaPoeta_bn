"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMonitoringEvaluation = exports.getReadiness = exports.getLiveness = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const AnalyticsServerMetric_1 = __importDefault(require("../models/AnalyticsServerMetric"));
const analyticsAnomalyService_1 = require("../services/analyticsAnomalyService");
const commit = () => process.env.VERCEL_GIT_COMMIT_SHA || "local";
const getLiveness = (_req, res) => {
    res.status(200).json({
        status: "ok",
        service: "creativa-poeta-backend",
        timestamp: new Date().toISOString(),
        commit: commit(),
    });
};
exports.getLiveness = getLiveness;
const getReadiness = async (_req, res, next) => {
    var _a;
    try {
        let database = mongoose_1.default.connection.readyState === 1 ? "connected" : "disconnected";
        if (database === "connected") {
            try {
                await ((_a = mongoose_1.default.connection.db) === null || _a === void 0 ? void 0 : _a.admin().ping());
            }
            catch {
                database = "unavailable";
            }
        }
        const ready = database === "connected";
        const latestMetric = ready
            ? await AnalyticsServerMetric_1.default.findOne().sort({ lastOccurredAt: -1 }).select("lastOccurredAt").lean()
            : null;
        res.status(ready ? 200 : 503).json({
            status: ready ? "ready" : "degraded",
            service: "creativa-poeta-backend",
            database,
            timestamp: new Date().toISOString(),
            commit: commit(),
            latestServerMetricAt: (latestMetric === null || latestMetric === void 0 ? void 0 : latestMetric.lastOccurredAt) || null,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getReadiness = getReadiness;
const safeEqual = (left, right) => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto_1.default.timingSafeEqual(leftBuffer, rightBuffer);
};
const runMonitoringEvaluation = async (req, res, next) => {
    try {
        const configuredSecret = String(process.env.ANALYTICS_MONITOR_SECRET || process.env.CRON_SECRET || "").trim();
        const bearer = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
        const providedSecret = String(req.get("x-cp-monitor-secret") || bearer).trim();
        if (!configuredSecret) {
            res.status(503).json({ status: "not_configured" });
            return;
        }
        if (!providedSecret || !safeEqual(providedSecret, configuredSecret)) {
            res.status(401).json({ status: "unauthorized" });
            return;
        }
        const incidents = await (0, analyticsAnomalyService_1.evaluateAnalyticsAnomalies)(true);
        const summary = await (0, analyticsAnomalyService_1.getAnalyticsIncidentSummary)();
        res.status(summary.critical > 0 ? 503 : 200).json({
            status: summary.critical > 0 ? "critical" : summary.warning > 0 ? "warning" : "healthy",
            evaluatedAt: new Date().toISOString(),
            summary,
            incidents: incidents.map((incident) => ({
                type: incident.type,
                severity: incident.severity,
                status: incident.status,
                lastDetectedAt: incident.lastDetectedAt,
            })),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.runMonitoringEvaluation = runMonitoringEvaluation;
