"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateArtRequest = exports.listArtRequests = exports.createArtRequest = exports.getArtQuote = exports.uploadArtImage = exports.updateArt = exports.createArt = exports.listAdminArt = exports.listPublicArt = exports.artHandler = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const ArtArtwork_1 = __importDefault(require("../models/ArtArtwork"));
const ArtRequest_1 = __importDefault(require("../models/ArtRequest"));
const cloudinary_1 = __importDefault(require("../utils/cloudinary"));
const artPolicy_1 = require("../domain/artPolicy");
const artHandler = (handler) => async (req, res, _next) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        await handler(req, res);
    }
    catch (error) {
        if (error instanceof artPolicy_1.ArtInputError || error instanceof mongoose_1.default.Error.ValidationError) {
            res.status(400).json({ message: error.message });
            return;
        }
        if (error.code === 11000) {
            res.status(409).json({ message: "Cette adresse ou référence existe déjà. Rechargez les données." });
            return;
        }
        if (error instanceof mongoose_1.default.Error.VersionError) {
            res.status(409).json({ message: "Cette fiche a été modifiée entre-temps. Rechargez-la avant de réessayer." });
            return;
        }
        console.error("CP Art request failed:", error instanceof Error ? error.name : "unknown_error");
        res.status(500).json({ message: "Impossible de traiter cette opération CP Art. Réessayez plus tard." });
    }
};
exports.artHandler = artHandler;
const validId = (id) => { if (!/^[a-f0-9]{24}$/i.test(id))
    throw new artPolicy_1.ArtInputError("Identifiant invalide."); };
const adminArtwork = (value) => { const data = value.toObject ? value.toObject() : value; return { ...data, collection: data.collectionSlug }; };
exports.listPublicArt = (0, exports.artHandler)(async (_req, res) => {
    const artworks = await ArtArtwork_1.default.find({ status: "published" }).sort({ displayOrder: 1, createdAt: -1 }).limit(200).lean();
    res.json({ artworks: artworks.map(work => (0, artPolicy_1.publicArtwork)(work)), paymentEnabled: false });
});
exports.listAdminArt = (0, exports.artHandler)(async (_req, res) => {
    res.json({ artworks: (await ArtArtwork_1.default.find().sort({ updatedAt: -1 }).limit(300).lean()).map(adminArtwork), paymentEnabled: false });
});
exports.createArt = (0, exports.artHandler)(async (req, res) => {
    const payload = (0, artPolicy_1.parseArtArtwork)(req.body);
    const artwork = await ArtArtwork_1.default.create(payload);
    res.status(201).json({ artwork: adminArtwork(artwork) });
});
exports.updateArt = (0, exports.artHandler)(async (req, res) => {
    validId(req.params.id);
    const artwork = await ArtArtwork_1.default.findById(req.params.id);
    if (!artwork) {
        res.status(404).json({ message: "Œuvre introuvable." });
        return;
    }
    if (typeof req.body.version !== "number" || req.body.version !== artwork.__v) {
        res.status(409).json({ message: "Cette fiche a changé. Rechargez-la avant de l’enregistrer." });
        return;
    }
    const payload = (0, artPolicy_1.parseArtArtwork)(req.body);
    artwork.set(payload);
    await artwork.save();
    res.json({ artwork: adminArtwork(artwork) });
});
exports.uploadArtImage = (0, exports.artHandler)(async (req, res) => {
    var _a;
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        res.status(503).json({ message: "Le stockage des photos n’est pas encore configuré." });
        return;
    }
    const buffer = (_a = req.file) === null || _a === void 0 ? void 0 : _a.buffer;
    const valid = buffer && ((buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) || buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"));
    if (!valid)
        throw new artPolicy_1.ArtInputError("Choisissez une véritable image JPEG, PNG ou WebP.");
    const result = await new Promise((resolve, reject) => {
        const stream = cloudinary_1.default.uploader.upload_stream({ folder: "cp-art", resource_type: "image", allowed_formats: ["jpg", "jpeg", "png", "webp"], format: "webp", transformation: [{ width: 2400, height: 2400, crop: "limit" }] }, (error, result) => { if (error || !result)
            reject(error || new Error("Upload failed"));
        else
            resolve(result); });
        stream.end(buffer);
    });
    res.status(201).json({ image: { url: result.secure_url, alt: { fr: "", en: "", nl: "" } } });
});
const buildQuote = async (body) => {
    const cart = (0, artPolicy_1.parseArtCart)(body);
    const artworks = await ArtArtwork_1.default.find({ _id: { $in: cart.items.map(item => item.artworkId) }, status: "published" }).lean();
    return (0, artPolicy_1.quoteArtCart)(cart, artworks);
};
exports.getArtQuote = (0, exports.artHandler)(async (req, res) => { res.json({ quote: await buildQuote(req.body) }); });
exports.createArtRequest = (0, exports.artHandler)(async (req, res) => {
    const contact = (0, artPolicy_1.parseArtRequest)(req.body);
    const cart = (0, artPolicy_1.parseArtCart)(req.body);
    const requestFingerprint = node_crypto_1.default.createHash("sha256").update(JSON.stringify({ name: contact.name, email: contact.email, locale: contact.locale, message: contact.message, cart })).digest("hex");
    const existing = await ArtRequest_1.default.findOne({ idempotencyKey: contact.idempotencyKey }).select("reference email +requestFingerprint").lean();
    if (existing) {
        if (existing.email !== contact.email || existing.requestFingerprint !== requestFingerprint)
            throw new artPolicy_1.ArtInputError("Cette référence correspond à une autre demande. Préparez une nouvelle demande.");
        res.json({ reference: existing.reference, status: "received", paymentEnabled: false });
        return;
    }
    const quote = await buildQuote(req.body);
    const reference = `CPA-${new Date().getUTCFullYear()}-${node_crypto_1.default.randomBytes(6).toString("hex").toUpperCase()}`;
    const request = await ArtRequest_1.default.create({ ...contact, quote, reference, requestFingerprint, consentAt: new Date(), paymentStatus: "not_requested" });
    res.status(201).json({ reference: request.reference, status: "received", paymentEnabled: false });
});
exports.listArtRequests = (0, exports.artHandler)(async (_req, res) => {
    res.json({ requests: await ArtRequest_1.default.find().sort({ createdAt: -1 }).limit(200).lean() });
});
exports.updateArtRequest = (0, exports.artHandler)(async (req, res) => {
    validId(req.params.id);
    if (!["new", "contacted", "closed"].includes(req.body.status) || typeof req.body.internalNote !== "string" || req.body.internalNote.length > 3000)
        throw new artPolicy_1.ArtInputError("Statut ou note invalide.");
    const request = await ArtRequest_1.default.findById(req.params.id);
    if (!request) {
        res.status(404).json({ message: "Demande introuvable." });
        return;
    }
    if (req.body.version !== request.__v) {
        res.status(409).json({ message: "Demande modifiée entre-temps. Rechargez la liste." });
        return;
    }
    request.status = req.body.status;
    request.internalNote = req.body.internalNote.trim();
    await request.save();
    res.json({ request });
});
