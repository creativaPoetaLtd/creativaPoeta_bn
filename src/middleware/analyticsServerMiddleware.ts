import { NextFunction, Request, Response } from "express";
import { recordServerMetric } from "../services/analyticsServerMetricService";

const botPattern =
  /(googlebot|bingbot|yandexbot|baiduspider|duckduckbot|facebookexternalhit|linkedinbot|twitterbot|slurp|semrushbot|ahrefsbot|mj12bot|crawler|spider|bot)/i;

const normalizeRoute = (originalUrl: string) => {
  const path = String(originalUrl || "/").split(/[?#]/)[0] || "/";
  return path
    .split("/")
    .map((segment) => {
      if (/^[a-f0-9]{24}$/i.test(segment)) return ":id";
      if (/^[0-9]+$/.test(segment)) return ":id";
      if (/^[a-f0-9-]{32,36}$/i.test(segment)) return ":id";
      if (/^[A-Za-z0-9_-]{40,}$/.test(segment)) return ":token";
      return segment.slice(0, 60);
    })
    .join("/")
    .slice(0, 180);
};

const getBot = (req: Request) => {
  const match = String(req.get("user-agent") || "").match(botPattern)?.[1];
  return { isBot: Boolean(match), botName: match?.toLowerCase() || "none" };
};

const getCountry = (req: Request) =>
  String(req.get("x-vercel-ip-country") || "unknown").trim().slice(0, 4).toUpperCase();

const formRoutes: Record<string, string> = {
  "/api/contact/send": "contact",
  "/api/project/send-inquiry": "project",
  "/api/partnership-requests": "partnership",
  "/api/job/apply": "job_application",
  "/api/visibility-audit/technical": "visibility_audit",
  "/api/visibility-audit/interpret": "visibility_audit",
  "/api/referral-program/partners": "referral_partner_application",
  "/api/referral-program/partners/recover-access": "referral_access_recovery",
  "/api/referral-program/leads": "referral_lead",
  "/api/referral-program/direct-referrals": "direct_referral",
  "/api/referral-program/prospect-referrals": "referred_client_request",
};

export const analyticsServerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (String(req.originalUrl || "").split(/[?#]/)[0] === "/api/health/live") {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = normalizeRoute(req.originalUrl);
    const bot = getBot(req);
    const country = getCountry(req);
    const outcome = res.statusCode >= 500
      ? "server_error"
      : res.statusCode === 404
        ? "not_found"
        : res.statusCode >= 400
          ? "rejected"
          : "success";

    void recordServerMetric({
      metricType: "api_request",
      route,
      method: req.method,
      statusCode: res.statusCode,
      outcome,
      category: route.startsWith("/api/") ? "api" : "service",
      country,
      ...bot,
      durationMs,
    });

    if (route === "/api/auth/login" && req.method === "POST") {
      void recordServerMetric({
        metricType: "auth_attempt",
        route,
        method: req.method,
        statusCode: res.statusCode,
        outcome: res.statusCode >= 200 && res.statusCode < 300 ? "success" : "denied",
        category: "admin_login",
        country,
        ...bot,
        durationMs,
      });
    }

    const formType = req.method === "POST" ? formRoutes[route] : undefined;
    if (formType) {
      void recordServerMetric({
        metricType: "form_submission",
        route,
        method: req.method,
        statusCode: res.statusCode,
        outcome: res.statusCode >= 200 && res.statusCode < 300 ? "success" : "failed",
        category: formType,
        country,
        ...bot,
        durationMs,
      });
    }
  });

  next();
};
