import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import AnalyticsServerMetric from "../models/AnalyticsServerMetric";
import {
  evaluateAnalyticsAnomalies,
  getAnalyticsIncidentSummary,
} from "../services/analyticsAnomalyService";

const commit = () => process.env.VERCEL_GIT_COMMIT_SHA || "local";

export const getLiveness = (_req: Request, res: Response): void => {
  res.status(200).json({
    status: "ok",
    service: "creativa-poeta-backend",
    timestamp: new Date().toISOString(),
    commit: commit(),
  });
};

export const getReadiness = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let database = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    if (database === "connected") {
      try {
        await mongoose.connection.db?.admin().ping();
      } catch {
        database = "unavailable";
      }
    }

    const ready = database === "connected";
    const latestMetric = ready
      ? await AnalyticsServerMetric.findOne().sort({ lastOccurredAt: -1 }).select("lastOccurredAt").lean()
      : null;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "degraded",
      service: "creativa-poeta-backend",
      database,
      timestamp: new Date().toISOString(),
      commit: commit(),
      latestServerMetricAt: latestMetric?.lastOccurredAt || null,
    });
  } catch (error) {
    next(error);
  }
};

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const runMonitoringEvaluation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const configuredSecret = String(
      process.env.ANALYTICS_MONITOR_SECRET || process.env.CRON_SECRET || ""
    ).trim();
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

    const incidents = await evaluateAnalyticsAnomalies(true);
    const summary = await getAnalyticsIncidentSummary();
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
  } catch (error) {
    next(error);
  }
};
