import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";

export interface AuditActor {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
}

interface AuditContextValue {
  requestId: string;
  actor?: AuditActor;
}

const auditContext = new AsyncLocalStorage<AuditContextValue>();

export const auditContextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = String(req.headers["x-request-id"] || crypto.randomUUID()).slice(0, 120);
  res.setHeader("X-Request-Id", requestId);
  auditContext.run({ requestId }, next);
};

export const setAuditActor = (actor: AuditActor) => {
  const context = auditContext.getStore();
  if (context) context.actor = actor;
};

export const getAuditContext = () => auditContext.getStore();
