import mongoose, { Schema } from "mongoose";
import { softDeletePlugin } from "../plugins/softDeletePlugin";
import { ART_COLLECTIONS, ART_MATERIALS } from "../domain/artPolicy";

const text = (max: number) => new Schema({ fr: { type: String, trim: true, maxlength: max }, en: { type: String, trim: true, maxlength: max }, nl: { type: String, trim: true, maxlength: max } }, { _id: false });
const variant = new Schema({
  id: { type: String, required: true }, material: { type: String, enum: ART_MATERIALS, required: true }, format: { type: String, required: true, maxlength: 80 },
  priceCents: { type: Number, required: true, min: 1, max: 10_000_000, validate: Number.isSafeInteger },
  fulfillment: { type: String, enum: ["studio", "print_on_demand"], required: true },
  provider: { type: String, maxlength: 80 }, providerReference: { type: String, maxlength: 160 },
  leadDaysMin: { type: Number, min: 0, max: 180 }, leadDaysMax: { type: Number, min: 0, max: 180 },
  countries: [{ type: String }], available: { type: Boolean, default: true },
}, { _id: false });
const schema = new Schema({
  slug: { type: String, required: true, maxlength: 100 }, collectionSlug: { type: String, required: true, enum: ART_COLLECTIONS },
  title: { type: text(160), required: true }, sentence: { type: text(350), required: true }, story: { type: text(8000), required: true },
  details: [{ _id: false, title: text(120), text: text(1200) }],
  images: [{ _id: false, url: { type: String, required: true, maxlength: 1000 }, alt: text(240) }],
  variants: { type: [variant], default: [] }, artist: { type: String, maxlength: 120 },
  orientation: { type: String, enum: ["portrait", "landscape"], required: true },
  currency: { type: String, enum: ["EUR"], default: "EUR" },
  status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
  displayOrder: { type: Number, min: 0, max: 10000, default: 0 },
}, { timestamps: true });
schema.plugin(softDeletePlugin, { entityType: "artwork" });
schema.index({ slug: 1 }, { unique: true, partialFilterExpression: { isDeleted: false }, name: "active_artwork_slug_unique" });
schema.index({ status: 1, displayOrder: 1, createdAt: -1 });
export default mongoose.model("ArtArtwork", schema);
