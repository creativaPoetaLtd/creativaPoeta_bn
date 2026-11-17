"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const artPolicy_1 = require("../domain/artPolicy");
const ArtArtwork_1 = __importDefault(require("../models/ArtArtwork"));
const ArtRequest_1 = __importDefault(require("../models/ArtRequest"));
const text = (fr) => ({ fr, en: "", nl: "" });
const fixture = () => ({ slug: "lumiere-du-matin", collection: "art-et-decoration", title: text("Lumière du matin"), sentence: text("Le jour se lève."), story: text("Un récit sur la lumière."), details: [], images: [{ url: "https://res.cloudinary.com/test/image/upload/v1/cp-art/photo.webp", alt: text("Vue complète du tableau") }], variants: [{ id: "canvas-40", material: "canvas", format: "40 × 50 cm", priceCents: 4990, fulfillment: "studio", provider: "Prestataire privé", providerReference: "SKU-private", leadDaysMin: 3, leadDaysMax: 7, countries: ["BE", "FR"], available: true }], orientation: "portrait", status: "published", artist: "Creativa Poeta Art", currency: "EUR", displayOrder: 0 });
(0, node_test_1.default)("artworks remain drafts until their images, story and sellable variants are ready", () => {
    const value = fixture();
    strict_1.default.throws(() => (0, artPolicy_1.parseArtArtwork)({ ...value, images: [] }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.parseArtArtwork)({ ...value, story: text("") }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.parseArtArtwork)({ ...value, variants: [] }), artPolicy_1.ArtInputError);
    strict_1.default.equal((0, artPolicy_1.parseArtArtwork)({ ...value, status: "draft", images: [], variants: [] }).status, "draft");
});
(0, node_test_1.default)("artwork validation rejects unsafe image sources and invalid production parameters", () => {
    const value = fixture();
    strict_1.default.throws(() => (0, artPolicy_1.parseArtArtwork)({ ...value, images: [{ ...value.images[0], url: "javascript:alert(1)" }] }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.parseArtArtwork)({ ...value, images: [{ ...value.images[0], url: "https://res.cloudinary.com/test/image/upload/v1/cp-art/image.svg" }] }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.parseArtArtwork)({ ...value, variants: [{ ...value.variants[0], priceCents: 49.9 }] }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.parseArtArtwork)({ ...value, variants: [{ ...value.variants[0], leadDaysMin: 10, leadDaysMax: 3 }] }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.parseArtArtwork)({ ...value, variants: [...value.variants, ...value.variants] }), artPolicy_1.ArtInputError);
});
(0, node_test_1.default)("public catalogue omits fulfillment provider references and unavailable variants", () => {
    const value = (0, artPolicy_1.parseArtArtwork)(fixture());
    const output = (0, artPolicy_1.publicArtwork)({ ...value, _id: "123456789012345678901234" });
    strict_1.default.equal(output.variants[0].providerReference, undefined);
    strict_1.default.equal(output.variants[0].provider, undefined);
    strict_1.default.equal((0, artPolicy_1.publicArtwork)({ ...value, variants: [{ ...value.variants[0], available: false }] }).variants.length, 0);
});
(0, node_test_1.default)("quote uses current server prices rather than client amounts and makes no payment promise", () => {
    const cart = (0, artPolicy_1.parseArtCart)({ country: "BE", items: [{ artworkId: "123456789012345678901234", variantId: "canvas-40", quantity: 2, priceCents: 1 }], total: 2 });
    const result = (0, artPolicy_1.quoteArtCart)(cart, [{ ...(0, artPolicy_1.parseArtArtwork)(fixture()), _id: "123456789012345678901234" }]);
    strict_1.default.equal(result.subtotalCents, 9980);
    strict_1.default.equal(result.shippingPending, true);
    strict_1.default.equal(result.paymentEnabled, false);
});
(0, node_test_1.default)("quote rejects archived works, unavailable variants and unsupported countries", () => {
    const cart = (0, artPolicy_1.parseArtCart)({ country: "DE", items: [{ artworkId: "123456789012345678901234", variantId: "canvas-40", quantity: 1 }] });
    const value = { ...(0, artPolicy_1.parseArtArtwork)(fixture()), _id: "123456789012345678901234" };
    strict_1.default.throws(() => (0, artPolicy_1.quoteArtCart)(cart, [value]), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.quoteArtCart)({ ...cart, country: "BE" }, [{ ...value, status: "archived" }]), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.quoteArtCart)({ ...cart, country: "BE" }, [{ ...value, variants: [{ ...value.variants[0], available: false }] }]), artPolicy_1.ArtInputError);
});
(0, node_test_1.default)("cart limits block duplicate lines, fractional quantities and excessive quantities", () => {
    const line = { artworkId: "123456789012345678901234", variantId: "canvas-40", quantity: 1 };
    strict_1.default.throws(() => (0, artPolicy_1.parseArtCart)({ country: "BE", items: [line, line] }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.parseArtCart)({ country: "BE", items: [{ ...line, quantity: 0.5 }] }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.parseArtCart)({ country: "BE", items: [{ ...line, quantity: 21 }] }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.parseArtCart)({ country: "US", items: [line] }), artPolicy_1.ArtInputError);
});
(0, node_test_1.default)("enquiries require explicit contact consent and a valid retry identifier", () => {
    const request = { name: "Client Test", email: "client@example.com", consent: true, idempotencyKey: "12345678-1234-1234-1234-123456789abc" };
    strict_1.default.equal((0, artPolicy_1.parseArtRequest)(request).email, "client@example.com");
    strict_1.default.throws(() => (0, artPolicy_1.parseArtRequest)({ ...request, consent: false }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.parseArtRequest)({ ...request, email: "invalid" }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artPolicy_1.parseArtRequest)({ ...request, idempotencyKey: "" }), artPolicy_1.ArtInputError);
});
(0, node_test_1.default)("art records retain audit, archive and concurrency protections", () => {
    for (const model of [ArtArtwork_1.default, ArtRequest_1.default]) {
        strict_1.default.equal(model.schema.get("optimisticConcurrency"), true);
        strict_1.default.ok(model.schema.path("isDeleted"));
        strict_1.default.ok(model.schema.s.hooks._pres.get("deleteOne").length > 0);
    }
    strict_1.default.equal(ArtRequest_1.default.schema.path("paymentStatus").options.immutable, true);
});
