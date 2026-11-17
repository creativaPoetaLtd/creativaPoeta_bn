"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getArtShippingProfiles = exports.receiveArtStripeWebhook = exports.updateArtOrder = exports.listArtOrders = exports.getArtOrderStatus = exports.createArtCheckout = exports.saveArtSettings = exports.getArtSettings = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const stripe_1 = __importDefault(require("stripe"));
const ArtCommerceSettings_1 = __importDefault(require("../models/ArtCommerceSettings"));
const ArtOrder_1 = __importDefault(require("../models/ArtOrder"));
const artController_1 = require("./artController");
const artPolicy_1 = require("../domain/artPolicy");
const artCommerce_1 = require("../domain/artCommerce");
const artCommerceService_1 = require("../services/artCommerceService");
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
exports.getArtSettings = (0, artController_1.artHandler)(async (_req, res) => {
    var _a;
    const settings = await ArtCommerceSettings_1.default.findOne({ key: "cp-art" }).lean();
    const config = settings ? settings.config : (0, artCommerce_1.emptyArtCommerce)();
    res.json({ config, version: (_a = settings === null || settings === void 0 ? void 0 : settings.__v) !== null && _a !== void 0 ? _a : -1, readiness: (0, artCommerce_1.artPaymentReadiness)(config) });
});
exports.saveArtSettings = (0, artController_1.artHandler)(async (req, res) => {
    var _a;
    const config = (0, artCommerce_1.parseArtCommerce)(req.body.config);
    let settings = await ArtCommerceSettings_1.default.findOne({ key: "cp-art" });
    if (req.body.version !== ((_a = settings === null || settings === void 0 ? void 0 : settings.__v) !== null && _a !== void 0 ? _a : -1)) {
        res.status(409).json({ message: "Configuration modifiée entre-temps. Rechargez-la." });
        return;
    }
    if (settings) {
        settings.config = config;
        settings.markModified("config");
        await settings.save();
    }
    else
        settings = await ArtCommerceSettings_1.default.create({ key: "cp-art", config });
    res.json({ config, version: settings.__v, readiness: (0, artCommerce_1.artPaymentReadiness)(config) });
});
exports.createArtCheckout = (0, artController_1.artHandler)(async (req, res) => {
    const config = await (0, artCommerceService_1.loadArtCommerce)();
    if (!(0, artCommerce_1.artPaymentReadiness)(config).enabled) {
        res.status(503).json({ message: "Les paiements CP Art ne sont pas encore ouverts. Vous pouvez envoyer une demande à l’atelier." });
        return;
    }
    const data = (0, artCommerce_1.object)(req.body);
    const accessToken = (0, artPolicy_1.artString)(data.accessToken, 64, "Accès à la commande", true);
    const idempotencyKey = (0, artPolicy_1.artString)(data.idempotencyKey, 36, "Référence de paiement", true);
    if (!/^[A-Za-z0-9_-]{43}$/.test(accessToken) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey))
        throw new artPolicy_1.ArtInputError("Référence de paiement invalide.");
    if (data.acceptTerms !== true || data.termsVersion !== config.termsVersion)
        throw new artPolicy_1.ArtInputError("Acceptez les conditions de vente à jour.");
    const locale = ["fr", "en", "nl"].includes(String(data.locale)) ? String(data.locale) : "fr";
    const quote = await (0, artCommerceService_1.buildArtQuote)(data, config);
    if (!quote.paymentEnabled || quote.totalCents === null)
        throw new artPolicy_1.ArtInputError("La livraison doit être chiffrée pour chaque partie de la sélection.");
    if (quote.totalCents < 50 || quote.totalCents > 99999999)
        throw new artPolicy_1.ArtInputError("Le total de cette sélection ne peut pas être encaissé en ligne. Contactez l’atelier.");
    if (data.digest !== quote.digest) {
        res.status(409).json({ message: "Les prix ou les conditions ont changé. Vérifiez le nouveau total avant de continuer." });
        return;
    }
    const fingerprint = hash(JSON.stringify({ digest: quote.digest, locale, accessHash: hash(accessToken), termsVersion: config.termsVersion }));
    let order = await ArtOrder_1.default.findOne({ idempotencyKey }).select("+fingerprint +sessionId +checkoutUrl +checkoutInput");
    if (order && order.fingerprint !== fingerprint)
        throw new artPolicy_1.ArtInputError("Cette référence correspond à un autre paiement. Préparez une nouvelle sélection.");
    if (!order)
        order = await ArtOrder_1.default.create({ reference: `CPAO-${new Date().getUTCFullYear()}-${node_crypto_1.default.randomBytes(8).toString("hex").toUpperCase()}`, idempotencyKey, fingerprint, accessHash: hash(accessToken), mode: config.mode, quote, checkoutInput: { locale, taxCode: config.taxCode, termsUrl: config.termsUrl, origin: (0, artCommerce_1.artPublicOrigin)() }, termsVersion: config.termsVersion, termsAcceptedAt: new Date(), expiresAt: new Date(Date.now() + 60 * 60000) });
    if (order.paymentStatus !== "pending" || order.expiresAt.getTime() <= Date.now()) {
        res.status(409).json({ message: "Ce paiement est terminé ou a expiré. Préparez une nouvelle sélection." });
        return;
    }
    if (!order.sessionId) {
        if (order.expiresAt.getTime() - Date.now() < 31 * 60000) {
            res.status(409).json({ message: "Ce paiement a expiré. Préparez une nouvelle sélection." });
            return;
        }
        const snapshot = order.quote;
        const input = order.checkoutInput;
        const receipt = `${input.origin}/${input.locale}/art/commande#reference=${order.reference}&token=${accessToken}`;
        const session = await (0, artCommerceService_1.artStripe)(order.mode).checkout.sessions.create({
            mode: "payment", locale: input.locale, submit_type: "pay", client_reference_id: order.reference,
            metadata: { artOrderId: String(order._id), artReference: order.reference },
            payment_intent_data: { metadata: { artOrderId: String(order._id), artReference: order.reference } },
            automatic_tax: { enabled: true }, billing_address_collection: "required",
            shipping_address_collection: { allowed_countries: [snapshot.country] },
            line_items: snapshot.lines.map(line => ({ quantity: line.quantity, price_data: { currency: "eur", unit_amount: line.unitPriceCents, tax_behavior: "inclusive", product_data: { name: line.title[input.locale] || line.title.fr, description: `${line.material} · ${line.format}`, tax_code: input.taxCode } } })),
            shipping_options: [{ shipping_rate_data: { type: "fixed_amount", fixed_amount: { amount: snapshot.shippingCents, currency: "eur" }, display_name: snapshot.shippingGroups.map(group => { var _a; return (_a = group.options.find(option => option.id === group.selectedMethodId)) === null || _a === void 0 ? void 0 : _a.label; }).join(" + ").slice(0, 100), tax_behavior: "inclusive", tax_code: "txcd_92010001" } }],
            consent_collection: { terms_of_service: "required" },
            custom_text: { terms_of_service_acceptance: { message: `Conditions de vente : [consulter](${input.termsUrl})` } },
            success_url: receipt, cancel_url: `${receipt}&cancelled=1`, expires_at: Math.floor(order.expiresAt.getTime() / 1000),
        }, { idempotencyKey: `cp-art-${order._id}` });
        if (!session.url || new URL(session.url).origin !== "https://checkout.stripe.com" || session.livemode !== (order.mode === "live"))
            throw new Error("ArtCheckoutSessionInvalid");
        order.sessionId = session.id;
        order.checkoutUrl = session.url;
        await order.save();
    }
    res.json({ reference: order.reference, url: order.checkoutUrl, mode: order.mode });
});
exports.getArtOrderStatus = (0, artController_1.artHandler)(async (req, res) => {
    const reference = (0, artPolicy_1.artString)(req.body.reference, 50, "Référence", true);
    const token = (0, artPolicy_1.artString)(req.body.accessToken, 64, "Accès", true);
    if (!/^CPAO-\d{4}-[0-9A-F]{16}$/.test(reference) || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        res.status(404).json({ message: "Commande introuvable." });
        return;
    }
    const order = await ArtOrder_1.default.findOne({ reference, accessHash: hash(token) }).lean();
    if (!order) {
        res.status(404).json({ message: "Commande introuvable." });
        return;
    }
    const quote = order.quote;
    res.json({ reference: order.reference, mode: order.mode, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, totalCents: quote.totalCents, currency: quote.currency, trackingUrl: order.trackingUrl });
});
exports.listArtOrders = (0, artController_1.artHandler)(async (_req, res) => { res.json({ orders: await ArtOrder_1.default.find().sort({ createdAt: -1 }).limit(200).lean() }); });
exports.updateArtOrder = (0, artController_1.artHandler)(async (req, res) => {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id))
        throw new artPolicy_1.ArtInputError("Identifiant invalide.");
    const order = await ArtOrder_1.default.findById(req.params.id);
    if (!order) {
        res.status(404).json({ message: "Commande introuvable." });
        return;
    }
    if (req.body.version !== order.__v) {
        res.status(409).json({ message: "Commande modifiée entre-temps. Rechargez la liste." });
        return;
    }
    const state = req.body.fulfillmentStatus;
    if (!["unprocessed", "preparing", "shipped", "delivered", "on_hold"].includes(state))
        throw new artPolicy_1.ArtInputError("Statut de préparation invalide.");
    if (["preparing", "shipped", "delivered"].includes(state) && order.paymentStatus !== "paid")
        throw new artPolicy_1.ArtInputError("Le paiement doit être confirmé avant la préparation ou l’expédition.");
    const trackingUrl = (0, artPolicy_1.artString)(req.body.trackingUrl, 500, "Lien de suivi");
    if (trackingUrl) {
        try {
            const url = new URL(trackingUrl);
            if (url.protocol !== "https:" || url.username || url.password)
                throw new Error();
        }
        catch {
            throw new artPolicy_1.ArtInputError("Le lien de suivi doit être une adresse HTTPS.");
        }
    }
    order.fulfillmentStatus = state;
    order.trackingUrl = trackingUrl;
    order.internalNote = (0, artPolicy_1.artString)(req.body.internalNote, 3000, "Note interne");
    await order.save();
    res.json({ order });
});
// Signature verification uses the exact bytes captured by express.json.verify.
// Both signing secrets remain accepted when new checkouts are disabled.
exports.receiveArtStripeWebhook = (0, artController_1.artHandler)(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const signature = req.get("stripe-signature");
    if (!signature || !req.rawBody) {
        res.status(400).json({ message: "Signature requise." });
        return;
    }
    let event;
    for (const mode of ["TEST", "LIVE"]) {
        const secret = process.env[`ART_STRIPE_${mode}_WEBHOOK_SECRET`];
        if (!secret)
            continue;
        try {
            const verified = stripe_1.default.webhooks.constructEvent(req.rawBody, signature, secret);
            if (verified.livemode === (mode === "LIVE")) {
                event = verified;
                break;
            }
        }
        catch { /* Try the other independently configured environment. */ }
    }
    if (!event) {
        res.status(400).json({ message: "Signature invalide." });
        return;
    }
    if (event.type === "charge.refunded") {
        const charge = event.data.object;
        const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : (_a = charge.payment_intent) === null || _a === void 0 ? void 0 : _a.id;
        if (intent) {
            const mode = event.livemode ? "live" : "test";
            let order = await ArtOrder_1.default.findOne({ paymentIntentId: intent, mode }).select("+processedEvents +paymentIntentId");
            // Refunds can be delivered before the checkout completion webhook.
            // Resolve the immutable order metadata from Stripe rather than dropping them.
            if (!order) {
                const payment = await (0, artCommerceService_1.artStripe)(mode).paymentIntents.retrieve(intent);
                const orderId = (_b = payment.metadata) === null || _b === void 0 ? void 0 : _b.artOrderId;
                if (orderId && /^[a-f0-9]{24}$/i.test(orderId) && payment.livemode === event.livemode) {
                    order = await ArtOrder_1.default.findOne({ _id: orderId, mode, reference: payment.metadata.artReference }).select("+processedEvents +paymentIntentId");
                    if (order && order.paymentIntentId && order.paymentIntentId !== intent)
                        throw new Error("ArtRefundIntentMismatch");
                    if (order)
                        order.paymentIntentId = intent;
                }
            }
            if (order && !order.processedEvents.includes(event.id)) {
                const total = order.quote.totalCents;
                if (charge.livemode !== event.livemode || charge.currency !== "eur" || charge.amount !== total || !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > total) {
                    order.paymentStatus = "review_required";
                    order.fulfillmentStatus = "on_hold";
                }
                else if (charge.amount_refunded > order.refundedCents) {
                    order.refundedCents = charge.amount_refunded;
                    order.paymentStatus = charge.amount_refunded === total ? "refunded" : "partially_refunded";
                    order.fulfillmentStatus = "on_hold";
                }
                order.processedEvents.push(event.id);
                await order.save();
            }
        }
        res.json({ received: true });
        return;
    }
    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) {
        res.json({ received: true });
        return;
    }
    const session = event.data.object;
    const orderId = (_c = session.metadata) === null || _c === void 0 ? void 0 : _c.artOrderId;
    if (!orderId || !/^[a-f0-9]{24}$/i.test(orderId)) {
        res.json({ received: true });
        return;
    }
    const order = await ArtOrder_1.default.findById(orderId).select("+sessionId +paymentIntentId +processedEvents");
    if (!order || order.processedEvents.includes(event.id)) {
        res.json({ received: true });
        return;
    }
    // A webhook can arrive before a failed/slow create response is saved. Retry later.
    if (!order.sessionId) {
        res.status(503).json({ message: "Session en cours d’enregistrement." });
        return;
    }
    const quote = order.quote;
    const shipping = (_d = session.collected_information) === null || _d === void 0 ? void 0 : _d.shipping_details;
    const paid = session.payment_status === "paid" && ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type);
    const mismatch = order.sessionId !== session.id || session.client_reference_id !== order.reference || session.livemode !== (order.mode === "live") || event.livemode !== session.livemode || (paid && (session.currency !== "eur" || session.amount_total !== quote.totalCents || ((_e = shipping === null || shipping === void 0 ? void 0 : shipping.address) === null || _e === void 0 ? void 0 : _e.country) !== quote.country || ((_f = session.consent) === null || _f === void 0 ? void 0 : _f.terms_of_service) !== "accepted"));
    if (mismatch) {
        order.paymentStatus = "review_required";
        order.fulfillmentStatus = "on_hold";
    }
    else if (paid && !["refunded", "partially_refunded", "review_required"].includes(order.paymentStatus)) {
        order.paymentStatus = "paid";
        order.paidAt || (order.paidAt = new Date(event.created * 1000));
        order.paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (_g = session.payment_intent) === null || _g === void 0 ? void 0 : _g.id;
        order.customer = { email: (_h = session.customer_details) === null || _h === void 0 ? void 0 : _h.email, name: (shipping === null || shipping === void 0 ? void 0 : shipping.name) || ((_j = session.customer_details) === null || _j === void 0 ? void 0 : _j.name), address: shipping === null || shipping === void 0 ? void 0 : shipping.address, phone: (_k = session.customer_details) === null || _k === void 0 ? void 0 : _k.phone };
    }
    else if (order.paymentStatus === "pending" && event.type === "checkout.session.async_payment_failed")
        order.paymentStatus = "failed";
    else if (order.paymentStatus === "pending" && event.type === "checkout.session.expired")
        order.paymentStatus = "expired";
    if (!mismatch && session.payment_intent)
        order.paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
    order.processedEvents.push(event.id);
    await order.save();
    res.json({ received: true });
});
exports.getArtShippingProfiles = (0, artController_1.artHandler)(async (_req, res) => { const config = await (0, artCommerceService_1.loadArtCommerce)(); res.json({ profiles: config.profiles.map(({ id, label, fulfillment }) => ({ id, label, fulfillment })) }); });
