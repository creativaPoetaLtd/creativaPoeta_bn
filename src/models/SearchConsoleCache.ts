import mongoose, { Document, Schema } from "mongoose";

export interface ISearchConsoleCache extends Document {
  cacheKey: string;
  payload: Record<string, unknown>;
  fetchedAt: Date;
  expiresAt: Date;
  deleteAfter: Date;
}

const SearchConsoleCacheSchema = new Schema<ISearchConsoleCache>(
  {
    cacheKey: { type: String, required: true, unique: true, maxlength: 128 },
    payload: { type: Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    deleteAfter: { type: Date, required: true },
  },
  { versionKey: false }
);

SearchConsoleCacheSchema.index({ expiresAt: 1 });
SearchConsoleCacheSchema.index({ deleteAfter: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<ISearchConsoleCache>(
  "SearchConsoleCache",
  SearchConsoleCacheSchema
);
