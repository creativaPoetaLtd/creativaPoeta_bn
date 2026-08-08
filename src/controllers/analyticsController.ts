import { NextFunction, Request, Response } from "express";
import AnalyticsEvent, { AnalyticsEventType } from "../models/AnalyticsEvent";
import AnalyticsSession from "../models/AnalyticsSession";
import AnalyticsVisitor from "../models/AnalyticsVisitor";

const MAX_EVENTS_PER_REQUEST = 20;
const MAX_REQUESTS_PER_MINUTE = 120;
const allowedEventTypes = new Set<AnalyticsEventType>([
  "page_view",
  "engagement",
  "scroll",
  "click",
  "form",
  "conversion",
  "web_vital",
  "error",
  "api_error",
  "not_found",
]);

const defaultAllowedOrigins = [
  "https://creativapoeta.com",
  "https://www.creativapoeta.com",
  "https://be.creativapoeta.com",
  "https://fr.creativapoeta.com",
  "https://rw.creativapoeta.com",
  "https://nl.creativapoeta.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const allowedOrigins = new Set(
  (process.env.ANALYTICS_ALLOWED_ORIGINS || defaultAllowedOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean)
);

const requestsByClient = new Map<string, { count: number; resetAt: number }>();

const consumeCollectionRateLimit = (clientKey: string) => {
  const now = Date.now();
  const current = requestsByClient.get(clientKey);
  if (!current || current.resetAt <= now) {
    requestsByClient.set(clientKey, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_MINUTE) return false;
  current.count += 1;

  if (requestsByClient.size > 5_000) {
    for (const [key, value] of requestsByClient.entries()) {
      if (value.resetAt <= now) requestsByClient.delete(key);
    }
  }
  return true;
};

const safeText = (value: unknown, maxLength: number) =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";

const redactSensitiveText = (value: unknown, maxLength: number) =>
  safeText(value, maxLength)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[phone]")
    .replace(/([?&](?:token|key|secret|password|email)=)[^&#\s]+/gi, "$1[redacted]");

const safeNumber = (value: unknown, min: number, max: number) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, number));
};

const safeId = (value: unknown) => {
  const id = safeText(value, 80);
  return /^[a-zA-Z0-9_-]{12,80}$/.test(id) ? id : "";
};

const safePath = (value: unknown) => {
  const path = safeText(value, 1_000);
  if (!path) return "/";
  try {
    const parsed = new URL(path, "https://creativapoeta.com");
    return `${parsed.pathname || "/"}`.slice(0, 500);
  } catch {
    return path.startsWith("/") ? path.slice(0, 500) : "/";
  }
};

