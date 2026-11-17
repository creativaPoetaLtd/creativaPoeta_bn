import Stripe from "stripe";
import ArtArtwork from "../models/ArtArtwork";
import ArtCommerceSettings from "../models/ArtCommerceSettings";
import { parseArtCart, quoteArtCart } from "../domain/artPolicy";
import { addArtShipping, ArtCommerceConfig, emptyArtCommerce, object } from "../domain/artCommerce";

export async function loadArtCommerce(): Promise<ArtCommerceConfig> {
  const settings = await ArtCommerceSettings.findOne({ key: "cp-art" }).lean();
  return settings ? settings.config as ArtCommerceConfig : emptyArtCommerce();
}
export async function buildArtQuote(body: unknown, config?: ArtCommerceConfig) {
  const cart = parseArtCart(body);
  const artworks = await ArtArtwork.find({ _id: { $in: cart.items.map(item => item.artworkId) }, status: "published" }).lean();
  const assignments: Record<string, string> = {};
  for (const work of artworks) for (const variant of work.variants) assignments[`${work._id}:${variant.id}`] = variant.shippingProfileId || "";
  return addArtShipping(quoteArtCart(cart, artworks as any), config || await loadArtCommerce(), assignments, object(body).shippingMethods);
}
export function artStripe(mode: "test" | "live") {
  const key = process.env[`ART_STRIPE_${mode.toUpperCase()}_SECRET_KEY`];
  if (!key?.startsWith(mode === "live" ? "sk_live_" : "sk_test_")) throw new Error("ArtStripeNotConfigured");
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 20000, httpClient: Stripe.createFetchHttpClient() });
}
