import { NextFunction, Request, Response } from "express";
import { runTechnicalVisibilityAudit, VisibilityAuditError } from "../services/visibilityAuditService";
import {
  interpretVisibilityAudit,
  VisibilityInterpretationInput,
} from "../services/visibilityAiService";

const requestsByIp = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 10;

const consumeRateLimit = (ip: string) => {
  const now = Date.now();
  const current = requestsByIp.get(ip);
  if (!current || current.resetAt <= now) {
    requestsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1;
  return true;
};

export const technicalVisibilityAudit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!consumeRateLimit(`${req.ip || "unknown"}:technical`)) {
      res.status(429).json({ message: "Trop de diagnostics. Reessayez dans quelques minutes." });
      return;
    }
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!url || url.length > 2048) {
      res.status(400).json({ message: "Une adresse de site valide est requise." });
      return;
    }
    const audit = await runTechnicalVisibilityAudit(url);
    res.status(200).json({ audit });
  } catch (error) {
    if (error instanceof VisibilityAuditError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    next(error);
  }
};
const supportedLocales = new Set(["fr", "en", "nl", "kiny"]);

export const visibilityAuditInterpretation = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!consumeRateLimit(`${req.ip || "unknown"}:interpret`)) {
    res.status(429).json({
      message: "Trop de diagnostics. Reessayez dans quelques minutes.",
    });
    return;
  }

  const body = req.body as Partial<VisibilityInterpretationInput>;
  const score = Number(body?.finalScore);
  const locale = supportedLocales.has(String(body?.locale))
    ? (body.locale as VisibilityInterpretationInput["locale"])
    : "fr";

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    res.status(400).json({ message: "Le score du diagnostic est invalide." });
    return;
  }

  const input: VisibilityInterpretationInput = {
    locale,
    finalScore: Math.round(score),
    goal: String(body.goal || "").slice(0, 180),
    company: String(body.company || "").slice(0, 180),
    city: String(body.city || "").slice(0, 180),
    languages: String(body.languages || "").slice(0, 180),
    signals: {
      googleProfile: String(body.signals?.googleProfile || "not-sure").slice(0, 20),
      social: String(body.signals?.social || "not-sure").slice(0, 20),
      consistentInfo: String(body.signals?.consistentInfo || "not-sure").slice(0, 20),
      reviews: String(body.signals?.reviews || "not-sure").slice(0, 20),
    },
    technical: body.technical
      ? {
          score: Math.max(0, Math.min(100, Number(body.technical.score) || 0)),
          verdict: String(body.technical.verdict || "").slice(0, 180),
          failedChecks: Array.isArray(body.technical.failedChecks)
            ? body.technical.failedChecks.slice(0, 8).map((check) => ({
                label: String(check.label || "").slice(0, 120),
                detail: String(check.detail || "").slice(0, 240),
                priority: String(check.priority || "").slice(0, 240),
                weight: Math.max(0, Math.min(20, Number(check.weight) || 0)),
              }))
            : [],
          passedChecks: Array.isArray(body.technical.passedChecks)
            ? body.technical.passedChecks
                .slice(0, 8)
                .map((value) => String(value).slice(0, 120))
            : [],
        }
      : null,
  };

  const interpretation = await interpretVisibilityAudit(input);
  res.status(200).json({ interpretation });
};