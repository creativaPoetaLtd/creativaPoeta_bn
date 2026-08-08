import AnalyticsEvent from "../models/AnalyticsEvent";
import AnalyticsSession from "../models/AnalyticsSession";
import AnalyticsServerMetric from "../models/AnalyticsServerMetric";
import { getSearchConsoleReport } from "./searchConsoleService";
import { evaluateAnalyticsAnomalies } from "./analyticsAnomalyService";

type DateRange = {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  days: number;
};

type SummaryMetrics = {
  visitors: number;
  sessions: number;
  pageViews: number;
  activeVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  engagedSessions: number;
  engagementRate: number;
  bounceRate: number;
  averageEngagementSeconds: number;
  conversions: number;
  convertedSessions: number;
  conversionRate: number;
  botSessions: number;
  errors: number;
};

const humanSessionFilter = {
  $or: [{ isBot: false }, { isBot: { $exists: false } }],
};

const humanEventFilter = {
  $or: [{ "device.isBot": false }, { "device.isBot": { $exists: false } }],
};

const round = (value: number, precision = 1) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const percentage = (value: number, total: number) =>
  total > 0 ? round((value / total) * 100) : 0;

const changePercentage = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round(((current - previous) / previous) * 100);
};

export const resolveAnalyticsDateRange = (query: Record<string, unknown>): DateRange => {
  const requestedDays = Math.min(395, Math.max(1, Number(query.days) || 30));
  const customFrom = typeof query.from === "string" ? new Date(query.from) : null;
  const customTo = typeof query.to === "string" ? new Date(query.to) : null;
  const to = customTo && !Number.isNaN(customTo.getTime()) ? customTo : new Date();
  if (customTo && !Number.isNaN(customTo.getTime())) to.setHours(23, 59, 59, 999);

  const earliestAllowed = new Date(to.getTime() - 395 * 24 * 60 * 60 * 1_000);
  let from = customFrom && !Number.isNaN(customFrom.getTime())
    ? customFrom
    : new Date(to.getTime() - requestedDays * 24 * 60 * 60 * 1_000);
  if (from < earliestAllowed) from = earliestAllowed;
  if (from > to) from = new Date(to.getTime() - requestedDays * 24 * 60 * 60 * 1_000);
  if (customFrom && !Number.isNaN(customFrom.getTime())) from.setHours(0, 0, 0, 0);

  const duration = Math.max(1, to.getTime() - from.getTime());
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - duration);
  const days = Math.max(1, Math.ceil(duration / (24 * 60 * 60 * 1_000)));

  return { from, to, previousFrom, previousTo, days };
};

