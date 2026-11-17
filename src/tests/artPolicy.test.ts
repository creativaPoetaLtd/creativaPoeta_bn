import test from "node:test";
import assert from "node:assert/strict";
import { ArtInputError, parseArtArtwork, parseArtCart, parseArtRequest, publicArtwork, quoteArtCart } from "../domain/artPolicy";
import ArtArtwork from "../models/ArtArtwork";
import ArtRequest from "../models/ArtRequest";

const text = (fr: string) => ({ fr, en: "", nl: "" });
const fixture = () => ({ slug: "lumiere-du-matin", collection: "art-et-decoration", title: text("Lumière du matin"), sentence: text("Le jour se lève."), story: text("Un récit sur la lumière."), details: [], images: [{ url: "https://res.cloudinary.com/test/image/upload/v1/cp-art/photo.webp", alt: text("Vue complète du tableau") }], variants: [{ id: "canvas-40", material: "canvas", format: "40 × 50 cm", priceCents: 4990, fulfillment: "studio", provider: "Prestataire privé", providerReference: "SKU-private", leadDaysMin: 3, leadDaysMax: 7, countries: ["BE", "FR"], available: true }], orientation: "portrait", status: "published", artist: "Creativa Poeta Art", currency: "EUR", displayOrder: 0 });
test("artworks remain drafts until their images, story and sellable variants are ready", () => {
  const value = fixture();
  assert.throws(() => parseArtArtwork({ ...value, images: [] }), ArtInputError);
  assert.throws(() => parseArtArtwork({ ...value, story: text("") }), ArtInputError);
  assert.throws(() => parseArtArtwork({ ...value, variants: [] }), ArtInputError);
  assert.equal(parseArtArtwork({ ...value, status: "draft", images: [], variants: [] }).status, "draft");
});
test("artwork validation rejects unsafe image sources and invalid production parameters", () => {
  const value = fixture();
  assert.throws(() => parseArtArtwork({ ...value, images: [{ ...value.images[0], url: "javascript:alert(1)" }] }), ArtInputError);
  assert.throws(() => parseArtArtwork({ ...value, images: [{ ...value.images[0], url: "https://res.cloudinary.com/test/image/upload/v1/cp-art/image.svg" }] }), ArtInputError);
  assert.throws(() => parseArtArtwork({ ...value, variants: [{ ...value.variants[0], priceCents: 49.9 }] }), ArtInputError);
  assert.throws(() => parseArtArtwork({ ...value, variants: [{ ...value.variants[0], leadDaysMin: 10, leadDaysMax: 3 }] }), ArtInputError);
  assert.throws(() => parseArtArtwork({ ...value, variants: [...value.variants, ...value.variants] }), ArtInputError);
});
test("public catalogue omits fulfillment provider references and unavailable variants", () => {
  const value = parseArtArtwork(fixture());
  const output = publicArtwork({ ...value, _id: "123456789012345678901234" });
  assert.equal((output.variants[0] as any).providerReference, undefined);
  assert.equal((output.variants[0] as any).provider, undefined);
  assert.equal(publicArtwork({ ...value, variants: [{ ...value.variants[0], available: false }] }).variants.length, 0);
});
test("quote uses current server prices rather than client amounts and makes no payment promise", () => {
  const cart = parseArtCart({ country: "BE", items: [{ artworkId: "123456789012345678901234", variantId: "canvas-40", quantity: 2, priceCents: 1 }], total: 2 });
  const result = quoteArtCart(cart, [{ ...parseArtArtwork(fixture()), _id: "123456789012345678901234" }]);
  assert.equal(result.subtotalCents, 9980);
  assert.equal(result.shippingPending, true);
  assert.equal(result.paymentEnabled, false);
});
test("quote rejects archived works, unavailable variants and unsupported countries", () => {
  const cart = parseArtCart({ country: "DE", items: [{ artworkId: "123456789012345678901234", variantId: "canvas-40", quantity: 1 }] });
  const value = { ...parseArtArtwork(fixture()), _id: "123456789012345678901234" };
  assert.throws(() => quoteArtCart(cart, [value]), ArtInputError);
  assert.throws(() => quoteArtCart({ ...cart, country: "BE" }, [{ ...value, status: "archived" }]), ArtInputError);
  assert.throws(() => quoteArtCart({ ...cart, country: "BE" }, [{ ...value, variants: [{ ...value.variants[0], available: false }] }]), ArtInputError);
});
test("cart limits block duplicate lines, fractional quantities and excessive quantities", () => {
  const line = { artworkId: "123456789012345678901234", variantId: "canvas-40", quantity: 1 };
  assert.throws(() => parseArtCart({ country: "BE", items: [line, line] }), ArtInputError);
  assert.throws(() => parseArtCart({ country: "BE", items: [{ ...line, quantity: 0.5 }] }), ArtInputError);
  assert.throws(() => parseArtCart({ country: "BE", items: [{ ...line, quantity: 21 }] }), ArtInputError);
  assert.throws(() => parseArtCart({ country: "US", items: [line] }), ArtInputError);
});
test("enquiries require explicit contact consent and a valid retry identifier", () => {
  const request = { name: "Client Test", email: "client@example.com", consent: true, idempotencyKey: "12345678-1234-1234-1234-123456789abc" };
  assert.equal(parseArtRequest(request).email, "client@example.com");
  assert.throws(() => parseArtRequest({ ...request, consent: false }), ArtInputError);
  assert.throws(() => parseArtRequest({ ...request, email: "invalid" }), ArtInputError);
  assert.throws(() => parseArtRequest({ ...request, idempotencyKey: "" }), ArtInputError);
});
test("art records retain audit, archive and concurrency protections", () => {
  for (const model of [ArtArtwork, ArtRequest]) {
    assert.equal(model.schema.get("optimisticConcurrency"), true);
    assert.ok((model.schema as any).path("isDeleted"));
    assert.ok((model.schema as any).s.hooks._pres.get("deleteOne").length > 0);
  }
  assert.equal(ArtRequest.schema.path("paymentStatus").options.immutable, true);
});
