import crypto from "node:crypto";
import { ART_COUNTRIES, ArtInputError, artString, quoteArtCart } from "./artPolicy";

export type ArtShippingMethod = { id: string; label: string; active: boolean; firstCents: number | null; additionalCents: number | null; transitMin: number | null; transitMax: number | null };
export type ArtShippingZone = { id: string; label: string; countries: string[]; methods: ArtShippingMethod[] };
export type ArtShippingProfile = { id: string; label: string; fulfillment: "studio" | "print_on_demand"; zones: ArtShippingZone[] };
export type ArtCommerceConfig = { mode: "disabled" | "test" | "live"; pricesIncludeVat: boolean; taxConfigured: boolean; taxCode: string; termsUrl: string; termsVersion: string; salesConfirmed: boolean; profiles: ArtShippingProfile[] };
export const emptyArtCommerce = (): ArtCommerceConfig => ({ mode: "disabled", pricesIncludeVat: true, taxConfigured: false, taxCode: "", termsUrl: "", termsVersion: "", salesConfirmed: false, profiles: [] });
export const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ArtInputError("Objet attendu."); return value as Record<string, unknown>; };
const fail = (message: string): never => { throw new ArtInputError(message); };
const list = (value: unknown, max: number): unknown[] => Array.isArray(value) && value.length <= max ? value : fail("Liste trop longue ou invalide.");
const bool = (value: unknown) => typeof value === "boolean" ? value : fail("Valeur oui/non attendue.");
const id = (value: unknown) => { const result = artString(value, 80, "Identifiant", true); return /^[a-zA-Z0-9_-]+$/.test(result) ? result : fail("Identifiant invalide."); };
const nullableNumber = (value: unknown, max: number) => value === null ? null : typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : fail("Montant ou délai invalide. Laissez le champ vide pour un tarif à préparer.");
const unique = <T extends { id: string }>(items: T[]): T[] => new Set(items.map(item => item.id)).size === items.length ? items : fail("Identifiants dupliqués.");
export function artPublicOrigin(): string {
  const url = new URL(process.env.ART_PUBLIC_ORIGIN || "https://creativapoeta.com");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error("Invalid ART_PUBLIC_ORIGIN");
  return url.origin;
}
export function parseArtCommerce(value: unknown): ArtCommerceConfig {
  const data = object(value);
  if (!["disabled", "test", "live"].includes(String(data.mode))) return fail("Mode de paiement invalide.");
  const profiles = unique(list(data.profiles, 20).map(value => {
    const profile = object(value);
    if (!["studio", "print_on_demand"].includes(String(profile.fulfillment))) return fail("Fabrication inconnue.");
    const countries = new Set<string>();
    const zones = unique(list(profile.zones, 27).map(value => {
      const zone = object(value);
      const selected = list(zone.countries, 27).map(country => {
        if (typeof country !== "string" || !ART_COUNTRIES.includes(country) || countries.has(country)) return fail("Chaque pays doit figurer dans une seule zone du profil.");
        countries.add(country); return country;
      });
      if (!selected.length) return fail("Choisissez au moins un pays par zone.");
      const methods = unique(list(zone.methods, 5).map(value => {
        const method = object(value);
        const transitMin = nullableNumber(method.transitMin, 180), transitMax = nullableNumber(method.transitMax, 180);
        if ((transitMin === null) !== (transitMax === null) || (transitMin !== null && transitMax! < transitMin)) return fail("Renseignez les deux délais de transport dans le bon ordre.");
        return { id: id(method.id), label: artString(method.label, 120, "Mode de livraison", true), active: bool(method.active), firstCents: nullableNumber(method.firstCents, 1_000_000), additionalCents: nullableNumber(method.additionalCents, 1_000_000), transitMin, transitMax };
      }));
      return { id: id(zone.id), label: artString(zone.label, 120, "Zone", true), countries: selected, methods };
    }));
    return { id: id(profile.id), label: artString(profile.label, 120, "Profil de livraison", true), fulfillment: profile.fulfillment as ArtShippingProfile["fulfillment"], zones };
  }));
  const termsUrl = artString(data.termsUrl, 500, "Adresse des conditions de vente");
  if (termsUrl) { try { const url = new URL(termsUrl); if (url.origin !== artPublicOrigin() || url.hash || url.username || url.password) return fail("Les conditions de vente doivent être hébergées sur le site CP Art configuré."); } catch { return fail("Adresse des conditions de vente invalide."); } }
  const taxCode = artString(data.taxCode, 30, "Code fiscal Stripe");
  if (taxCode && !/^txcd_[0-9]{8}$/.test(taxCode)) return fail("Code fiscal Stripe invalide.");
  if (data.pricesIncludeVat !== true) return fail("Les prix CP Art doivent inclure la TVA.");
  return { mode: data.mode as ArtCommerceConfig["mode"], pricesIncludeVat: true, taxConfigured: bool(data.taxConfigured), taxCode, termsUrl, termsVersion: artString(data.termsVersion, 80, "Version des conditions"), salesConfirmed: bool(data.salesConfirmed), profiles };
}
export function artPaymentReadiness(config: ArtCommerceConfig) {
  const mode = config.mode === "live" ? "LIVE" : "TEST";
  const key = process.env[`ART_STRIPE_${mode}_SECRET_KEY`] || "";
  const secret = process.env[`ART_STRIPE_${mode}_WEBHOOK_SECRET`] || "";
  const reasons: string[] = [];
  if (config.mode === "disabled") reasons.push("mode_disabled");
  if (process.env.ART_CHECKOUT_ENABLED !== "true") reasons.push("checkout_disabled");
  if (config.mode === "live" && process.env.ART_LIVE_PAYMENTS_ENABLED !== "true") reasons.push("live_disabled");
  if (!key.startsWith(config.mode === "live" ? "sk_live_" : "sk_test_") || !secret.startsWith("whsec_")) reasons.push("stripe_missing");
  if (!config.taxConfigured || !config.taxCode || !config.pricesIncludeVat) reasons.push("tax_pending");
  if (!config.termsUrl || !config.termsVersion || !config.salesConfirmed) reasons.push("terms_pending");
  return { enabled: reasons.length === 0, mode: config.mode, reasons };
}
export type ArtBaseQuote = ReturnType<typeof quoteArtCart>;
export function addArtShipping(quote: ArtBaseQuote, config: ArtCommerceConfig, assignments: Record<string, string>, selectedValue: unknown = {}) {
  const selected = object(selectedValue ?? {});
  const groups = new Map<string, { profile: ArtShippingProfile | undefined; quantity: number; fulfillment: string }>();
  for (const line of quote.lines) {
    const assigned = assignments[`${line.artworkId}:${line.variantId}`];
    const profile = config.profiles.find(item => item.id === assigned && item.fulfillment === line.fulfillment);
    const key = profile?.id || `unconfigured-${line.fulfillment}`;
    const group = groups.get(key) || { profile, quantity: 0, fulfillment: line.fulfillment };
    group.quantity += line.quantity; groups.set(key, group);
  }
  const shippingGroups = [...groups.entries()].map(([profileId, group]) => {
    const zone = group.profile?.zones.find(zone => zone.countries.includes(quote.country));
    const options = (zone?.methods || []).filter(method => method.active && method.firstCents !== null && method.additionalCents !== null).map(method => ({ id: method.id, label: method.label, amountCents: method.firstCents! + (group.quantity - 1) * method.additionalCents!, transitMin: method.transitMin, transitMax: method.transitMax }));
    const choice = selected[profileId];
    if (choice !== undefined && (typeof choice !== "string" || !options.some(option => option.id === choice))) return fail("Ce mode de livraison a changé. Vérifiez votre sélection.");
    const chosen = options.find(option => option.id === choice) || options[0];
    return { profileId, label: group.profile?.label || "", fulfillment: group.fulfillment, quantity: group.quantity, options, selectedMethodId: chosen?.id || null, amountCents: chosen?.amountCents ?? null };
  });
  if (Object.keys(selected).some(key => !groups.has(key))) return fail("Un profil de livraison ne correspond plus à la sélection.");
  const shippingPending = shippingGroups.some(group => group.amountCents === null);
  const shippingCents = shippingPending ? null : shippingGroups.reduce((sum, group) => sum + group.amountCents!, 0);
  const readiness = artPaymentReadiness(config);
  const result = { ...quote, pricesIncludeVat: true, shippingGroups, shippingPending, shippingCents, totalCents: shippingCents === null ? null : quote.subtotalCents + shippingCents, paymentEnabled: readiness.enabled && !shippingPending, paymentMode: config.mode, termsUrl: config.termsUrl, termsVersion: config.termsVersion };
  const digest = crypto.createHash("sha256").update(JSON.stringify({ ...result, taxCode: config.taxCode })).digest("hex");
  return { ...result, digest };
}
