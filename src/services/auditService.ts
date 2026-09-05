import AuditEvent, { AuditAction } from "../models/AuditEvent";
import { getAuditContext } from "../middleware/auditContext";
import { ClientSession } from "mongoose";

const blockedKey = /(password|secret|token|authorization|cookie|\bdata\b|html|signature)/i;

const sanitize = (value: unknown, depth = 0): any => {
  if (depth > 8 || value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value === "string" && value.length > 12000 ? `${value.slice(0, 12000)}...` : value;
  }
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return `[binary:${value.length}]`;
  if (Array.isArray(value)) return value.slice(0, 250).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((result, [key, entry]) => {
      if (!blockedKey.test(key)) result[key] = sanitize(entry, depth + 1);
      return result;
    }, {});
  }
  return String(value);
};

const changedPaths = (before?: Record<string, unknown>, after?: Record<string, unknown>) => {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])).slice(0, 250);
};

export const recordAuditEvent = async ({
  entityType,
  entityId,
  action,
  before,
  after,
  required = false,
  session,
}: {
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  required?: boolean;
  session?: ClientSession;
}) => {
  const context = getAuditContext();
  const safeBefore = before ? sanitize(before) : undefined;
  const safeAfter = after ? sanitize(after) : undefined;
  try {
    await AuditEvent.create([{
      entityType,
      entityId,
      action,
      before: safeBefore,
      after: safeAfter,
      changedPaths: changedPaths(safeBefore, safeAfter),
      actorId: context?.actor?.id,
      actorEmail: context?.actor?.email,
      actorName: context?.actor?.name,
      actorRole: context?.actor?.role,
      requestId: context?.requestId,
    }], session ? { session } : undefined);
  } catch (error) {
    console.error("Audit event write failed:", error instanceof Error ? error.message : "unknown_error");
    if (required) throw error;
  }
};

export const safeAuditSnapshot = (value: unknown) => sanitize(value) as Record<string, unknown>;