const safeTarget = (value: unknown) => {
  const target = safeText(value, 1_000);
  if (!target) return undefined;
  try {
    const parsed = new URL(target, "https://creativapoeta.com");
    const host = parsed.hostname === "creativapoeta.com" ? "" : parsed.hostname;
    return `${host}${parsed.pathname || "/"}`.slice(0, 300);
  } catch {
    return target.split(/[?#]/)[0].slice(0, 300);
  }
};

const decodeHeader = (value: string | undefined, maxLength: number) => {
  if (!value) return undefined;
  try {
    return safeText(decodeURIComponent(value), maxLength) || undefined;
  } catch {
    return safeText(value, maxLength) || undefined;
  }
};

const getRequestGeo = (req: Request) => ({
  continent: safeText(req.get("x-vercel-ip-continent"), 4).toUpperCase() || undefined,
  country: safeText(req.get("x-vercel-ip-country"), 4).toUpperCase() || undefined,
  region: safeText(req.get("x-vercel-ip-country-region"), 12).toUpperCase() || undefined,
  city: decodeHeader(req.get("x-vercel-ip-city"), 120),
});

const getBotInfo = (req: Request) => {
  const userAgent = safeText(req.get("user-agent"), 500).toLowerCase();
  const knownBot = userAgent.match(
    /(googlebot|bingbot|yandexbot|baiduspider|duckduckbot|facebookexternalhit|linkedinbot|twitterbot|slurp|semrushbot|ahrefsbot|mj12bot|crawler|spider|bot)/
  )?.[1];
  return {
    isBot: Boolean(knownBot),
    botName: knownBot ? safeText(knownBot, 40) : undefined,
  };
};

const getClientKey = (req: Request) =>
  safeText(req.get("x-vercel-forwarded-for") || req.get("x-forwarded-for") || req.ip || "unknown", 120)
    .split(",")[0]
    .trim();

const isAllowedOrigin = (req: Request) => {
  const origin = safeText(req.get("origin"), 300).replace(/\/$/, "");
  return !origin || allowedOrigins.has(origin);
};

const normalizeOccurredAt = (value: unknown) => {
  const date = new Date(typeof value === "string" || typeof value === "number" ? value : Date.now());
  const now = Date.now();
  if (
    Number.isNaN(date.getTime()) ||
    date.getTime() < now - 24 * 60 * 60 * 1_000 ||
    date.getTime() > now + 5 * 60 * 1_000
  ) {
    return new Date(now);
  }
  return date;
};

const normalizeProperties = (value: any) => ({
  label: redactSensitiveText(value?.label, 120) || undefined,
  target: safeTarget(value?.target),
  form: redactSensitiveText(value?.form, 120) || undefined,
  conversionType: redactSensitiveText(value?.conversionType, 80) || undefined,
  depth: safeNumber(value?.depth, 0, 100),
  durationMs: safeNumber(value?.durationMs, 0, 86_400_000),
  value: safeNumber(value?.value, -1_000_000_000, 1_000_000_000),
  metricName: safeText(value?.metricName, 20).toUpperCase() || undefined,
  metricValue: safeNumber(value?.metricValue, 0, 86_400_000),
  metricDelta: safeNumber(value?.metricDelta, 0, 86_400_000),
  metricRating: safeText(value?.metricRating, 24) || undefined,
  metricId: safeText(value?.metricId, 120) || undefined,
  errorMessage: redactSensitiveText(value?.errorMessage, 300) || undefined,
  errorSource: safeTarget(value?.errorSource),
  line: safeNumber(value?.line, 0, 10_000_000),
  column: safeNumber(value?.column, 0, 10_000_000),
  statusCode: safeNumber(value?.statusCode, 0, 999),
  endpoint: safeTarget(value?.endpoint),
});

const normalizeEvent = (
  raw: any,
  visitorId: string,
  sessionId: string,
  geo: ReturnType<typeof getRequestGeo>,
  bot: ReturnType<typeof getBotInfo>
) => {
  const eventId = safeId(raw?.eventId);
  const eventType = safeText(raw?.eventType, 30) as AnalyticsEventType;
  const eventName = redactSensitiveText(raw?.eventName, 80);
  if (!eventId || !allowedEventTypes.has(eventType) || !eventName) return null;

  return {
    eventId,
    visitorId,
    sessionId,
    eventType,
    eventName,
    occurredAt: normalizeOccurredAt(raw?.occurredAt),
    receivedAt: new Date(),
    path: safePath(raw?.path),
    pageTitle: redactSensitiveText(raw?.pageTitle, 200) || undefined,
    locale: safeText(raw?.locale, 12) || undefined,
    market: safeText(raw?.market, 24) || undefined,
    referrerHost: safeText(raw?.referrerHost, 255).toLowerCase() || undefined,
    trafficSource: redactSensitiveText(raw?.trafficSource, 120).toLowerCase() || undefined,
    trafficMedium: redactSensitiveText(raw?.trafficMedium, 80).toLowerCase() || undefined,
    utm: {
      source: redactSensitiveText(raw?.utm?.source, 120).toLowerCase() || undefined,
      medium: redactSensitiveText(raw?.utm?.medium, 80).toLowerCase() || undefined,
      campaign: redactSensitiveText(raw?.utm?.campaign, 160) || undefined,
      content: redactSensitiveText(raw?.utm?.content, 160) || undefined,
      term: redactSensitiveText(raw?.utm?.term, 160) || undefined,
    },
    device: {
      type: safeText(raw?.device?.type, 24).toLowerCase() || undefined,
      browser: safeText(raw?.device?.browser, 40) || undefined,
      os: safeText(raw?.device?.os, 40) || undefined,
      viewportWidth: safeNumber(raw?.device?.viewportWidth, 0, 20_000),
      viewportHeight: safeNumber(raw?.device?.viewportHeight, 0, 20_000),
      isBot: bot.isBot,
      botName: bot.botName,
    },
    geo,
    properties: normalizeProperties(raw?.properties),
  };
};

export const collectAnalyticsEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isAllowedOrigin(req)) {
      res.status(403).json({ message: "Analytics origin is not allowed." });
      return;
    }
    if (!consumeCollectionRateLimit(getClientKey(req))) {
      res.status(429).json({ message: "Too many analytics requests." });
      return;
    }
    if (req.body?.consent !== true) {
      res.status(400).json({ message: "Analytics consent is required." });
      return;
    }

    const visitorId = safeId(req.body?.visitorId);
    const sessionId = safeId(req.body?.sessionId);
    const rawEvents = Array.isArray(req.body?.events)
      ? req.body.events.slice(0, MAX_EVENTS_PER_REQUEST)
      : [];
    if (!visitorId || !sessionId || rawEvents.length === 0) {
      res.status(400).json({ message: "A valid analytics batch is required." });
      return;
    }

    const geo = getRequestGeo(req);
    const bot = getBotInfo(req);
    const normalizedEvents = rawEvents
      .map((event: any) => normalizeEvent(event, visitorId, sessionId, geo, bot))
      .filter(Boolean) as any[];
    if (normalizedEvents.length === 0) {
      res.status(400).json({ message: "No valid analytics event was provided." });
      return;
    }

    const existingIds = new Set(
      (
        await AnalyticsEvent.find({
          eventId: { $in: normalizedEvents.map((event) => event.eventId) },
        })
          .select("eventId")
          .lean()
      ).map((event) => event.eventId)
    );
    const freshEvents = normalizedEvents.filter((event) => !existingIds.has(event.eventId));
    if (freshEvents.length === 0) {
      res.status(202).json({ accepted: 0, duplicates: normalizedEvents.length });
      return;
    }

    const [existingVisitor, existingSession] = await Promise.all([
      AnalyticsVisitor.exists({ visitorId }),
      AnalyticsSession.exists({ sessionId }),
    ]);

    const bulkResult = await AnalyticsEvent.bulkWrite(
      freshEvents.map((event) => ({
        updateOne: {
          filter: { eventId: event.eventId },
          update: { $setOnInsert: event },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    const accepted = bulkResult.upsertedCount;
    const acceptedIndexes = new Set(
      Object.keys(bulkResult.upsertedIds || {}).map((index) => Number(index))
    );
    const acceptedEvents = freshEvents.filter((_event, index) => acceptedIndexes.has(index));
    if (acceptedEvents.length === 0) {
      res.status(202).json({ accepted: 0, duplicates: normalizedEvents.length });
      return;
    }
    const firstEvent = acceptedEvents[0];
    const lastEvent = acceptedEvents[acceptedEvents.length - 1];
    const lastSeenAt = acceptedEvents.reduce(
      (latest, event) => (event.occurredAt > latest ? event.occurredAt : latest),
      firstEvent.occurredAt
    );
    const pageViewCount = acceptedEvents.filter((event) => event.eventType === "page_view").length;
    const engagementMs = acceptedEvents.reduce(
      (total, event) => total + (event.eventType === "engagement" ? Number(event.properties.durationMs || 0) : 0),
      0
    );

    await Promise.all([
      AnalyticsVisitor.updateOne(
        { visitorId },
        {
          $setOnInsert: {
            visitorId,
            firstSeenAt: firstEvent.occurredAt,
            firstLocale: firstEvent.locale,
            firstMarket: firstEvent.market,
            firstCountry: geo.country,
          },
          $set: {
            lastSeenAt,
            lastLocale: lastEvent.locale,
            lastMarket: lastEvent.market,
            lastCountry: geo.country,
          },
          $inc: {
            sessionCount: existingSession ? 0 : 1,
            pageViewCount,
            eventCount: accepted,
          },
        },
        { upsert: true }
      ),
      AnalyticsSession.updateOne(
        { sessionId },
        {
          $setOnInsert: {
            sessionId,
            visitorId,
            startedAt: firstEvent.occurredAt,
            landingPath: firstEvent.path,
            referrerHost: firstEvent.referrerHost,
            trafficSource: firstEvent.trafficSource,
            trafficMedium: firstEvent.trafficMedium,
            campaign: firstEvent.utm?.campaign,
            country: geo.country,
            region: geo.region,
            city: geo.city,
            deviceType: firstEvent.device?.type,
            browser: firstEvent.device?.browser,
            os: firstEvent.device?.os,
            isBot: bot.isBot,
            botName: bot.botName,
            isNewVisitor: !existingVisitor,
          },
          $set: {
            lastSeenAt,
            exitPath: lastEvent.path,
            locale: lastEvent.locale,
            market: lastEvent.market,
          },
          $inc: {
            pageViewCount,
            eventCount: accepted,
            engagementMs,
          },
        },
        { upsert: true }
      ),
    ]);

    res.status(202).json({
      accepted,
      duplicates: normalizedEvents.length - accepted,
    });
  } catch (error) {
    next(error);
  }
};

export const getAnalyticsCollectionHealth = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const [latestEvent, eventsLast24h, sessionsLast24h, visitorsLast24h] = await Promise.all([
      AnalyticsEvent.findOne().sort({ receivedAt: -1 }).select("receivedAt eventType eventName path").lean(),
      AnalyticsEvent.countDocuments({ receivedAt: { $gte: since } }),
      AnalyticsSession.countDocuments({ lastSeenAt: { $gte: since } }),
      AnalyticsVisitor.countDocuments({ lastSeenAt: { $gte: since } }),
    ]);

    res.status(200).json({
      enabled: true,
      retentionDays: Number.isFinite(Number(process.env.ANALYTICS_RETENTION_DAYS || 395))
        ? Math.max(30, Number(process.env.ANALYTICS_RETENTION_DAYS || 395))
        : 395,
      eventsLast24h,
      sessionsLast24h,
      visitorsLast24h,
      latestEvent,
    });
  } catch (error) {
    next(error);
  }
};
