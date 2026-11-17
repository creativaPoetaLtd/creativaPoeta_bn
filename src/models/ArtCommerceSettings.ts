import mongoose, { Schema } from "mongoose";
import { softDeletePlugin } from "../plugins/softDeletePlugin";
import { emptyArtCommerce } from "../domain/artCommerce";
const schema = new Schema({ key: { type: String, required: true, unique: true, immutable: true }, config: { type: Schema.Types.Mixed, required: true, default: emptyArtCommerce } }, { timestamps: true });
schema.plugin(softDeletePlugin, { entityType: "art_commerce_settings" });
export default mongoose.model("ArtCommerceSettings", schema);
