"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadArtCommerce = loadArtCommerce;
exports.buildArtQuote = buildArtQuote;
exports.artStripe = artStripe;
const stripe_1 = __importDefault(require("stripe"));
const ArtArtwork_1 = __importDefault(require("../models/ArtArtwork"));
const ArtCommerceSettings_1 = __importDefault(require("../models/ArtCommerceSettings"));
const artPolicy_1 = require("../domain/artPolicy");
const artCommerce_1 = require("../domain/artCommerce");
async function loadArtCommerce() {
    const settings = await ArtCommerceSettings_1.default.findOne({ key: "cp-art" }).lean();
    return settings ? settings.config : (0, artCommerce_1.emptyArtCommerce)();
}
async function buildArtQuote(body, config) {
    const cart = (0, artPolicy_1.parseArtCart)(body);
    const artworks = await ArtArtwork_1.default.find({ _id: { $in: cart.items.map(item => item.artworkId) }, status: "published" }).lean();
    const assignments = {};
    for (const work of artworks)
        for (const variant of work.variants)
            assignments[`${work._id}:${variant.id}`] = variant.shippingProfileId || "";
    return (0, artCommerce_1.addArtShipping)((0, artPolicy_1.quoteArtCart)(cart, artworks), config || await loadArtCommerce(), assignments, (0, artCommerce_1.object)(body).shippingMethods);
}
function artStripe(mode) {
    const key = process.env[`ART_STRIPE_${mode.toUpperCase()}_SECRET_KEY`];
    if (!(key === null || key === void 0 ? void 0 : key.startsWith(mode === "live" ? "sk_live_" : "sk_test_")))
        throw new Error("ArtStripeNotConfigured");
    return new stripe_1.default(key, { maxNetworkRetries: 2, timeout: 20000, httpClient: stripe_1.default.createFetchHttpClient() });
}
