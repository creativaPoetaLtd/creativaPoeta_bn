import AnalyticsServerMetric, {
  AnalyticsServerMetricType,
} from "../models/AnalyticsServerMetric";

export interface RecordServerMetricInput {
  metricType: AnalyticsServerMetricType;
  route?: string;
  method?: string;
  statusCode?: number;
  outcome?: string;
  category?: string;
  country?: string;
  isBot?: boolean;
  botName?: string;
  durationMs?: number;
  occurredAt?: Date;
}

const cleanDimension = (value: unknown, fallback: string, maxLength: number) => {
  const cleaned = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned || fallback;
};

const getHourBucket = (value: Date) => {
  const bucket = new Date(value);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket;
};

export const recordServerMetric = async (input: RecordServerMetricInput): Promise<void> => {
  try {
    const occurredAt = input.occurredAt || new Date();
    const durationMs = Math.max(0, Math.min(3_600_000, Math.round(Number(input.durationMs) || 0)));
    const dimensions = {
      bucketStart: getHourBucket(occurredAt),
      metricType: input.metricType,
      route: cleanDimension(input.route, "unknown", 180),
      method: cleanDimension(input.method, "UNKNOWN", 12).toUpperCase(),
      statusCode: Math.max(0, Math.min(999, Math.round(Number(input.statusCode) || 0))),
      outcome: cleanDimension(input.outcome, "unknown", 40).toLowerCase(),
      category: cleanDimension(input.category, "general", 80).toLowerCase(),
      country: cleanDimension(input.country, "unknown", 4).toUpperCase(),
      isBot: Boolean(input.isBot),
      botName: cleanDimension(input.botName, "none", 40).toLowerCase(),
    };

    await AnalyticsServerMetric.updateOne(
      dimensions,
      {
        $setOnInsert: dimensions,
        $set: { lastOccurredAt: occurredAt },
        $inc: { count: 1, durationTotalMs: durationMs },
        $max: { durationMaxMs: durationMs },
      },
      { upsert: true }
    );
  } catch (error) {
    // Analytics must never make a business request fail.
    console.error("Server analytics metric failed:", (error as Error).message);
  }
};
