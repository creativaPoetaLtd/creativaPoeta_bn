"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const artCommerce_1 = require("../domain/artCommerce");
const artPolicy_1 = require("../domain/artPolicy");
const profile = () => ({ id: "atelier", label: "Atelier", fulfillment: "studio", zones: [{ id: "belgique", label: "Belgique", countries: ["BE"], methods: [{ id: "standard", label: "Standard", active: true, firstCents: 650, additionalCents: 150, transitMin: 2, transitMax: 4 }, { id: "express", label: "Express", active: true, firstCents: 1200, additionalCents: 200, transitMin: 1, transitMax: 2 }] }] });
const line = (fulfillment = "studio", quantity = 2) => ({ artworkId: "123456789012345678901234", variantId: fulfillment, title: { fr: "Test", en: "", nl: "" }, slug: "test", image: "https://res.cloudinary.com/test/image/upload/cp-art/test.webp", material: "canvas", format: "40 × 50 cm", unitPriceCents: 5000, quantity, lineTotalCents: 5000 * quantity, fulfillment, leadDaysMin: 3, leadDaysMax: 7 });
const quote = (lines = [line()]) => ({ country: "BE", currency: "EUR", lines, subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0), shippingPending: true, paymentEnabled: false });
(0, node_test_1.default)("shipping starts unpriced and payments closed without assuming a free rate or VAT rate", () => {
    const result = (0, artCommerce_1.addArtShipping)(quote(), (0, artCommerce_1.emptyArtCommerce)(), {});
    strict_1.default.equal(result.pricesIncludeVat, true);
    strict_1.default.equal(result.shippingPending, true);
    strict_1.default.equal(result.totalCents, null);
    strict_1.default.equal(result.paymentEnabled, false);
    strict_1.default.equal((0, artCommerce_1.artPaymentReadiness)((0, artCommerce_1.emptyArtCommerce)()).enabled, false);
});
(0, node_test_1.default)("shipping groups share first-item cost and add the configured per-item increment", () => {
    const config = { ...(0, artCommerce_1.emptyArtCommerce)(), profiles: [profile()] };
    const result = (0, artCommerce_1.addArtShipping)(quote(), config, { "123456789012345678901234:studio": "atelier" });
    strict_1.default.equal(result.shippingCents, 800);
    strict_1.default.equal(result.totalCents, 10800);
    strict_1.default.equal(result.paymentEnabled, false);
    strict_1.default.equal((0, artCommerce_1.addArtShipping)(quote(), config, { "123456789012345678901234:studio": "atelier" }, { atelier: "express" }).shippingCents, 1400);
});
(0, node_test_1.default)("mixed ateliers are independently priced and a missing POD profile blocks the entire payment", () => {
    const config = { ...(0, artCommerce_1.emptyArtCommerce)(), profiles: [profile(), { ...profile(), id: "pod", fulfillment: "print_on_demand" }] };
    const cart = quote([line("studio", 1), line("print_on_demand", 1)]);
    const assigned = { "123456789012345678901234:studio": "atelier", "123456789012345678901234:print_on_demand": "pod" };
    strict_1.default.equal((0, artCommerce_1.addArtShipping)(cart, config, assigned).shippingCents, 1300);
    const wrong = (0, artCommerce_1.addArtShipping)(cart, config, { ...assigned, "123456789012345678901234:print_on_demand": "atelier" });
    strict_1.default.equal(wrong.shippingPending, true);
    strict_1.default.equal(wrong.paymentEnabled, false);
});
(0, node_test_1.default)("unpriced, disabled and unsupported-country methods never become a zero-cost delivery", () => {
    for (const patch of [{ firstCents: null }, { additionalCents: null }, { active: false }]) {
        const p = profile();
        p.zones[0].methods = [{ ...p.zones[0].methods[0], ...patch }];
        strict_1.default.equal((0, artCommerce_1.addArtShipping)(quote(), { ...(0, artCommerce_1.emptyArtCommerce)(), profiles: [p] }, { "123456789012345678901234:studio": "atelier" }).shippingPending, true);
    }
    const p = profile();
    p.zones[0].countries = ["FR"];
    strict_1.default.equal((0, artCommerce_1.addArtShipping)(quote(), { ...(0, artCommerce_1.emptyArtCommerce)(), profiles: [p] }, { "123456789012345678901234:studio": "atelier" }).shippingPending, true);
});
(0, node_test_1.default)("only an explicit zero offers free shipping and the digest binds method, amount and terms", () => {
    const p = profile();
    p.zones[0].methods[0].firstCents = 0;
    p.zones[0].methods[0].additionalCents = 0;
    const config = { ...(0, artCommerce_1.emptyArtCommerce)(), profiles: [p] }, assigned = { "123456789012345678901234:studio": "atelier" };
    const normal = (0, artCommerce_1.addArtShipping)(quote(), config, assigned);
    strict_1.default.equal(normal.shippingCents, 0);
    strict_1.default.notEqual(normal.digest, (0, artCommerce_1.addArtShipping)(quote(), config, assigned, { atelier: "express" }).digest);
    strict_1.default.notEqual(normal.digest, (0, artCommerce_1.addArtShipping)(quote(), { ...config, termsVersion: "v2" }, assigned).digest);
    strict_1.default.throws(() => (0, artCommerce_1.addArtShipping)(quote(), config, assigned, { atelier: "forged" }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artCommerce_1.addArtShipping)(quote(), config, assigned, { forged: "standard" }), artPolicy_1.ArtInputError);
});
(0, node_test_1.default)("configuration rejects overlapping countries, fractional cents, unsafe terms and pretax prices", () => {
    const config = { ...(0, artCommerce_1.emptyArtCommerce)(), profiles: [profile()] };
    strict_1.default.equal((0, artCommerce_1.parseArtCommerce)(config).profiles.length, 1);
    const p = profile();
    p.zones.push({ ...p.zones[0], id: "overlap" });
    strict_1.default.throws(() => (0, artCommerce_1.parseArtCommerce)({ ...config, profiles: [p] }), artPolicy_1.ArtInputError);
    const cents = profile();
    cents.zones[0].methods[0].firstCents = 1.5;
    strict_1.default.throws(() => (0, artCommerce_1.parseArtCommerce)({ ...config, profiles: [cents] }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artCommerce_1.parseArtCommerce)({ ...config, pricesIncludeVat: false }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artCommerce_1.parseArtCommerce)({ ...config, termsUrl: "https://untrusted.example/terms" }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artCommerce_1.parseArtCommerce)({ ...config, taxCode: "21%" }), artPolicy_1.ArtInputError);
});
