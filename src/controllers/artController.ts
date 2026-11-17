import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import ArtArtwork from "../models/ArtArtwork";
import ArtRequest from "../models/ArtRequest";
import cloudinary from "../utils/cloudinary";
import { ArtInputError, parseArtArtwork, parseArtCart, parseArtRequest, publicArtwork, quoteArtCart } from "../domain/artPolicy";

export const artHandler = (handler: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response, _next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store");
  try { await handler(req, res); } catch (error) {
    if (error instanceof ArtInputError || error instanceof mongoose.Error.ValidationError) { res.status(400).json({ message: error.message }); return; }
    if ((error as { code?: number }).code === 11000) { res.status(409).json({ message: "Cette adresse ou référence existe déjà. Rechargez les données." }); return; }
    if (error instanceof mongoose.Error.VersionError) { res.status(409).json({ message: "Cette fiche a été modifiée entre-temps. Rechargez-la avant de réessayer." }); return; }
    console.error("CP Art request failed:", error instanceof Error ? error.name : "unknown_error");
    res.status(500).json({ message: "Impossible de traiter cette opération CP Art. Réessayez plus tard." });
  }
};
const validId = (id: string) => { if (!/^[a-f0-9]{24}$/i.test(id)) throw new ArtInputError("Identifiant invalide."); };
const adminArtwork = (value: any) => { const data = value.toObject ? value.toObject() : value; return { ...data, collection: data.collectionSlug }; };
export const listPublicArt = artHandler(async (_req, res) => {
  const artworks = await ArtArtwork.find({ status: "published" }).sort({ displayOrder: 1, createdAt: -1 }).limit(200).lean();
  res.json({ artworks: artworks.map(work => publicArtwork(work as any)), paymentEnabled: false });
});
export const listAdminArt = artHandler(async (_req, res) => {
  res.json({ artworks: (await ArtArtwork.find().sort({ updatedAt: -1 }).limit(300).lean()).map(adminArtwork), paymentEnabled: false });
});
export const createArt = artHandler(async (req, res) => {
  const payload = parseArtArtwork(req.body);
  const artwork = await ArtArtwork.create(payload);
  res.status(201).json({ artwork: adminArtwork(artwork) });
});
export const updateArt = artHandler(async (req, res) => {
  validId(req.params.id);
  const artwork = await ArtArtwork.findById(req.params.id);
  if (!artwork) { res.status(404).json({ message: "Œuvre introuvable." }); return; }
  if (typeof req.body.version !== "number" || req.body.version !== artwork.__v) { res.status(409).json({ message: "Cette fiche a changé. Rechargez-la avant de l’enregistrer." }); return; }
  const payload = parseArtArtwork(req.body);
  artwork.set(payload);
  await artwork.save();
  res.json({ artwork: adminArtwork(artwork) });
});
export const uploadArtImage = artHandler(async (req, res) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) { res.status(503).json({ message: "Le stockage des photos n’est pas encore configuré." }); return; }
  const buffer = req.file?.buffer;
  const valid = buffer && ((buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) || buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"));
  if (!valid) throw new ArtInputError("Choisissez une véritable image JPEG, PNG ou WebP.");
  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: "cp-art", resource_type: "image", allowed_formats: ["jpg", "jpeg", "png", "webp"], format: "webp", transformation: [{ width: 2400, height: 2400, crop: "limit" }] }, (error, result) => { if (error || !result) reject(error || new Error("Upload failed")); else resolve(result); });
    stream.end(buffer);
  });
  res.status(201).json({ image: { url: result.secure_url, alt: { fr: "", en: "", nl: "" } } });
});
const buildQuote = async (body: unknown) => {
  const cart = parseArtCart(body);
  const artworks = await ArtArtwork.find({ _id: { $in: cart.items.map(item => item.artworkId) }, status: "published" }).lean();
  return quoteArtCart(cart, artworks as any);
};
export const getArtQuote = artHandler(async (req, res) => { res.json({ quote: await buildQuote(req.body) }); });
export const createArtRequest = artHandler(async (req, res) => {
  const contact = parseArtRequest(req.body);
  const cart = parseArtCart(req.body);
  const requestFingerprint = crypto.createHash("sha256").update(JSON.stringify({ name: contact.name, email: contact.email, locale: contact.locale, message: contact.message, cart })).digest("hex");
  const existing = await ArtRequest.findOne({ idempotencyKey: contact.idempotencyKey }).select("reference email +requestFingerprint").lean();
  if (existing) {
    if (existing.email !== contact.email || existing.requestFingerprint !== requestFingerprint) throw new ArtInputError("Cette référence correspond à une autre demande. Préparez une nouvelle demande.");
    res.json({ reference: existing.reference, status: "received", paymentEnabled: false }); return;
  }
  const quote = await buildQuote(req.body);
  const reference = `CPA-${new Date().getUTCFullYear()}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  const request = await ArtRequest.create({ ...contact, quote, reference, requestFingerprint, consentAt: new Date(), paymentStatus: "not_requested" });
  res.status(201).json({ reference: request.reference, status: "received", paymentEnabled: false });
});
export const listArtRequests = artHandler(async (_req, res) => {
  res.json({ requests: await ArtRequest.find().sort({ createdAt: -1 }).limit(200).lean() });
});
export const updateArtRequest = artHandler(async (req, res) => {
  validId(req.params.id);
  if (!["new", "contacted", "closed"].includes(req.body.status) || typeof req.body.internalNote !== "string" || req.body.internalNote.length > 3000) throw new ArtInputError("Statut ou note invalide.");
  const request = await ArtRequest.findById(req.params.id);
  if (!request) { res.status(404).json({ message: "Demande introuvable." }); return; }
  if (req.body.version !== request.__v) { res.status(409).json({ message: "Demande modifiée entre-temps. Rechargez la liste." }); return; }
  request.status = req.body.status;
  request.internalNote = req.body.internalNote.trim();
  await request.save();
  res.json({ request });
});
