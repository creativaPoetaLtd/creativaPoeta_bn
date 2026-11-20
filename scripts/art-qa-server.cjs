// Isolated QA only. This script always creates its own localhost MongoDB;
// it never reads a database URI or starts from production data.
const { MongoMemoryServer } = require(process.env.CP_ART_QA_MONGO_MODULE || "mongodb-memory-server-core");
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
process.env.CLOUDINARY_CLOUD_NAME = "cp-art-qa";
process.env.CLOUDINARY_API_KEY = "qa-not-a-real-key";
process.env.CLOUDINARY_API_SECRET = "qa-not-a-real-secret";
const stripeQA = process.env.CP_ART_QA_COMMERCE === "true" ? require("./art-stripe-qa.cjs") : null;
if (process.env.CP_ART_QA_TRANSLATION === "true") require("./art-translation-qa.cjs");
const sessionFile = path.resolve(process.env.CP_ART_QA_SESSION_PATH || "../cp-art-qa-session.json");
const text = fr => ({ fr, en: "", nl: "" });
let mongo, server;
async function stop(code = 0) {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
  process.exit(code);
}
(async () => {
  mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1", dbName: "cp_art_isolated_qa" } });
  await mongoose.connect(mongo.getUri(), { dbName: "cp_art_isolated_qa" });
  const app = require("../dist/app").default;
  const User = require("../dist/models/User").default;
  const Artwork = require("../dist/models/ArtArtwork").default;
  const { parseArtArtwork } = require("../dist/domain/artPolicy");
  const Request = require("../dist/models/ArtRequest").default;
  await Promise.all([User.init(), Artwork.init(), Request.init()]);
  const admin = await User.create({ name: "Admin QA local", email: "art-admin@example.test", role: "admin_0", accountStatus: "active", isActive: true });
  const viewer = await User.create({ name: "Compte sans accès Art", email: "art-viewer@example.test", role: "admin_5", accountStatus: "active", isActive: true });
  const jwt = require("jsonwebtoken");
  const sign = user => jwt.sign({ _id: String(user._id), email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const payload = { slug: "oeuvre-verification", collection: "art-et-decoration", title: text("Œuvre de vérification QA"), sentence: text("Une étude réservée aux tests locaux."), story: text("Cette fiche temporaire sert à vérifier le catalogue, les photos et les demandes. Elle ne fait pas partie du catalogue commercial."), artist: "Atelier QA local", details: [{ title: text("La lumière"), text: text("Un détail de test.") }], images: [{ url: "https://res.cloudinary.com/cp-art-qa/image/upload/v1/cp-art/le-passage.webp", alt: text("Vue complète de l’étude de test") }, { url: "https://res.cloudinary.com/cp-art-qa/image/upload/v1/cp-art/detail.webp", alt: text("Deuxième photo de vérification") }], variants: [{ id: "canvas-60", material: "canvas", format: "60 × 40 cm", priceCents: 7490, fulfillment: "studio", provider: "private-provider", providerReference: "private-reference", leadDaysMin: 3, leadDaysMax: 7, countries: ["BE", "FR"], available: true }, { id: "poster-60", material: "poster", format: "60 × 40 cm", priceCents: 3990, fulfillment: "print_on_demand", provider: "private-provider", providerReference: "private-reference", leadDaysMin: 2, leadDaysMax: 5, countries: ["BE", "FR"], available: true }], orientation: "landscape", status: "published", displayOrder: 0, currency: "EUR" };
  const artwork = await Artwork.create(parseArtArtwork(payload));
  await Artwork.create(parseArtArtwork({ ...payload, slug: "brouillon-prive", title: text("Brouillon privé QA"), status: "draft" }));
  const qaApp = require("express")();
  if (stripeQA) qaApp.get("/__qa/stripe/sessions/:id", (req, res) => { const session = stripeQA.sessions.get(req.params.id); res.status(session ? 200 : 404).json(session || {}); });
  qaApp.use(app);
  server = qaApp.listen(5190, "127.0.0.1", () => {
    fs.writeFileSync(sessionFile, JSON.stringify({ base: "http://127.0.0.1:5190", adminToken: sign(admin), viewerToken: sign(viewer), adminUser: { id: String(admin._id), name: admin.name, email: admin.email, role: "admin_0" }, artworkId: String(artwork._id), slug: payload.slug }));
    console.log("CP Art isolated QA API ready at http://127.0.0.1:5190 (temporary data only).");
  });
  process.stdin.on("data", data => { if (data.toString().trim() === "stop") void stop(); });
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
})().catch(error => { console.error(error); void stop(1); });
