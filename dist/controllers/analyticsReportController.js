"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsRealtime = exports.getAnalyticsOverview = void 0;
const analyticsReportService_1 = require("../services/analyticsReportService");
const getAnalyticsOverview = async (req, res, next) => {
    try {
        const range = (0, analyticsReportService_1.resolveAnalyticsDateRange)(req.query);
        const report = await (0, analyticsReportService_1.buildAnalyticsOverview)(range);
        res.status(200).json(report);
    }
    catch (error) {
        next(error);
    }
};
exports.getAnalyticsOverview = getAnalyticsOverview;
const getAnalyticsRealtime = async (_req, res, next) => {
    try {
        res.status(200).json(await (0, analyticsReportService_1.getRealtimeAnalytics)());
    }
    catch (error) {
        next(error);
    }
};
exports.getAnalyticsRealtime = getAnalyticsRealtime;
