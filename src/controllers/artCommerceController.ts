import crypto from "node:crypto";
import Stripe from "stripe";
import { Request } from "express";
import ArtCommerceSettings from "../models/ArtCommerceSettings";
import ArtOrder from "../models/ArtOrder";
import { artHandler } from "./artController";
import { ArtInputError, artString } from "../domain/artPolicy";
import { artPaymentReadiness, artPublicOrigin, emptyArtCommerce, object, parseArtCommerce } from "../domain/artCommerce";
import { artStripe, buildArtQuote, loadArtCommerce } from "../services/artCommerceService";

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
export const getArtSettings = artHandler(async (_req, res) => {
  const settings = await ArtCommerceSettings.findOne({ key: "cp-art" }).lean();
  const config = settings ? settings.config as ReturnType<typeof emptyArtCommerce> : emptyArtCommerce();
  res.json({ config, version: settings?.__v ?? -1, readiness: artPaymentReadiness(config) });
});
export const saveArtSettings = artHandler(async (req, res) => {
  const config = parseArtCommerce(req.body.config);
  let settings = await ArtCommerceSettings.findOne({ key: "cp-art" });
  if (req.body.version !== (settings?.__v ?? -1)) { res.status(409).json({ message: "Configuration modifiée entre-temps. Rechargez-la." }); return; }
  if (settings) { settings.config = config; settings.markModified("config"); await settings.save(); }
  else settings = await ArtCommerceSettings.create({ key: "cp-art", config });
  res.json({ config, version: settings.__v, readiness: artPaymentReadiness(config) });
});
export const createArtCheckout = artHandler(async (req, res) => {
  const config = await loadArtCommerce();
  if (!artPaymentReadiness(config).enabled) { res.status(503).json({ message: "Les paiements CP Art ne sont pas encore ouverts. Vous pouvez envoyer une demande à l’atelier." }); return; }
  const data = object(req.body);
  const accessToken = artString(data.accessToken, 64, "Accès à la commande", true);
  const idempotencyKey = artString(data.idempotencyKey, 36, "Référence de paiement", true);
  if (!/^[A-Za-z0-9_-]{43}$/.test(accessToken) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new ArtInputError("Référence de paiement invalide.");
  if (data.acceptTerms !== true || data.termsVersion !== config.termsVersion) throw new ArtInputError("Acceptez les conditions de vente à jour.");
  const locale = ["fr", "en", "nl"].includes(String(data.locale)) ? String(data.locale) as "fr" | "en" | "nl" : "fr";
  const quote = await buildArtQuote(data, config);
  if (!quote.paymentEnabled || quote.totalCents === null) throw new ArtInputError("La livraison doit être chiffrée pour chaque partie de la sélection.");
  if (quote.totalCents < 50 || quote.totalCents > 99_999_999) throw new ArtInputError("Le total de cette sélection ne peut pas être encaissé en ligne. Contactez l’atelier.");
  if (data.digest !== quote.digest) { res.status(409).json({ message: "Les prix ou les conditions ont changé. Vérifiez le nouveau total avant de continuer." }); return; }
  const fingerprint = hash(JSON.stringify({ digest: quote.digest, locale, accessHash: hash(accessToken), termsVersion: config.termsVersion }));
  let order = await ArtOrder.findOne({ idempotencyKey }).select("+fingerprint +sessionId +checkoutUrl +checkoutInput");
  if (order && order.fingerprint !== fingerprint) throw new ArtInputError("Cette référence correspond à un autre paiement. Préparez une nouvelle sélection.");
  if (!order) order = await ArtOrder.create({ reference: `CPAO-${new Date().getUTCFullYear()}-${crypto.randomBytes(8).toString("hex").toUpperCase()}`, idempotencyKey, fingerprint, accessHash: hash(accessToken), mode: config.mode, quote, checkoutInput: { locale, taxCode: config.taxCode, termsUrl: config.termsUrl, origin: artPublicOrigin() }, termsVersion: config.termsVersion, termsAcceptedAt: new Date(), expiresAt: new Date(Date.now() + 60 * 60_000) });
  if (order.paymentStatus !== "pending" || order.expiresAt.getTime() <= Date.now()) { res.status(409).json({ message: "Ce paiement est terminé ou a expiré. Préparez une nouvelle sélection." }); return; }
  if (!order.sessionId) {
    if (order.expiresAt.getTime() - Date.now() < 31 * 60_000) { res.status(409).json({ message: "Ce paiement a expiré. Préparez une nouvelle sélection." }); return; }
    const snapshot = order.quote as typeof quote;
    const input = order.checkoutInput as { locale: "fr" | "en" | "nl"; taxCode: string; termsUrl: string; origin: string };
    const receipt = `${input.origin}/${input.locale}/art/commande#reference=${order.reference}&token=${accessToken}`;
    const session = await artStripe(order.mode as "test" | "live").checkout.sessions.create({
      mode: "payment", locale: input.locale, submit_type: "pay", client_reference_id: order.reference,
      metadata: { artOrderId: String(order._id), artReference: order.reference },
      payment_intent_data: { metadata: { artOrderId: String(order._id), artReference: order.reference } },
      automatic_tax: { enabled: true }, billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: [snapshot.country as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry] },
      line_items: snapshot.lines.map(line => ({ quantity: line.quantity, price_data: { currency: "eur", unit_amount: line.unitPriceCents, tax_behavior: "inclusive", product_data: { name: line.title[input.locale] || line.title.fr, description: `${line.material} · ${line.format}`, tax_code: input.taxCode } } })),
      shipping_options: [{ shipping_rate_data: { type: "fixed_amount", fixed_amount: { amount: snapshot.shippingCents!, currency: "eur" }, display_name: snapshot.shippingGroups.map(group => group.options.find(option => option.id === group.selectedMethodId)?.label).join(" + ").slice(0, 100), tax_behavior: "inclusive", tax_code: "txcd_92010001" } }],
      consent_collection: { terms_of_service: "required" },
      custom_text: { terms_of_service_acceptance: { message: `Conditions de vente : [consulter](${input.termsUrl})` } },
      success_url: receipt, cancel_url: `${receipt}&cancelled=1`, expires_at: Math.floor(order.expiresAt.getTime() / 1000),
    }, { idempotencyKey: `cp-art-${order._id}` });
    if (!session.url || new URL(session.url).origin !== "https://checkout.stripe.com" || session.livemode !== (order.mode === "live")) throw new Error("ArtCheckoutSessionInvalid");
    order.sessionId = session.id; order.checkoutUrl = session.url; await order.save();
  }
  res.json({ reference: order.reference, url: order.checkoutUrl, mode: order.mode });
});
export const getArtOrderStatus = artHandler(async (req, res) => {
  const reference = artString(req.body.reference, 50, "Référence", true);
  const token = artString(req.body.accessToken, 64, "Accès", true);
  if (!/^CPAO-\d{4}-[0-9A-F]{16}$/.test(reference) || !/^[A-Za-z0-9_-]{43}$/.test(token)) { res.status(404).json({ message: "Commande introuvable." }); return; }
  const order = await ArtOrder.findOne({ reference, accessHash: hash(token) }).lean();
  if (!order) { res.status(404).json({ message: "Commande introuvable." }); return; }
  const quote = order.quote as { totalCents: number; currency: string };
  res.json({ reference: order.reference, mode: order.mode, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, totalCents: quote.totalCents, currency: quote.currency, trackingUrl: order.trackingUrl });
});
export const listArtOrders = artHandler(async (_req, res) => { res.json({ orders: await ArtOrder.find().sort({ createdAt: -1 }).limit(200).lean() }); });
export const updateArtOrder = artHandler(async (req, res) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) throw new ArtInputError("Identifiant invalide.");
  const order = await ArtOrder.findById(req.params.id);
  if (!order) { res.status(404).json({ message: "Commande introuvable." }); return; }
  if (req.body.version !== order.__v) { res.status(409).json({ message: "Commande modifiée entre-temps. Rechargez la liste." }); return; }
  const state = req.body.fulfillmentStatus;
  if (!["unprocessed", "preparing", "shipped", "delivered", "on_hold"].includes(state)) throw new ArtInputError("Statut de préparation invalide.");
  if (["preparing", "shipped", "delivered"].includes(state) && order.paymentStatus !== "paid") throw new ArtInputError("Le paiement doit être confirmé avant la préparation ou l’expédition.");
  const trackingUrl = artString(req.body.trackingUrl, 500, "Lien de suivi");
  if (trackingUrl) { try { const url = new URL(trackingUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); } catch { throw new ArtInputError("Le lien de suivi doit être une adresse HTTPS."); } }
  order.fulfillmentStatus = state; order.trackingUrl = trackingUrl; order.internalNote = artString(req.body.internalNote, 3000, "Note interne");
  await order.save(); res.json({ order });
});

