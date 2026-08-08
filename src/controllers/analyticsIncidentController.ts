import { NextFunction, Request, Response } from "express";
import AnalyticsIncident, {
  AnalyticsIncidentStatus,
} from "../models/AnalyticsIncident";
import {
  evaluateAnalyticsAnomalies,
  getAnalyticsIncidentSummary,
} from "../services/analyticsAnomalyService";

const allowedStatuses: AnalyticsIncidentStatus[] = ["open", "acknowledged", "resolved"];

export const listAnalyticsIncidents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requestedStatus = String(req.query.status || "active");
    const filter = requestedStatus === "all"
      ? {}
      : requestedStatus === "resolved"
        ? { status: "resolved" }
        : { status: { $in: ["open", "acknowledged"] } };
    const incidents = await AnalyticsIncident.find(filter).sort({ lastDetectedAt: -1 }).limit(100).lean();
    res.status(200).json({ incidents });
  } catch (error) {
    next(error);
  }
};

export const getAnalyticsIncidentSummaryController = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(200).json({ metrics: await getAnalyticsIncidentSummary() });
  } catch (error) {
    next(error);
  }
};

export const evaluateAnalyticsIncidentsController = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const incidents = await evaluateAnalyticsAnomalies(true);
    res.status(200).json({ incidents, metrics: await getAnalyticsIncidentSummary() });
  } catch (error) {
    next(error);
  }
};

export const updateAnalyticsIncidentStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const status = String(req.body?.status || "") as AnalyticsIncidentStatus;
    if (!allowedStatuses.includes(status)) {
      res.status(400).json({ message: "Invalid incident status." });
      return;
    }
    const incident = await AnalyticsIncident.findById(req.params.id);
    if (!incident) {
      res.status(404).json({ message: "Analytics incident not found." });
      return;
    }
    const actorEmail = String(req.user?.email || "").toLowerCase();
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
  } catch (error) {
    next(error);
  }
};
