"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAnalyticsIncidentStatus = exports.evaluateAnalyticsIncidentsController = exports.getAnalyticsIncidentSummaryController = exports.listAnalyticsIncidents = void 0;
const AnalyticsIncident_1 = __importDefault(require("../models/AnalyticsIncident"));
const analyticsAnomalyService_1 = require("../services/analyticsAnomalyService");
const allowedStatuses = ["open", "acknowledged", "resolved"];
const listAnalyticsIncidents = async (req, res, next) => {
    try {
        const requestedStatus = String(req.query.status || "active");
        const filter = requestedStatus === "all"
            ? {}
            : requestedStatus === "resolved"
                ? { status: "resolved" }
                : { status: { $in: ["open", "acknowledged"] } };
        const incidents = await AnalyticsIncident_1.default.find(filter).sort({ lastDetectedAt: -1 }).limit(100).lean();
        res.status(200).json({ incidents });
    }
    catch (error) {
        next(error);
    }
};
exports.listAnalyticsIncidents = listAnalyticsIncidents;
const getAnalyticsIncidentSummaryController = async (_req, res, next) => {
    try {
        res.status(200).json({ metrics: await (0, analyticsAnomalyService_1.getAnalyticsIncidentSummary)() });
    }
    catch (error) {
        next(error);
    }
};
exports.getAnalyticsIncidentSummaryController = getAnalyticsIncidentSummaryController;
const evaluateAnalyticsIncidentsController = async (_req, res, next) => {
    try {
        const incidents = await (0, analyticsAnomalyService_1.evaluateAnalyticsAnomalies)(true);
        res.status(200).json({ incidents, metrics: await (0, analyticsAnomalyService_1.getAnalyticsIncidentSummary)() });
    }
    catch (error) {
        next(error);
    }
};
exports.evaluateAnalyticsIncidentsController = evaluateAnalyticsIncidentsController;
const updateAnalyticsIncidentStatus = async (req, res, next) => {
    var _a, _b;
    try {
        const status = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || "");
        if (!allowedStatuses.includes(status)) {
            res.status(400).json({ message: "Invalid incident status." });
            return;
        }
        const incident = await AnalyticsIncident_1.default.findById(req.params.id);
        if (!incident) {
            res.status(404).json({ message: "Analytics incident not found." });
            return;
        }
        const actorEmail = String(((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || "").toLowerCase();
        incident.status = status;
        if (status === "acknowledged") {
            incident.acknowledgedAt = new Date();
            incident.acknowledgedByEmail = actorEmail;
        }
        if (status === "resolved") {
            incident.resolvedAt = new Date();
            incident.resolvedByEmail = actorEmail;
        }
        if (status === "open") {
            incident.acknowledgedAt = undefined;
            incident.acknowledgedByEmail = undefined;
            incident.resolvedAt = undefined;
            incident.resolvedByEmail = undefined;
        }
        await incident.save();
        res.status(200).json({ incident });
    }
    catch (error) {
        next(error);
    }
};
exports.updateAnalyticsIncidentStatus = updateAnalyticsIncidentStatus;
