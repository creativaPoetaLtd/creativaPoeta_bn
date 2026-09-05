import crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";
import CriticalActionRateLimit from "../models/CriticalActionRateLimit";

interface CriticalLimitOptions {
  action: string;
  limit: number;
  windowMs: number;
}

export const criticalActionRateLimit = ({ action, limit, windowMs }: CriticalLimitOptions) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const now = Date.now();
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const actor = String(req.user?._id || req.user?.email || "unknown");
      const ip = String(req.ip || req.socket.remoteAddress || "unknown");
      const secret = process.env.SECURITY_RATE_LIMIT_SALT || process.env.JWT_SECRET;
      if (!secret) {
        res.status(503).json({ message: "Critical-action protection is not configured." });
        return;
      }
      const digest = crypto.createHmac("sha256", secret)
        .update(`${action}:${actor}:${ip}:${windowStart}`)
        .digest("hex");
      const expiresAt = new Date(windowStart + (windowMs * 2));
      let record;
      try {
        record = await CriticalActionRateLimit.findOneAndUpdate(
          { key: digest },
          { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        record = await CriticalActionRateLimit.findOneAndUpdate({ key: digest }, { $inc: { count: 1 } }, { new: true });
      }
      const count = record?.count || 1;
      const resetAt = windowStart + windowMs;
      res.setHeader("RateLimit-Limit", String(limit));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - count)));
      res.setHeader("RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
      if (count > limit) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((resetAt - now) / 1000))));
        res.status(429).json({ message: "Too many critical actions. Please wait before trying again." });
        return;
      }
      next();
    } catch (error) {
      console.error("Critical action rate limit failed:", error instanceof Error ? error.message : "unknown_error");
      res.status(503).json({ message: "Critical-action protection is temporarily unavailable." });
    }
  };
