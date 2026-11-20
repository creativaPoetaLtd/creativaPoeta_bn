export const ART_COLLECTIONS = ["words-of-life", "faith-and-hope", "art-et-decoration", "cultures-et-identites", "made-for-you"] as const;
export const ART_MATERIALS = ["canvas", "poster", "metal", "wood", "acrylic"] as const;
export const ART_COUNTRIES = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
export type ArtLocalized = { fr: string; en: string; nl: string };
export type ArtImage = { url: string; alt: ArtLocalized };
export type ArtVariant = {
  id: string; material: string; format: string; priceCents: number;
  fulfillment: "studio" | "print_on_demand"; provider: string; providerReference: string;
  leadDaysMin: number; leadDaysMax: number; countries: string[]; available: boolean; shippingProfileId?: string;
};
export type ArtArtworkInput = {
  slug: string; collectionSlug: string; title: ArtLocalized; sentence: ArtLocalized; story: ArtLocalized;
  details: { title: ArtLocalized; text: ArtLocalized }[]; images: ArtImage[];
  variants: ArtVariant[]; orientation: "portrait" | "landscape"; status: "draft" | "published" | "archived";
  artist: string; displayOrder: number; currency: "EUR";
};
export class ArtInputError extends Error {}
const invalid = (message: string): never => { throw new ArtInputError(message); };
export const artString = (value: unknown, max: number, name: string, required = false): string => {
  if (value !== undefined && typeof value !== "string") return invalid(`${name} : texte attendu.`);
  const result = String(value ?? "").trim();
  if (result.length > max || (required && !result)) return invalid(`${name} : valeur manquante ou trop longue.`);
  return result;
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Objet attendu.");
  return value as Record<string, unknown>;
};
const integer = (value: unknown, min: number, max: number, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) return invalid(`${field} : nombre entier invalide.`);
  return value;
};
const localized = (value: unknown, max: number, field: string, required = false): ArtLocalized => {
  const item = record(value ?? {});
  return { fr: artString(item.fr, max, field, required), en: artString(item.en, max, field), nl: artString(item.nl, max, field) };
};
export const isArtImageUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && !url.username && !url.password
      && !url.search && !url.hash && (!cloud || url.pathname.startsWith(`/${cloud}/image/upload/`))
      && /^\/[a-z0-9_-]+\/image\/upload\//i.test(url.pathname)
      && /\/cp-art\//.test(url.pathname) && /\.(webp|png|jpe?g|avif)$/i.test(url.pathname);
  } catch { return false; }
};
export function parseArtArtwork(value: unknown): ArtArtworkInput {
  const data = record(value);
  const slug = artString(data.slug, 100, "Adresse", true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return invalid("Adresse : utilisez des lettres minuscules, chiffres et tirets.");
  if (!ART_COLLECTIONS.includes(data.collection as any)) return invalid("Collection inconnue.");
  const status = data.status;
  if (!["draft", "published", "archived"].includes(String(status))) return invalid("Statut inconnu.");
  if (data.orientation !== "portrait" && data.orientation !== "landscape") return invalid("Orientation inconnue.");
  if (!Array.isArray(data.images) || data.images.length > 12) return invalid("Maximum 12 images par œuvre.");
  const images = data.images.map(value => {
    const image = record(value);
    const url = artString(image.url, 1000, "Photo", true);
    if (!isArtImageUrl(url)) return invalid("Utilisez une photo téléversée dans CP Art.");
    return { url, alt: localized(image.alt, 240, "Description de la photo", true) };
  });
  const detailValues = data.details ?? [];
  if (!Array.isArray(detailValues) || detailValues.length > 8) return invalid("Maximum 8 détails symboliques.");
  const details = detailValues.flatMap((value, index) => {
    const item = record(value);
    const title = localized(item.title, 120, `Nom du détail ${index + 1}`);
    const text = localized(item.text, 1200, `Explication du détail ${index + 1}`);
    if (![...Object.values(title), ...Object.values(text)].some(Boolean)) return [];
    if (!title.fr || !text.fr) return invalid(`Complétez le nom et l’explication en français du détail ${index + 1}, ou retirez ce détail facultatif.`);
    return [{ title, text }];
  });
  if (!Array.isArray(data.variants) || data.variants.length > 30) return invalid("Maximum 30 variantes par œuvre.");
  const variants = data.variants.map(value => {
    const item = record(value);
    const id = artString(item.id, 80, "Identifiant de variante", true);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return invalid("Identifiant de variante invalide.");
    if (!ART_MATERIALS.includes(item.material as any)) return invalid("Support inconnu.");
    if (item.fulfillment !== "studio" && item.fulfillment !== "print_on_demand") return invalid("Fabrication inconnue.");
    const countries = item.countries;
    if (!Array.isArray(countries) || !countries.length || countries.length > 27 || countries.some(country => !ART_COUNTRIES.includes(country))) return invalid("Choisissez les pays européens de livraison.");
    const leadDaysMin = integer(item.leadDaysMin, 0, 180, "Préparation minimum");
    const leadDaysMax = integer(item.leadDaysMax, leadDaysMin, 180, "Préparation maximum");
    if (typeof item.available !== "boolean") return invalid("Disponibilité invalide.");
    const shippingProfileId = artString(item.shippingProfileId, 80, "Profil de livraison");
    if (shippingProfileId && !/^[a-zA-Z0-9_-]+$/.test(shippingProfileId)) return invalid("Profil de livraison invalide.");
    return { id, shippingProfileId, material: String(item.material), format: artString(item.format, 80, "Format", true), priceCents: integer(item.priceCents, 1, 10_000_000, "Prix en centimes"), fulfillment: item.fulfillment, provider: artString(item.provider, 80, "Prestataire"), providerReference: artString(item.providerReference, 160, "Référence prestataire"), leadDaysMin, leadDaysMax, countries: [...new Set(countries)], available: item.available } as ArtVariant;
  });
  if (new Set(variants.map(item => item.id)).size !== variants.length) return invalid("Les identifiants de variantes doivent être uniques.");
  if (status === "published" && (!images.length || !variants.some(item => item.available))) return invalid("Ajoutez une photo et une variante disponible avant publication.");
  return { slug, collectionSlug: String(data.collection), title: localized(data.title, 160, "Titre", true), sentence: localized(data.sentence, 350, "Présentation"), story: localized(data.story, 8000, "Histoire", status === "published"), details, images, variants, orientation: data.orientation, status: status as ArtArtworkInput["status"], artist: artString(data.artist, 120, "Artiste"), displayOrder: integer(data.displayOrder ?? 0, 0, 10000, "Ordre d’affichage"), currency: "EUR" };
}
export function publicArtwork(data: ArtArtworkInput & { _id?: unknown; updatedAt?: unknown }) {
  return { id: String(data._id), slug: data.slug, collection: data.collectionSlug, title: data.title, sentence: data.sentence, story: data.story, details: data.details, images: data.images, artist: data.artist, orientation: data.orientation, currency: data.currency, updatedAt: data.updatedAt,
    variants: data.variants.filter(item => item.available).map(({ provider, providerReference, shippingProfileId, ...item }) => item) };
}
export type ArtCartItem = { artworkId: string; variantId: string; quantity: number };
export function parseArtCart(value: unknown): { country: string; items: ArtCartItem[] } {
  const data = record(value);
  if (!ART_COUNTRIES.includes(String(data.country))) return invalid("Livraison : choisissez un pays de l’Union européenne.");
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 20) return invalid("Votre sélection doit contenir entre 1 et 20 lignes.");
  const keys = new Set<string>();
  const items = data.items.map(value => {
    const item = record(value);
    const artworkId = artString(item.artworkId, 24, "Œuvre", true);
    const variantId = artString(item.variantId, 80, "Variante", true);
    if (!/^[0-9a-f]{24}$/i.test(artworkId)) return invalid("Œuvre invalide.");
    const key = `${artworkId}:${variantId}`;
    if (keys.has(key)) return invalid("Regroupez les quantités d’une même variante.");
    keys.add(key);
    return { artworkId, variantId, quantity: integer(item.quantity, 1, 20, "Quantité") };
  });
  if (items.reduce((sum, item) => sum + item.quantity, 0) > 50) return invalid("Maximum 50 exemplaires par demande.");
  return { country: String(data.country), items };
}
export function quoteArtCart(cart: ReturnType<typeof parseArtCart>, artworks: Array<ArtArtworkInput & { _id: unknown }>) {
  const lines = cart.items.map(item => {
    const artwork = artworks.find(work => String(work._id) === item.artworkId && work.status === "published");
    const variant = artwork?.variants.find(variant => variant.id === item.variantId && variant.available);
    if (!artwork || !variant) return invalid("Une œuvre ou une variante de votre sélection n’est plus disponible.");
    if (!variant.countries.includes(cart.country)) return invalid("Une variante n’est pas disponible pour ce pays.");
    return { artworkId: item.artworkId, variantId: variant.id, title: artwork.title, slug: artwork.slug, image: artwork.images[0]?.url, material: variant.material, format: variant.format, unitPriceCents: variant.priceCents, quantity: item.quantity, lineTotalCents: variant.priceCents * item.quantity, fulfillment: variant.fulfillment, leadDaysMin: variant.leadDaysMin, leadDaysMax: variant.leadDaysMax };
  });
  return { country: cart.country, currency: "EUR" as const, lines, subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0), shippingPending: true as const, paymentEnabled: false as const };
}
export function parseArtRequest(value: unknown) {
  const data = record(value);
  const name = artString(data.name, 120, "Nom", true);
  const email = artString(data.email, 254, "Email", true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid("Adresse email invalide.");
  if (data.consent !== true) return invalid("Confirmez l’utilisation de vos coordonnées pour cette demande.");
  const locale = ["fr", "en", "nl"].includes(String(data.locale)) ? String(data.locale) : "fr";
  const message = artString(data.message, 3000, "Message");
  const idempotencyKey = artString(data.idempotencyKey, 36, "Référence de demande", true);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) return invalid("Référence de demande invalide.");
  return { name, email, locale, message, consent: true, idempotencyKey };
}
