"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsIncidentSummary = exports.evaluateAnalyticsAnomalies = void 0;
const AnalyticsEvent_1 = __importDefault(require("../models/AnalyticsEvent"));
const AnalyticsIncident_1 = __importDefault(require("../models/AnalyticsIncident"));
const AnalyticsServerMetric_1 = __importDefault(require("../models/AnalyticsServerMetric"));
let lastEvaluationAt = 0;
let evaluationPromise = null;
const round = (value, precision = 1) => {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
};
const percentChange = (current, baseline) => {
    if (baseline <= 0)
        return current > 0 ? 100 : 0;
    return round(((current - baseline) / baseline) * 100);
};
const serializeIncident = (incident) => ({
    id: String(incident._id),
    type: incident.type,
    source: incident.source,
    severity: incident.severity,
    status: incident.status,
    title: incident.title,
    message: incident.message,
    metric: incident.metric,
    currentValue: incident.currentValue,
    baselineValue: incident.baselineValue,
    changePercent: incident.changePercent,
    threshold: incident.threshold,
    occurrences: incident.occurrences,
    firstDetectedAt: incident.firstDetectedAt,
    lastDetectedAt: incident.lastDetectedAt,
    acknowledgedAt: incident.acknowledgedAt,
    resolvedAt: incident.resolvedAt,
});
const aggregateWindow = async (from, to) => {
    const rows = await AnalyticsServerMetric_1.default.aggregate([
        { $match: { bucketStart: { $gte: from, $lt: to } } },
        {
            $group: {
                _id: null,
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
                durationTotalMs: {
                    $sum: { $cond: [{ $eq: ["$metricType", "api_request"] }, "$durationTotalMs", 0] },
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
                formAttempts: {
                    $sum: { $cond: [{ $eq: ["$metricType", "form_submission"] }, "$count", 0] },
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
    ]);
    const row = rows[0] || {};
    return {
        requests: Number(row.requests || 0),
        serverErrors: Number(row.serverErrors || 0),
        durationTotalMs: Number(row.durationTotalMs || 0),
        authDenied: Number(row.authDenied || 0),
        formAttempts: Number(row.formAttempts || 0),
        formFailures: Number(row.formFailures || 0),
        spamBlocked: Number(row.spamBlocked || 0),
        botRequests: Number(row.botRequests || 0),
    };
};
const detectOperationalIncidents = (current, baselineSevenDays) => {
    const detected = [];
    const dailyBaseline = Object.fromEntries(Object.entries(baselineSevenDays).map(([key, value]) => [key, Number(value || 0) / 7]));
    const availability = current.requests > 0
        ? ((current.requests - current.serverErrors) / current.requests) * 100
        : 100;
    const averageLatency = current.requests > 0 ? current.durationTotalMs / current.requests : 0;
    const baselineLatency = dailyBaseline.requests > 0
        ? dailyBaseline.durationTotalMs / dailyBaseline.requests
        : 0;
    const formFailureRate = current.formAttempts > 0
        ? (current.formFailures / current.formAttempts) * 100
        : 0;
    if (current.requests >= 10 && availability < 99.5) {
        detected.push({
            fingerprint: "server:availability",
            type: "availability_drop",
            source: "server",
            severity: availability < 98 ? "critical" : "warning",
            title: "Observed API availability has dropped",
            message: `${current.serverErrors} server error(s) were observed across ${current.requests} API requests in the last 24 hours.`,
            metric: "observedAvailability",
            currentValue: round(availability, 2),
            baselineValue: 100,
            changePercent: round(availability - 100, 2),
            threshold: 99.5,
        });
    }
    if (current.requests >= 10 &&
        averageLatency > 1000 &&
        (baselineLatency === 0 || averageLatency > baselineLatency * 1.8)) {
        detected.push({
            fingerprint: "server:latency",
            type: "latency_spike",
            source: "server",
            severity: averageLatency > 2500 ? "critical" : "warning",
            title: "API response time is unusually high",
            message: `Average API response time reached ${Math.round(averageLatency)} ms during the last 24 hours.`,
            metric: "averageResponseMs",
            currentValue: round(averageLatency),
            baselineValue: round(baselineLatency),
            changePercent: percentChange(averageLatency, baselineLatency),
            threshold: 1000,
        });
    }
    if (current.serverErrors >= 3 &&
        (dailyBaseline.serverErrors === 0 || current.serverErrors > dailyBaseline.serverErrors * 2)) {
        detected.push({
            fingerprint: "server:errors",
            type: "server_error_spike",
            source: "server",
            severity: current.serverErrors >= 10 ? "critical" : "warning",
            title: "Server errors are increasing",
            message: `${current.serverErrors} HTTP 5xx responses were recorded in the last 24 hours.`,
            metric: "serverErrors",
            currentValue: current.serverErrors,
            baselineValue: round(dailyBaseline.serverErrors),
            changePercent: percentChange(current.serverErrors, dailyBaseline.serverErrors),
            threshold: 3,
        });
    }
    if (current.authDenied >= 5 &&
        (dailyBaseline.authDenied === 0 || current.authDenied > dailyBaseline.authDenied * 2)) {
        detected.push({
            fingerprint: "security:auth-denied",
            type: "auth_failure_spike",
            source: "security",
            severity: current.authDenied >= 20 ? "critical" : "warning",
            title: "Unusual number of denied admin logins",
            message: `${current.authDenied} admin login attempts were denied in the last 24 hours.`,
            metric: "authDenied",
            currentValue: current.authDenied,
            baselineValue: round(dailyBaseline.authDenied),
            changePercent: percentChange(current.authDenied, dailyBaseline.authDenied),
            threshold: 5,
        });
    }
    if (current.formAttempts >= 5 && current.formFailures >= 3 && formFailureRate >= 20) {
        detected.push({
            fingerprint: "forms:failures",
            type: "form_failure_spike",
            source: "forms",
            severity: formFailureRate >= 50 || current.formFailures >= 10 ? "critical" : "warning",
            title: "Public forms are failing unusually often",
            message: `${current.formFailures} of ${current.formAttempts} server-side form submissions failed in the last 24 hours.`,
            metric: "formFailureRate",
            currentValue: round(formFailureRate),
            baselineValue: dailyBaseline.formAttempts > 0
                ? round((dailyBaseline.formFailures / dailyBaseline.formAttempts) * 100)
                : 0,
            changePercent: percentChange(current.formFailures, dailyBaseline.formFailures),
            threshold: 20,
        });
    }
    if (current.spamBlocked >= 10 &&
        (dailyBaseline.spamBlocked === 0 || current.spamBlocked > dailyBaseline.spamBlocked * 3)) {
        detected.push({
            fingerprint: "mail:spam",
            type: "spam_spike",
            source: "mail",
            severity: current.spamBlocked >= 50 ? "warning" : "info",
            title: "Spam volume is above its usual level",
            message: `${current.spamBlocked} new messages were filtered as spam during the last 24 hours.`,
            metric: "spamBlocked",
            currentValue: current.spamBlocked,
            baselineValue: round(dailyBaseline.spamBlocked),
            changePercent: percentChange(current.spamBlocked, dailyBaseline.spamBlocked),
            threshold: 10,
        });
    }
    if (current.botRequests >= 25 &&
        (dailyBaseline.botRequests === 0 || current.botRequests > dailyBaseline.botRequests * 3)) {
        detected.push({
            fingerprint: "security:bots",
            type: "bot_traffic_spike",
            source: "security",
            severity: current.botRequests >= 200 ? "warning" : "info",
            title: "Automated traffic is above its usual level",
            message: `${current.botRequests} bot requests were identified during the last 24 hours.`,
            metric: "botRequests",
            currentValue: current.botRequests,
            baselineValue: round(dailyBaseline.botRequests),
            changePercent: percentChange(current.botRequests, dailyBaseline.botRequests),
            threshold: 25,
        });
    }
    return detected;
};
const upsertDetectedIncidents = async (detected, now) => {
    const fingerprints = detected.map((incident) => incident.fingerprint);
    await Promise.all(detected.map(async (incident) => {
        const existing = await AnalyticsIncident_1.default.findOne({ fingerprint: incident.fingerprint })
            .select("status acknowledgedAt acknowledgedByEmail")
            .lean();
        const remainsAcknowledged = (existing === null || existing === void 0 ? void 0 : existing.status) === "acknowledged";
        return AnalyticsIncident_1.default.updateOne({ fingerprint: incident.fingerprint }, {
            $setOnInsert: { firstDetectedAt: now },
            $set: {
                ...incident,
                status: remainsAcknowledged ? "acknowledged" : "open",
                lastDetectedAt: now,
                resolvedAt: null,
                resolvedByEmail: null,
                acknowledgedAt: remainsAcknowledged ? existing.acknowledgedAt : null,
                acknowledgedByEmail: remainsAcknowledged ? existing.acknowledgedByEmail : null,
            },
            $inc: { occurrences: 1 },
        }, { upsert: true });
    }));
    await AnalyticsIncident_1.default.updateMany({
        status: { $in: ["open", "acknowledged"] },
        fingerprint: { $nin: fingerprints },
        source: { $in: ["server", "security", "forms", "mail", "analytics"] },
    }, { $set: { status: "resolved", resolvedAt: now, resolvedByEmail: "automatic-recovery" } });
};
const runEvaluation = async () => {
    const now = new Date();
    const currentFrom = new Date(now.getTime() - 24 * 60 * 60000);
    const baselineFrom = new Date(currentFrom.getTime() - 7 * 24 * 60 * 60000);
    const [current, baseline, lastBrowserEvent] = await Promise.all([
        aggregateWindow(currentFrom, now),
        aggregateWindow(baselineFrom, currentFrom),
        AnalyticsEvent_1.default.findOne().sort({ receivedAt: -1 }).select("receivedAt").lean(),
    ]);
    const detected = detectOperationalIncidents(current, baseline);
    if ((lastBrowserEvent === null || lastBrowserEvent === void 0 ? void 0 : lastBrowserEvent.receivedAt) &&
        current.requests >= 10 &&
        now.getTime() - new Date(lastBrowserEvent.receivedAt).getTime() > 24 * 60 * 60000) {
        const silentHours = round((now.getTime() - new Date(lastBrowserEvent.receivedAt).getTime()) / 3600000);
        detected.push({
            fingerprint: "analytics:collection-stopped",
            type: "analytics_collection_stopped",
            source: "analytics",
            severity: silentHours >= 72 ? "critical" : "warning",
            title: "Browser analytics collection appears inactive",
            message: `No consent-aware browser analytics event has been received for approximately ${silentHours} hours.`,
            metric: "hoursSinceLastEvent",
            currentValue: silentHours,
            baselineValue: 0,
            changePercent: 100,
            threshold: 24,
        });
    }
    await upsertDetectedIncidents(detected, now);
    lastEvaluationAt = Date.now();
    const incidents = await AnalyticsIncident_1.default.find({ status: { $in: ["open", "acknowledged"] } })
        .sort({ severity: 1, lastDetectedAt: -1 })
        .lean();
    return incidents.map(serializeIncident);
};
const evaluateAnalyticsAnomalies = async (force = false) => {
    if (!force && Date.now() - lastEvaluationAt < 5 * 60000) {
        const incidents = await AnalyticsIncident_1.default.find({ status: { $in: ["open", "acknowledged"] } })
            .sort({ lastDetectedAt: -1 })
            .lean();
        return incidents.map(serializeIncident);
    }
    if (!evaluationPromise) {
        evaluationPromise = runEvaluation().finally(() => {
            evaluationPromise = null;
        });
    }
    return evaluationPromise;
};
exports.evaluateAnalyticsAnomalies = evaluateAnalyticsAnomalies;
const getAnalyticsIncidentSummary = async () => {
    const [open, critical, warning] = await Promise.all([
        AnalyticsIncident_1.default.countDocuments({ status: { $in: ["open", "acknowledged"] } }),
        AnalyticsIncident_1.default.countDocuments({ status: { $in: ["open", "acknowledged"] }, severity: "critical" }),
        AnalyticsIncident_1.default.countDocuments({ status: { $in: ["open", "acknowledged"] }, severity: "warning" }),
    ]);
    return { open, critical, warning };
};
exports.getAnalyticsIncidentSummary = getAnalyticsIncidentSummary;