// Signature verification uses the exact bytes captured by express.json.verify.
// Both signing secrets remain accepted when new checkouts are disabled.
export const receiveArtStripeWebhook = artHandler(async (req: Request & { rawBody?: Buffer }, res) => {
  const signature = req.get("stripe-signature");
  if (!signature || !req.rawBody) { res.status(400).json({ message: "Signature requise." }); return; }
  let event: Stripe.Event | undefined;
  for (const mode of ["TEST", "LIVE"]) {
    const secret = process.env[`ART_STRIPE_${mode}_WEBHOOK_SECRET`];
    if (!secret) continue;
    try { const verified = Stripe.webhooks.constructEvent(req.rawBody, signature, secret); if (verified.livemode === (mode === "LIVE")) { event = verified; break; } } catch { /* Try the other independently configured environment. */ }
  }
  if (!event) { res.status(400).json({ message: "Signature invalide." }); return; }
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (intent) {
      const mode = event.livemode ? "live" : "test";
      let order = await ArtOrder.findOne({ paymentIntentId: intent, mode }).select("+processedEvents +paymentIntentId");
      // Refunds can be delivered before the checkout completion webhook.
      // Resolve the immutable order metadata from Stripe rather than dropping them.
      if (!order) {
        const payment = await artStripe(mode).paymentIntents.retrieve(intent);
        const orderId = payment.metadata?.artOrderId;
        if (orderId && /^[a-f0-9]{24}$/i.test(orderId) && payment.livemode === event.livemode) {
          order = await ArtOrder.findOne({ _id: orderId, mode, reference: payment.metadata.artReference }).select("+processedEvents +paymentIntentId");
          if (order && order.paymentIntentId && order.paymentIntentId !== intent) throw new Error("ArtRefundIntentMismatch");
          if (order) order.paymentIntentId = intent;
        }
      }
      if (order && !order.processedEvents.includes(event.id)) {
        const total = (order.quote as any).totalCents;
        if (charge.livemode !== event.livemode || charge.currency !== "eur" || charge.amount !== total || !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > total) { order.paymentStatus = "review_required"; order.fulfillmentStatus = "on_hold"; }
        else if (charge.amount_refunded > order.refundedCents) { order.refundedCents = charge.amount_refunded; order.paymentStatus = charge.amount_refunded === total ? "refunded" : "partially_refunded"; order.fulfillmentStatus = "on_hold"; }
        order.processedEvents.push(event.id); await order.save();
      }
    }
    res.json({ received: true }); return;
  }
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) { res.json({ received: true }); return; }
  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.artOrderId;
  if (!orderId || !/^[a-f0-9]{24}$/i.test(orderId)) { res.json({ received: true }); return; }
  const order = await ArtOrder.findById(orderId).select("+sessionId +paymentIntentId +processedEvents");
  if (!order || order.processedEvents.includes(event.id)) { res.json({ received: true }); return; }
  // A webhook can arrive before a failed/slow create response is saved. Retry later.
  if (!order.sessionId) { res.status(503).json({ message: "Session en cours d’enregistrement." }); return; }
  const quote = order.quote as any;
  const shipping = session.collected_information?.shipping_details;
  const paid = session.payment_status === "paid" && ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type);
  const mismatch = order.sessionId !== session.id || session.client_reference_id !== order.reference || session.livemode !== (order.mode === "live") || event.livemode !== session.livemode || (paid && (session.currency !== "eur" || session.amount_total !== quote.totalCents || shipping?.address?.country !== quote.country || session.consent?.terms_of_service !== "accepted"));
  if (mismatch) { order.paymentStatus = "review_required"; order.fulfillmentStatus = "on_hold"; }
  else if (paid && !["refunded", "partially_refunded", "review_required"].includes(order.paymentStatus)) {
    order.paymentStatus = "paid"; order.paidAt ||= new Date(event.created * 1000);
    order.paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    order.customer = { email: session.customer_details?.email, name: shipping?.name || session.customer_details?.name, address: shipping?.address, phone: session.customer_details?.phone };
  } else if (order.paymentStatus === "pending" && event.type === "checkout.session.async_payment_failed") order.paymentStatus = "failed";
  else if (order.paymentStatus === "pending" && event.type === "checkout.session.expired") order.paymentStatus = "expired";
  if (!mismatch && session.payment_intent) order.paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
  order.processedEvents.push(event.id); await order.save(); res.json({ received: true });
});

export const getArtShippingProfiles = artHandler(async (_req, res) => { const config = await loadArtCommerce(); res.json({ profiles: config.profiles.map(({ id, label, fulfillment }) => ({ id, label, fulfillment })) }); });
