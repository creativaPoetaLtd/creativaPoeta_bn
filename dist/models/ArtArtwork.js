"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const softDeletePlugin_1 = require("../plugins/softDeletePlugin");
const artPolicy_1 = require("../domain/artPolicy");
const text = (max) => new mongoose_1.Schema({ fr: { type: String, trim: true, maxlength: max }, en: { type: String, trim: true, maxlength: max }, nl: { type: String, trim: true, maxlength: max } }, { _id: false });
const variant = new mongoose_1.Schema({
    id: { type: String, required: true }, material: { type: String, enum: artPolicy_1.ART_MATERIALS, required: true }, format: { type: String, required: true, maxlength: 80 },
    priceCents: { type: Number, required: true, min: 1, max: 10000000, validate: Number.isSafeInteger },
    fulfillment: { type: String, enum: ["studio", "print_on_demand"], required: true },
    provider: { type: String, maxlength: 80 }, providerReference: { type: String, maxlength: 160 },
    leadDaysMin: { type: Number, min: 0, max: 180 }, leadDaysMax: { type: Number, min: 0, max: 180 },
    shippingProfileId: { type: String, maxlength: 80, default: "" }, countries: [{ type: String }], available: { type: Boolean, default: true },
}, { _id: false });
const schema = new mongoose_1.Schema({
    slug: { type: String, required: true, maxlength: 100 }, collectionSlug: { type: String, required: true, enum: artPolicy_1.ART_COLLECTIONS },
    title: { type: text(160), required: true }, sentence: { type: text(350), required: true }, story: { type: text(8000), required: true },
    details: [{ _id: false, title: text(120), text: text(1200) }],
    images: [{ _id: false, url: { type: String, required: true, maxlength: 1000 }, alt: text(240) }],
    variants: { type: [variant], default: [] }, artist: { type: String, maxlength: 120 },
    orientation: { type: String, enum: ["portrait", "landscape"], required: true },
    currency: { type: String, enum: ["EUR"], default: "EUR" },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
    displayOrder: { type: Number, min: 0, max: 10000, default: 0 },
}, { timestamps: true });
schema.plugin(softDeletePlugin_1.softDeletePlugin, { entityType: "artwork" });
schema.index({ slug: 1 }, { unique: true, partialFilterExpression: { isDeleted: false }, name: "active_artwork_slug_unique" });
schema.index({ status: 1, displayOrder: 1, createdAt: -1 });
exports.default = mongoose_1.default.model("ArtArtwork", schema);
