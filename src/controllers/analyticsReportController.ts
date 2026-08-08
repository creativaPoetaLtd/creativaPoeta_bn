import { NextFunction, Request, Response } from "express";
import {
  buildAnalyticsOverview,
  getRealtimeAnalytics,
  resolveAnalyticsDateRange,
} from "../services/analyticsReportService";

export const getAnalyticsOverview = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const range = resolveAnalyticsDateRange(req.query as Record<string, unknown>);
    const report = await buildAnalyticsOverview(range);
    res.status(200).json(report);
  } catch (error) {
    next(error);
  }
};

export const getAnalyticsRealtime = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(200).json(await getRealtimeAnalytics());
  } catch (error) {
    next(error);
  }
};