const getSummary = async (from: Date, to: Date, includeActive = false): Promise<SummaryMetrics> => {
  const sessionRange = { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter };
  const eventRange = { occurredAt: { $gte: from, $lte: to }, ...humanEventFilter };
  const [
    visitorIds,
    sessions,
    newVisitorIds,
    engagementRows,
    pageViews,
    conversions,
    convertedSessionIds,
    botSessions,
    errors,
    activeVisitorIds,
  ] = await Promise.all([
    AnalyticsSession.distinct("visitorId", sessionRange),
    AnalyticsSession.countDocuments(sessionRange),
    AnalyticsSession.distinct("visitorId", { ...sessionRange, isNewVisitor: true }),
    AnalyticsSession.aggregate([
      { $match: sessionRange },
      {
        $group: {
          _id: null,
          totalEngagementMs: { $sum: "$engagementMs" },
          engagedSessions: {
            $sum: {
              $cond: [
                { $or: [{ $gte: ["$engagementMs", 10_000] }, { $gte: ["$pageViewCount", 2] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    AnalyticsEvent.countDocuments({ ...eventRange, eventType: "page_view" }),
    AnalyticsEvent.countDocuments({ ...eventRange, eventType: "conversion" }),
    AnalyticsEvent.distinct("sessionId", { ...eventRange, eventType: "conversion" }),
    AnalyticsSession.countDocuments({ startedAt: { $gte: from, $lte: to }, isBot: true }),
    AnalyticsEvent.countDocuments({
      ...eventRange,
      eventType: { $in: ["error", "api_error", "not_found"] },
    }),
    includeActive
      ? AnalyticsSession.distinct("visitorId", {
          lastSeenAt: { $gte: new Date(Date.now() - 5 * 60 * 1_000) },
          ...humanSessionFilter,
        })
      : Promise.resolve([]),
  ]);

  const visitors = visitorIds.length;
  const newVisitors = newVisitorIds.length;
  const engagedSessions = Number(engagementRows[0]?.engagedSessions || 0);
  const totalEngagementMs = Number(engagementRows[0]?.totalEngagementMs || 0);

  return {
    visitors,
    sessions,
    pageViews,
    activeVisitors: activeVisitorIds.length,
    newVisitors,
    returningVisitors: Math.max(0, visitors - newVisitors),
    engagedSessions,
    engagementRate: percentage(engagedSessions, sessions),
    bounceRate: percentage(Math.max(0, sessions - engagedSessions), sessions),
    averageEngagementSeconds: sessions > 0 ? round(totalEngagementMs / sessions / 1_000) : 0,
    conversions,
    convertedSessions: convertedSessionIds.length,
    conversionRate: percentage(convertedSessionIds.length, sessions),
    botSessions,
    errors,
  };
};

const getTimeline = async (from: Date, to: Date) => {
  const [sessionRows, eventRows] = await Promise.all([
    AnalyticsSession.aggregate([
      { $match: { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$startedAt", timezone: "UTC" } },
          sessions: { $sum: 1 },
          visitors: { $addToSet: "$visitorId" },
          newVisitors: { $sum: { $cond: ["$isNewVisitor", 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    AnalyticsEvent.aggregate([
      { $match: { occurredAt: { $gte: from, $lte: to }, ...humanEventFilter } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt", timezone: "UTC" } },
          pageViews: { $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] } },
          conversions: { $sum: { $cond: [{ $eq: ["$eventType", "conversion"] }, 1, 0] } },
          errors: {
            $sum: {
              $cond: [{ $in: ["$eventType", ["error", "api_error", "not_found"]] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const rows = new Map<string, any>();
  sessionRows.forEach((row) => {
    rows.set(row._id, {
      date: row._id,
      visitors: row.visitors.length,
      sessions: row.sessions,
      newVisitors: row.newVisitors,
      pageViews: 0,
      conversions: 0,
      errors: 0,
    });
  });
  eventRows.forEach((row) => {
    const current = rows.get(row._id) || {
      date: row._id,
      visitors: 0,
      sessions: 0,
      newVisitors: 0,
      pageViews: 0,
      conversions: 0,
      errors: 0,
    };
    rows.set(row._id, {
      ...current,
      pageViews: row.pageViews,
      conversions: row.conversions,
      errors: row.errors,
    });
  });

  const timeline = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const lastDate = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor <= lastDate) {
    const date = cursor.toISOString().slice(0, 10);
    timeline.push(
      rows.get(date) || {
        date,
        visitors: 0,
        sessions: 0,
        newVisitors: 0,
        pageViews: 0,
        conversions: 0,
        errors: 0,
      }
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return timeline;
};

const getBreakdown = async (
  field: string,
  from: Date,
  to: Date,
  limit = 12,
  extraMatch: Record<string, unknown> = {}
) => {
  const rows = await AnalyticsSession.aggregate([
    { $match: { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter, ...extraMatch } },
    { $group: { _id: { $ifNull: [`$${field}`, "Unknown"] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  return rows.map((row) => ({
    name: String(row._id || "Unknown"),
    count: Number(row.count || 0),
    percentage: percentage(Number(row.count || 0), total),
  }));
};

const getAudienceAndAcquisition = async (from: Date, to: Date) => {
  const [countries, regions, locales, markets, devices, browsers, operatingSystems, sources, mediums, campaigns, referrers] =
    await Promise.all([
      getBreakdown("country", from, to, 15),
      getBreakdown("region", from, to, 15),
      getBreakdown("locale", from, to, 10),
      getBreakdown("market", from, to, 10),
      getBreakdown("deviceType", from, to, 10),
      getBreakdown("browser", from, to, 10),
      getBreakdown("os", from, to, 10),
      getBreakdown("trafficSource", from, to, 15),
      getBreakdown("trafficMedium", from, to, 12),
      getBreakdown("campaign", from, to, 15, { campaign: { $nin: [null, ""] } }),
      getBreakdown("referrerHost", from, to, 15, { referrerHost: { $nin: [null, ""] } }),
    ]);

  return {
    audience: { countries, regions, locales, markets, devices, browsers, operatingSystems },
    acquisition: { sources, mediums, campaigns, referrers },
  };
};

const getContent = async (from: Date, to: Date) => {
  const [pageRows, engagementRows, exitRows, landingRows, scrollRows, sessionCount] = await Promise.all([
    AnalyticsEvent.aggregate([
      {
        $match: {
          occurredAt: { $gte: from, $lte: to },
          eventType: "page_view",
          ...humanEventFilter,
        },
      },
      {
        $group: {
          _id: "$path",
          views: { $sum: 1 },
          visitors: { $addToSet: "$visitorId" },
          sessions: { $addToSet: "$sessionId" },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 25 },
    ]),
    AnalyticsEvent.aggregate([
      {
        $match: {
          occurredAt: { $gte: from, $lte: to },
          eventType: "engagement",
          "properties.durationMs": { $gt: 0 },
          ...humanEventFilter,
        },
      },
      { $group: { _id: "$path", engagementMs: { $sum: "$properties.durationMs" } } },
    ]),
    AnalyticsSession.aggregate([
      { $match: { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter } },
      {
        $group: {
          _id: "$exitPath",
          exits: { $sum: 1 },
          visitors: { $addToSet: "$visitorId" },
        },
      },
      { $sort: { exits: -1 } },
    ]),
    AnalyticsSession.aggregate([
      { $match: { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter } },
      {
        $group: {
          _id: "$landingPath",
          sessions: { $sum: 1 },
          visitors: { $addToSet: "$visitorId" },
        },
      },
      { $sort: { sessions: -1 } },
      { $limit: 15 },
    ]),
    AnalyticsEvent.aggregate([
      {
        $match: {
          occurredAt: { $gte: from, $lte: to },
          eventType: "scroll",
          eventName: "scroll_depth",
          "properties.depth": { $in: [25, 50, 75, 90] },
          ...humanEventFilter,
        },
      },
      {
        $group: {
          _id: "$properties.depth",
          events: { $sum: 1 },
          sessions: { $addToSet: "$sessionId" },
          visitors: { $addToSet: "$visitorId" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    AnalyticsSession.countDocuments({
      startedAt: { $gte: from, $lte: to },
      ...humanSessionFilter,
    }),
  ]);

  const engagement = new Map(engagementRows.map((row) => [row._id, Number(row.engagementMs || 0)]));
  const exits = new Map(exitRows.map((row) => [row._id, Number(row.exits || 0)]));
  const pages = pageRows.map((row) => ({
    path: row._id || "/",
    views: Number(row.views || 0),
    visitors: row.visitors.length,
    sessions: row.sessions.length,
    exits: exits.get(row._id) || 0,
    exitRate: percentage(exits.get(row._id) || 0, row.sessions.length),
    averageEngagementSeconds:
      row.sessions.length > 0 ? round((engagement.get(row._id) || 0) / row.sessions.length / 1_000) : 0,
  }));

  return {
    pages,
    insights: {
      landingPages: landingRows.map((row) => ({
        path: row._id || "/",
        sessions: Number(row.sessions || 0),
        visitors: row.visitors.length,
        percentage: percentage(Number(row.sessions || 0), sessionCount),
      })),
      exitPages: exitRows.slice(0, 15).map((row) => ({
        path: row._id || "/",
        exits: Number(row.exits || 0),
        visitors: row.visitors.length,
        percentage: percentage(Number(row.exits || 0), sessionCount),
      })),
      scrollDepth: scrollRows.map((row) => ({
        depth: Number(row._id || 0),
        events: Number(row.events || 0),
        sessions: row.sessions.length,
        visitors: row.visitors.length,
        percentage: percentage(row.sessions.length, sessionCount),
      })),
    },
  };
};

const getConversions = async (from: Date, to: Date) => {
  const eventRange = { occurredAt: { $gte: from, $lte: to }, ...humanEventFilter };
  const [rows, formStarts, formAttempts, attributionRows, formRows] = await Promise.all([
    AnalyticsEvent.aggregate([
      { $match: { ...eventRange, eventType: "conversion" } },
      {
        $group: {
          _id: { $ifNull: ["$properties.conversionType", "$eventName"] },
          count: { $sum: 1 },
          visitors: { $addToSet: "$visitorId" },
          sessions: { $addToSet: "$sessionId" },
        },
      },
      { $sort: { count: -1 } },
    ]),
    AnalyticsEvent.countDocuments({ ...eventRange, eventType: "form", eventName: "form_start" }),
    AnalyticsEvent.countDocuments({
      ...eventRange,
      eventType: "form",
      eventName: "form_submit_attempt",
    }),
    AnalyticsSession.aggregate([
      { $match: { startedAt: { $gte: from, $lte: to }, ...humanSessionFilter } },
      {
        $lookup: {
          from: AnalyticsEvent.collection.name,
          let: { currentSessionId: "$sessionId" },
          pipeline: [
            {
              $match: {
                eventType: "conversion",
                occurredAt: { $gte: from, $lte: to },
                ...humanEventFilter,
                $expr: { $eq: ["$sessionId", "$$currentSessionId"] },
              },
            },
            { $project: { _id: 1 } },
          ],
          as: "conversionEvents",
        },
      },
      { $set: { conversionCount: { $size: "$conversionEvents" } } },
      {
        $facet: {
          sources: [
            {
              $group: {
                _id: { $ifNull: ["$trafficSource", "direct"] },
                sessions: { $sum: 1 },
                visitors: { $addToSet: "$visitorId" },
                convertedSessions: { $sum: { $cond: [{ $gt: ["$conversionCount", 0] }, 1, 0] } },
                conversions: { $sum: "$conversionCount" },
              },
            },
            { $sort: { convertedSessions: -1, sessions: -1 } },
            { $limit: 12 },
          ],
          devices: [
            {
              $group: {
                _id: { $ifNull: ["$deviceType", "unknown"] },
                sessions: { $sum: 1 },
                visitors: { $addToSet: "$visitorId" },
                convertedSessions: { $sum: { $cond: [{ $gt: ["$conversionCount", 0] }, 1, 0] } },
                conversions: { $sum: "$conversionCount" },
              },
            },
            { $sort: { convertedSessions: -1, sessions: -1 } },
            { $limit: 8 },
          ],
          countries: [
            {
              $group: {
                _id: { $ifNull: ["$country", "unknown"] },
                sessions: { $sum: 1 },
                visitors: { $addToSet: "$visitorId" },
                convertedSessions: { $sum: { $cond: [{ $gt: ["$conversionCount", 0] }, 1, 0] } },
                conversions: { $sum: "$conversionCount" },
              },
            },
            { $sort: { convertedSessions: -1, sessions: -1 } },
            { $limit: 12 },
          ],
          landingPages: [
            {
              $group: {
                _id: { $ifNull: ["$landingPath", "/"] },
                sessions: { $sum: 1 },
                visitors: { $addToSet: "$visitorId" },
                convertedSessions: { $sum: { $cond: [{ $gt: ["$conversionCount", 0] }, 1, 0] } },
                conversions: { $sum: "$conversionCount" },
              },
            },
            { $sort: { convertedSessions: -1, sessions: -1 } },
            { $limit: 12 },
          ],
        },
      },
    ]),
    AnalyticsEvent.aggregate([
      {
        $match: {
          ...eventRange,
          eventType: "form",
          eventName: { $in: ["form_start", "form_submit_attempt"] },
          "properties.form": { $nin: [null, ""] },
        },
      },
      {
        $group: {
          _id: { form: "$properties.form", eventName: "$eventName" },
          events: { $sum: 1 },
          sessions: { $addToSet: "$sessionId" },
        },
      },
      { $sort: { events: -1 } },
    ]),
  ]);
  const conversions = rows.map((row) => ({
    name: String(row._id || "other"),
    count: Number(row.count || 0),
    visitors: row.visitors.length,
    sessions: row.sessions.length,
  }));

  const mapAttribution = (attribution: any[] = []) => attribution.map((row) => ({
    name: String(row._id || "unknown"),
    sessions: Number(row.sessions || 0),
    visitors: row.visitors.length,
    convertedSessions: Number(row.convertedSessions || 0),
    conversions: Number(row.conversions || 0),
    conversionRate: percentage(Number(row.convertedSessions || 0), Number(row.sessions || 0)),
  }));
  const attribution = attributionRows[0] || {};
  const forms = new Map<string, {
    form: string;
    startEvents: number;
    attemptEvents: number;
    startedSessions: number;
    attemptedSessions: number;
    attemptRate: number;
  }>();
  formRows.forEach((row) => {
    const form = String(row._id?.form || "unknown");
    const item = forms.get(form) || {
      form,
      startEvents: 0,
      attemptEvents: 0,
      startedSessions: 0,
      attemptedSessions: 0,
      attemptRate: 0,
    };
    if (row._id?.eventName === "form_start") {
      item.startEvents = Number(row.events || 0);
      item.startedSessions = row.sessions.length;
    } else {
      item.attemptEvents = Number(row.events || 0);
      item.attemptedSessions = row.sessions.length;
    }
    forms.set(form, item);
  });
  const formItems = Array.from(forms.values())
    .map((item) => ({
      ...item,
      attemptRate: percentage(item.attemptedSessions, item.startedSessions),
    }))
    .sort((left, right) => right.startedSessions - left.startedSessions);

  return {
    items: conversions,
    funnel: {
      formStarts,
      formSubmitAttempts: formAttempts,
      successfulConversions: conversions.reduce((sum, row) => sum + row.count, 0),
    },
    forms: formItems,
    attribution: {
      sources: mapAttribution(attribution.sources),
      devices: mapAttribution(attribution.devices),
      countries: mapAttribution(attribution.countries),
      landingPages: mapAttribution(attribution.landingPages),
    },
  };
};

const percentile = (values: number[], target: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * target) - 1)];
};

const getPerformance = async (from: Date, to: Date) => {
  const events = await AnalyticsEvent.find({
    occurredAt: { $gte: from, $lte: to },
    eventType: "web_vital",
    ...humanEventFilter,
  })
    .select("properties.metricName properties.metricValue properties.metricRating device.type")
    .sort({ occurredAt: -1 })
    .limit(50_000)
    .lean();

  const groups = new Map<string, { metric: string; device: string; values: number[]; ratings: string[] }>();
  events.forEach((event: any) => {
    const metric = String(event.properties?.metricName || "Unknown").toUpperCase();
    const device = String(event.device?.type || "unknown");
    const value = Number(event.properties?.metricValue);
    if (!Number.isFinite(value)) return;
    const key = `${metric}:${device}`;
    const group = groups.get(key) || { metric, device, values: [], ratings: [] };
    group.values.push(value);
    group.ratings.push(String(event.properties?.metricRating || "unknown"));
    groups.set(key, group);
  });

  const byDevice = Array.from(groups.values()).map((group) => ({
    metric: group.metric,
    device: group.device,
    samples: group.values.length,
    average: round(group.values.reduce((sum, value) => sum + value, 0) / group.values.length, 2),
    p75: round(percentile(group.values, 0.75), 2),
    good: group.ratings.filter((rating) => rating === "good").length,
    needsImprovement: group.ratings.filter((rating) => rating === "needs-improvement").length,
    poor: group.ratings.filter((rating) => rating === "poor").length,
  }));

  const overallGroups = new Map<string, { values: number[]; ratings: string[] }>();
  Array.from(groups.values()).forEach((group) => {
    const current = overallGroups.get(group.metric) || { values: [], ratings: [] };
    current.values.push(...group.values);
    current.ratings.push(...group.ratings);
    overallGroups.set(group.metric, current);
  });
  const overall = Array.from(overallGroups.entries()).map(([metric, group]) => ({
    metric,
    samples: group.values.length,
    average: round(group.values.reduce((sum, value) => sum + value, 0) / group.values.length, 2),
    p75: round(percentile(group.values, 0.75), 2),
    good: group.ratings.filter((rating) => rating === "good").length,
    needsImprovement: group.ratings.filter((rating) => rating === "needs-improvement").length,
    poor: group.ratings.filter((rating) => rating === "poor").length,
  }));

  return { overall, byDevice, sampleLimitReached: events.length === 50_000 };
};

const getServerBucketRange = (from: Date, to: Date) => {
  const bucketFrom = new Date(from);
  const startsInsideBucket =
    bucketFrom.getUTCMinutes() !== 0 ||
    bucketFrom.getUTCSeconds() !== 0 ||
    bucketFrom.getUTCMilliseconds() !== 0;
  bucketFrom.setUTCMinutes(0, 0, 0);
  if (startsInsideBucket) bucketFrom.setUTCHours(bucketFrom.getUTCHours() + 1);
  const bucketTo = new Date(to);
  bucketTo.setUTCMinutes(0, 0, 0);
  return { bucketFrom, bucketTo };
};

const getServerMetricTotals = async (from: Date, to: Date) => {
  const { bucketFrom, bucketTo } = getServerBucketRange(from, to);
  const rows = await AnalyticsServerMetric.aggregate([
    { $match: { bucketStart: { $gte: bucketFrom, $lte: bucketTo } } },
    {
      $group: {
        _id: null,
        serverErrors: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$metricType", "api_request"] }, { $gte: ["$statusCode", 500] }] },
              "$count",
              0,
            ],
          },
        },
        authDenied: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$metricType", "auth_attempt"] }, { $eq: ["$outcome", "denied"] }] },
              "$count",
              0,
            ],
          },
        },
        formFailures: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$metricType", "form_submission"] }, { $eq: ["$outcome", "failed"] }] },
              "$count",
              0,
            ],
          },
        },
        spamBlocked: {
          $sum: { $cond: [{ $eq: ["$metricType", "spam_blocked"] }, "$count", 0] },
        },
        botRequests: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$metricType", "api_request"] }, { $eq: ["$isBot", true] }] },
              "$count",
              0,
            ],
          },
        },
      },
    },
  ]);

  return {
    serverErrors: Number(rows[0]?.serverErrors || 0),
    authDenied: Number(rows[0]?.authDenied || 0),
    formFailures: Number(rows[0]?.formFailures || 0),
    spamBlocked: Number(rows[0]?.spamBlocked || 0),
    botRequests: Number(rows[0]?.botRequests || 0),
  };
};

const getServerHealth = async (from: Date, to: Date, previousFrom: Date, previousTo: Date) => {
  const { bucketFrom, bucketTo } = getServerBucketRange(from, to);
  const metricRange = { bucketStart: { $gte: bucketFrom, $lte: bucketTo } };
  const [
    apiRows,
    statusRows,
    failingRouteRows,
    authRows,
    formRows,
    spamRows,
    botRows,
    timelineRows,
    currentTotals,
    previousTotals,
    lastMetric,
  ] = await Promise.all([
    AnalyticsServerMetric.aggregate([
      { $match: { ...metricRange, metricType: "api_request" } },
      {
        $group: {
          _id: null,
          requests: { $sum: "$count" },
          durationTotalMs: { $sum: "$durationTotalMs" },
          durationMaxMs: { $max: "$durationMaxMs" },
          successfulResponses: {
            $sum: { $cond: [{ $and: [{ $gte: ["$statusCode", 200] }, { $lt: ["$statusCode", 400] }] }, "$count", 0] },
          },
          clientErrors: {
            $sum: { $cond: [{ $and: [{ $gte: ["$statusCode", 400] }, { $lt: ["$statusCode", 500] }] }, "$count", 0] },
          },
          serverErrors: { $sum: { $cond: [{ $gte: ["$statusCode", 500] }, "$count", 0] } },
          notFoundResponses: { $sum: { $cond: [{ $eq: ["$statusCode", 404] }, "$count", 0] } },
          botRequests: { $sum: { $cond: ["$isBot", "$count", 0] } },
        },
      },
    ]),
    AnalyticsServerMetric.aggregate([
      { $match: { ...metricRange, metricType: "api_request" } },
      { $group: { _id: "$statusCode", count: { $sum: "$count" } } },
      { $sort: { count: -1 } },
    ]),
    AnalyticsServerMetric.aggregate([
      { $match: { ...metricRange, metricType: "api_request", statusCode: { $gte: 400 } } },
      { $group: { _id: { route: "$route", statusCode: "$statusCode" }, count: { $sum: "$count" } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    AnalyticsServerMetric.aggregate([
      { $match: { ...metricRange, metricType: "auth_attempt" } },
      { $group: { _id: { outcome: "$outcome", isBot: "$isBot" }, count: { $sum: "$count" } } },
    ]),
    AnalyticsServerMetric.aggregate([
      { $match: { ...metricRange, metricType: "form_submission" } },
      { $group: { _id: { category: "$category", outcome: "$outcome" }, count: { $sum: "$count" } } },
      { $sort: { count: -1 } },
    ]),
    AnalyticsServerMetric.aggregate([
      { $match: { ...metricRange, metricType: "spam_blocked" } },
      { $group: { _id: "$category", count: { $sum: "$count" } } },
      { $sort: { count: -1 } },
    ]),
    AnalyticsServerMetric.aggregate([
      { $match: { ...metricRange, metricType: "api_request", isBot: true } },
      { $group: { _id: "$botName", count: { $sum: "$count" } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    AnalyticsServerMetric.aggregate([
      { $match: metricRange },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$bucketStart", timezone: "UTC" } },
          requests: { $sum: { $cond: [{ $eq: ["$metricType", "api_request"] }, "$count", 0] } },
          serverErrors: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$metricType", "api_request"] }, { $gte: ["$statusCode", 500] }] },
                "$count",
                0,
              ],
            },
          },
          notFound: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$metricType", "api_request"] }, { $eq: ["$statusCode", 404] }] },
                "$count",
                0,
              ],
            },
          },
          authDenied: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$metricType", "auth_attempt"] }, { $eq: ["$outcome", "denied"] }] },
                "$count",
                0,
              ],
            },
          },
          formFailures: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$metricType", "form_submission"] }, { $eq: ["$outcome", "failed"] }] },
                "$count",
                0,
              ],
            },
          },
          spamBlocked: { $sum: { $cond: [{ $eq: ["$metricType", "spam_blocked"] }, "$count", 0] } },
          botRequests: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$metricType", "api_request"] }, { $eq: ["$isBot", true] }] },
                "$count",
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    getServerMetricTotals(from, to),
    getServerMetricTotals(previousFrom, previousTo),
    AnalyticsServerMetric.findOne().sort({ lastOccurredAt: -1 }).select("lastOccurredAt").lean(),
  ]);

  const api = apiRows[0] || {};
  const requests = Number(api.requests || 0);
  const authSuccessful = authRows
    .filter((row) => row._id.outcome === "success")
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  const authDenied = authRows
    .filter((row) => row._id.outcome === "denied")
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  const authBotAttempts = authRows
    .filter((row) => row._id.isBot)
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  const formItems = new Map<string, { type: string; attempts: number; successful: number; failed: number }>();
  formRows.forEach((row) => {
    const type = String(row._id.category || "other");
    const current = formItems.get(type) || { type, attempts: 0, successful: 0, failed: 0 };
    const count = Number(row.count || 0);
    current.attempts += count;
    if (row._id.outcome === "success") current.successful += count;
    if (row._id.outcome === "failed") current.failed += count;
    formItems.set(type, current);
  });

  return {
    api: {
      requests,
      successfulResponses: Number(api.successfulResponses || 0),
      clientErrors: Number(api.clientErrors || 0),
      serverErrors: Number(api.serverErrors || 0),
      notFoundResponses: Number(api.notFoundResponses || 0),
      botRequests: Number(api.botRequests || 0),
      observedAvailability: requests > 0
        ? round(((requests - Number(api.serverErrors || 0)) / requests) * 100, 2)
        : 0,
      averageResponseMs: requests > 0 ? round(Number(api.durationTotalMs || 0) / requests) : 0,
      maximumResponseMs: round(Number(api.durationMaxMs || 0)),
      statuses: statusRows.map((row) => ({ status: Number(row._id || 0), count: Number(row.count || 0) })),
      failingRoutes: failingRouteRows.map((row) => ({
        route: String(row._id.route || "unknown"),
        status: Number(row._id.statusCode || 0),
        count: Number(row.count || 0),
      })),
    },
    auth: {
      attempts: authSuccessful + authDenied,
      successful: authSuccessful,
      denied: authDenied,
      botAttempts: authBotAttempts,
    },
    forms: {
      attempts: Array.from(formItems.values()).reduce((sum, item) => sum + item.attempts, 0),
      successful: Array.from(formItems.values()).reduce((sum, item) => sum + item.successful, 0),
      failed: Array.from(formItems.values()).reduce((sum, item) => sum + item.failed, 0),
      byType: Array.from(formItems.values()),
    },
    spam: {
      blocked: spamRows.reduce((sum, row) => sum + Number(row.count || 0), 0),
      byRule: spamRows.map((row) => ({ name: String(row._id || "other"), count: Number(row.count || 0) })),
    },
    bots: botRows.map((row) => ({ name: String(row._id || "unknown"), count: Number(row.count || 0) })),
    timeline: timelineRows.map((row) => ({
      date: row._id,
      requests: Number(row.requests || 0),
      serverErrors: Number(row.serverErrors || 0),
      notFound: Number(row.notFound || 0),
      authDenied: Number(row.authDenied || 0),
      formFailures: Number(row.formFailures || 0),
      spamBlocked: Number(row.spamBlocked || 0),
      botRequests: Number(row.botRequests || 0),
    })),
    comparison: Object.fromEntries(
      Object.entries(currentTotals).map(([key, value]) => [
        key,
        changePercentage(Number(value || 0), Number(previousTotals[key as keyof typeof previousTotals] || 0)),
      ])
    ),
    lastMetricAt: lastMetric?.lastOccurredAt || null,
  };
};

const getHealth = async (from: Date, to: Date, previousFrom: Date, previousTo: Date) => {
  const eventRange = { occurredAt: { $gte: from, $lte: to }, ...humanEventFilter };
  const [errorRows, statusRows, botRows, lastEvent, server, incidents] = await Promise.all([
    AnalyticsEvent.aggregate([
      { $match: { ...eventRange, eventType: { $in: ["error", "api_error", "not_found"] } } },
      { $group: { _id: "$eventName", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    AnalyticsEvent.aggregate([
      { $match: { ...eventRange, eventType: "api_error" } },
      { $group: { _id: { $ifNull: ["$properties.statusCode", 0] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    AnalyticsSession.aggregate([
      { $match: { startedAt: { $gte: from, $lte: to }, isBot: true } },
      { $group: { _id: { $ifNull: ["$botName", "unknown"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    AnalyticsEvent.findOne().sort({ receivedAt: -1 }).select("receivedAt eventName").lean(),
    getServerHealth(from, to, previousFrom, previousTo),
    evaluateAnalyticsAnomalies(),
  ]);

  return {
    errorsByType: errorRows.map((row) => ({ name: row._id, count: Number(row.count || 0) })),
    apiErrorsByStatus: statusRows.map((row) => ({ status: Number(row._id || 0), count: Number(row.count || 0) })),
    bots: botRows.map((row) => ({ name: row._id, count: Number(row.count || 0) })),
    lastEventAt: lastEvent?.receivedAt || null,
    server,
    incidents,
  };
};

export const buildAnalyticsOverview = async (range: DateRange) => {
  const [summary, previousSummary, timeline, audienceAcquisition, content, conversions, performance, health, seo] =
    await Promise.all([
      getSummary(range.from, range.to, true),
      getSummary(range.previousFrom, range.previousTo),
      getTimeline(range.from, range.to),
      getAudienceAndAcquisition(range.from, range.to),
      getContent(range.from, range.to),
      getConversions(range.from, range.to),
      getPerformance(range.from, range.to),
      getHealth(range.from, range.to, range.previousFrom, range.previousTo),
      getSearchConsoleReport(range.from, range.to),
    ]);

  const comparison = Object.fromEntries(
    Object.entries(summary)
      .filter(([key]) => key !== "activeVisitors")
      .map(([key, value]) => [
        key,
        changePercentage(Number(value || 0), Number(previousSummary[key as keyof SummaryMetrics] || 0)),
      ])
  );

  return {
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      previousFrom: range.previousFrom.toISOString(),
      previousTo: range.previousTo.toISOString(),
      days: range.days,
    },
    summary,
    comparison,
    timeline,
    ...audienceAcquisition,
    content: content.pages,
    contentInsights: content.insights,
    conversions,
    performance,
    health,
    seo,
  };
};

export const getRealtimeAnalytics = async () => {
  const generatedAt = new Date();
  const windowMinutes = 5;
  const activeSince = new Date(generatedAt.getTime() - windowMinutes * 60_000);
  const [result] = await AnalyticsSession.aggregate([
    {
      $match: {
        lastSeenAt: { $gte: activeSince, $lte: generatedAt },
        ...humanSessionFilter,
      },
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              visitors: { $addToSet: "$visitorId" },
              sessions: { $sum: 1 },
              newVisitors: {
                $addToSet: { $cond: ["$isNewVisitor", "$visitorId", null] },
              },
              lastActivityAt: { $max: "$lastSeenAt" },
            },
          },
        ],
        pages: [
          {
            $group: {
              _id: { $ifNull: ["$exitPath", "/"] },
              sessions: { $sum: 1 },
              visitors: { $addToSet: "$visitorId" },
            },
          },
          { $sort: { sessions: -1 } },
          { $limit: 10 },
        ],
        countries: [
          {
            $group: {
              _id: { $ifNull: ["$country", "unknown"] },
              sessions: { $sum: 1 },
              visitors: { $addToSet: "$visitorId" },
            },
          },
          { $sort: { sessions: -1 } },
          { $limit: 10 },
        ],
        devices: [
          {
            $group: {
              _id: { $ifNull: ["$deviceType", "unknown"] },
              sessions: { $sum: 1 },
              visitors: { $addToSet: "$visitorId" },
            },
          },
          { $sort: { sessions: -1 } },
          { $limit: 6 },
        ],
        sources: [
          {
            $group: {
              _id: { $ifNull: ["$trafficSource", "direct"] },
              sessions: { $sum: 1 },
              visitors: { $addToSet: "$visitorId" },
            },
          },
          { $sort: { sessions: -1 } },
          { $limit: 10 },
        ],
      },
    },
  ]);

  const summary = result?.summary?.[0] || {};
  const mapBreakdown = (rows: any[] = []) => rows.map((row) => ({
    name: String(row._id || "unknown"),
    sessions: Number(row.sessions || 0),
    visitors: row.visitors.length,
  }));

  return {
    generatedAt,
    activeSince,
    windowMinutes,
    activeVisitors: summary.visitors?.length || 0,
    activeSessions: Number(summary.sessions || 0),
    newVisitors: Array.isArray(summary.newVisitors)
      ? summary.newVisitors.filter(Boolean).length
      : 0,
    lastActivityAt: summary.lastActivityAt || null,
    pages: mapBreakdown(result?.pages),
    countries: mapBreakdown(result?.countries),
    devices: mapBreakdown(result?.devices),
    sources: mapBreakdown(result?.sources),
  };
};
