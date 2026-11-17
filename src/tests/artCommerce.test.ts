import test from "node:test";
import assert from "node:assert/strict";
import { addArtShipping, artPaymentReadiness, emptyArtCommerce, parseArtCommerce, type ArtShippingProfile } from "../domain/artCommerce";
import { ArtInputError } from "../domain/artPolicy";

const profile = (): ArtShippingProfile => ({ id: "atelier", label: "Atelier", fulfillment: "studio", zones: [{ id: "belgique", label: "Belgique", countries: ["BE"], methods: [{ id: "standard", label: "Standard", active: true, firstCents: 650, additionalCents: 150, transitMin: 2, transitMax: 4 }, { id: "express", label: "Express", active: true, firstCents: 1200, additionalCents: 200, transitMin: 1, transitMax: 2 }] }] });
const line = (fulfillment: "studio" | "print_on_demand" = "studio", quantity = 2) => ({ artworkId: "123456789012345678901234", variantId: fulfillment, title: { fr: "Test", en: "", nl: "" }, slug: "test", image: "https://res.cloudinary.com/test/image/upload/cp-art/test.webp", material: "canvas", format: "40 × 50 cm", unitPriceCents: 5000, quantity, lineTotalCents: 5000 * quantity, fulfillment, leadDaysMin: 3, leadDaysMax: 7 });
const quote = (lines = [line()]) => ({ country: "BE", currency: "EUR" as const, lines, subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0), shippingPending: true as const, paymentEnabled: false as const });
test("shipping starts unpriced and payments closed without assuming a free rate or VAT rate", () => {
  const result = addArtShipping(quote(), emptyArtCommerce(), {});
  assert.equal(result.pricesIncludeVat, true); assert.equal(result.shippingPending, true); assert.equal(result.totalCents, null); assert.equal(result.paymentEnabled, false);
  assert.equal(artPaymentReadiness(emptyArtCommerce()).enabled, false);
});
test("shipping groups share first-item cost and add the configured per-item increment", () => {
  const config = { ...emptyArtCommerce(), profiles: [profile()] };
  const result = addArtShipping(quote(), config, { "123456789012345678901234:studio": "atelier" });
  assert.equal(result.shippingCents, 800); assert.equal(result.totalCents, 10800); assert.equal(result.paymentEnabled, false);
  assert.equal(addArtShipping(quote(), config, { "123456789012345678901234:studio": "atelier" }, { atelier: "express" }).shippingCents, 1400);
});
test("mixed ateliers are independently priced and a missing POD profile blocks the entire payment", () => {
  const config = { ...emptyArtCommerce(), profiles: [profile(), { ...profile(), id: "pod", fulfillment: "print_on_demand" as const }] };
  const cart = quote([line("studio", 1), line("print_on_demand", 1)]);
  const assigned = { "123456789012345678901234:studio": "atelier", "123456789012345678901234:print_on_demand": "pod" };
  assert.equal(addArtShipping(cart, config, assigned).shippingCents, 1300);
  const wrong = addArtShipping(cart, config, { ...assigned, "123456789012345678901234:print_on_demand": "atelier" });
  assert.equal(wrong.shippingPending, true); assert.equal(wrong.paymentEnabled, false);
});
test("unpriced, disabled and unsupported-country methods never become a zero-cost delivery", () => {
  for (const patch of [{ firstCents: null }, { additionalCents: null }, { active: false }]) {
    const p = profile(); p.zones[0].methods = [{ ...p.zones[0].methods[0], ...patch }];
    assert.equal(addArtShipping(quote(), { ...emptyArtCommerce(), profiles: [p] }, { "123456789012345678901234:studio": "atelier" }).shippingPending, true);
  }
  const p = profile(); p.zones[0].countries = ["FR"];
  assert.equal(addArtShipping(quote(), { ...emptyArtCommerce(), profiles: [p] }, { "123456789012345678901234:studio": "atelier" }).shippingPending, true);
});
test("only an explicit zero offers free shipping and the digest binds method, amount and terms", () => {
  const p = profile(); p.zones[0].methods[0].firstCents = 0; p.zones[0].methods[0].additionalCents = 0;
  const config = { ...emptyArtCommerce(), profiles: [p] }, assigned = { "123456789012345678901234:studio": "atelier" };
  const normal = addArtShipping(quote(), config, assigned);
  assert.equal(normal.shippingCents, 0);
  assert.notEqual(normal.digest, addArtShipping(quote(), config, assigned, { atelier: "express" }).digest);
  assert.notEqual(normal.digest, addArtShipping(quote(), { ...config, termsVersion: "v2" }, assigned).digest);
  assert.throws(() => addArtShipping(quote(), config, assigned, { atelier: "forged" }), ArtInputError);
  assert.throws(() => addArtShipping(quote(), config, assigned, { forged: "standard" }), ArtInputError);
});
test("configuration rejects overlapping countries, fractional cents, unsafe terms and pretax prices", () => {
  const config = { ...emptyArtCommerce(), profiles: [profile()] };
  assert.equal(parseArtCommerce(config).profiles.length, 1);
  const p = profile(); p.zones.push({ ...p.zones[0], id: "overlap" });
  assert.throws(() => parseArtCommerce({ ...config, profiles: [p] }), ArtInputError);
  const cents = profile(); cents.zones[0].methods[0].firstCents = 1.5;
  assert.throws(() => parseArtCommerce({ ...config, profiles: [cents] }), ArtInputError);
  assert.throws(() => parseArtCommerce({ ...config, pricesIncludeVat: false }), ArtInputError);
  assert.throws(() => parseArtCommerce({ ...config, termsUrl: "https://untrusted.example/terms" }), ArtInputError);
  assert.throws(() => parseArtCommerce({ ...config, taxCode: "21%" }), ArtInputError);
});
