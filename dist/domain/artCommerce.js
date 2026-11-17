"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.object = exports.emptyArtCommerce = void 0;
exports.artPublicOrigin = artPublicOrigin;
exports.parseArtCommerce = parseArtCommerce;
exports.artPaymentReadiness = artPaymentReadiness;
exports.addArtShipping = addArtShipping;
const node_crypto_1 = __importDefault(require("node:crypto"));
const artPolicy_1 = require("./artPolicy");
const emptyArtCommerce = () => ({ mode: "disabled", pricesIncludeVat: true, taxConfigured: false, taxCode: "", termsUrl: "", termsVersion: "", salesConfirmed: false, profiles: [] });
exports.emptyArtCommerce = emptyArtCommerce;
const object = (value) => { if (!value || typeof value !== "object" || Array.isArray(value))
    throw new artPolicy_1.ArtInputError("Objet attendu."); return value; };
exports.object = object;
const fail = (message) => { throw new artPolicy_1.ArtInputError(message); };
const list = (value, max) => Array.isArray(value) && value.length <= max ? value : fail("Liste trop longue ou invalide.");
const bool = (value) => typeof value === "boolean" ? value : fail("Valeur oui/non attendue.");
const id = (value) => { const result = (0, artPolicy_1.artString)(value, 80, "Identifiant", true); return /^[a-zA-Z0-9_-]+$/.test(result) ? result : fail("Identifiant invalide."); };
const nullableNumber = (value, max) => value === null ? null : typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : fail("Montant ou délai invalide. Laissez le champ vide pour un tarif à préparer.");
const unique = (items) => new Set(items.map(item => item.id)).size === items.length ? items : fail("Identifiants dupliqués.");
function artPublicOrigin() {
    const url = new URL(process.env.ART_PUBLIC_ORIGIN || "https://creativapoeta.com");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))))
        throw new Error("Invalid ART_PUBLIC_ORIGIN");
    return url.origin;
}
function parseArtCommerce(value) {
    const data = (0, exports.object)(value);
    if (!["disabled", "test", "live"].includes(String(data.mode)))
        return fail("Mode de paiement invalide.");
    const profiles = unique(list(data.profiles, 20).map(value => {
        const profile = (0, exports.object)(value);
        if (!["studio", "print_on_demand"].includes(String(profile.fulfillment)))
            return fail("Fabrication inconnue.");
        const countries = new Set();
        const zones = unique(list(profile.zones, 27).map(value => {
            const zone = (0, exports.object)(value);
            const selected = list(zone.countries, 27).map(country => {
                if (typeof country !== "string" || !artPolicy_1.ART_COUNTRIES.includes(country) || countries.has(country))
                    return fail("Chaque pays doit figurer dans une seule zone du profil.");
                countries.add(country);
                return country;
            });
            if (!selected.length)
                return fail("Choisissez au moins un pays par zone.");
            const methods = unique(list(zone.methods, 5).map(value => {
                const method = (0, exports.object)(value);
                const transitMin = nullableNumber(method.transitMin, 180), transitMax = nullableNumber(method.transitMax, 180);
                if ((transitMin === null) !== (transitMax === null) || (transitMin !== null && transitMax < transitMin))
                    return fail("Renseignez les deux délais de transport dans le bon ordre.");
                return { id: id(method.id), label: (0, artPolicy_1.artString)(method.label, 120, "Mode de livraison", true), active: bool(method.active), firstCents: nullableNumber(method.firstCents, 1000000), additionalCents: nullableNumber(method.additionalCents, 1000000), transitMin, transitMax };
            }));
            return { id: id(zone.id), label: (0, artPolicy_1.artString)(zone.label, 120, "Zone", true), countries: selected, methods };
        }));
        return { id: id(profile.id), label: (0, artPolicy_1.artString)(profile.label, 120, "Profil de livraison", true), fulfillment: profile.fulfillment, zones };
    }));
    const termsUrl = (0, artPolicy_1.artString)(data.termsUrl, 500, "Adresse des conditions de vente");
    if (termsUrl) {
        try {
            const url = new URL(termsUrl);
            if (url.origin !== artPublicOrigin() || url.hash || url.username || url.password)
                return fail("Les conditions de vente doivent être hébergées sur le site CP Art configuré.");
        }
        catch {
            return fail("Adresse des conditions de vente invalide.");
        }
    }
    const taxCode = (0, artPolicy_1.artString)(data.taxCode, 30, "Code fiscal Stripe");
    if (taxCode && !/^txcd_[0-9]{8}$/.test(taxCode))
        return fail("Code fiscal Stripe invalide.");
    if (data.pricesIncludeVat !== true)
        return fail("Les prix CP Art doivent inclure la TVA.");
    return { mode: data.mode, pricesIncludeVat: true, taxConfigured: bool(data.taxConfigured), taxCode, termsUrl, termsVersion: (0, artPolicy_1.artString)(data.termsVersion, 80, "Version des conditions"), salesConfirmed: bool(data.salesConfirmed), profiles };
}
function artPaymentReadiness(config) {
    const mode = config.mode === "live" ? "LIVE" : "TEST";
    const key = process.env[`ART_STRIPE_${mode}_SECRET_KEY`] || "";
    const secret = process.env[`ART_STRIPE_${mode}_WEBHOOK_SECRET`] || "";
    const reasons = [];
    if (config.mode === "disabled")
        reasons.push("mode_disabled");
    if (process.env.ART_CHECKOUT_ENABLED !== "true")
        reasons.push("checkout_disabled");
    if (config.mode === "live" && process.env.ART_LIVE_PAYMENTS_ENABLED !== "true")
        reasons.push("live_disabled");
    if (!key.startsWith(config.mode === "live" ? "sk_live_" : "sk_test_") || !secret.startsWith("whsec_"))
        reasons.push("stripe_missing");
    if (!config.taxConfigured || !config.taxCode || !config.pricesIncludeVat)
        reasons.push("tax_pending");
    if (!config.termsUrl || !config.termsVersion || !config.salesConfirmed)
        reasons.push("terms_pending");
    return { enabled: reasons.length === 0, mode: config.mode, reasons };
}
function addArtShipping(quote, config, assignments, selectedValue = {}) {
    const selected = (0, exports.object)(selectedValue !== null && selectedValue !== void 0 ? selectedValue : {});
    const groups = new Map();
    for (const line of quote.lines) {
        const assigned = assignments[`${line.artworkId}:${line.variantId}`];
        const profile = config.profiles.find(item => item.id === assigned && item.fulfillment === line.fulfillment);
        const key = (profile === null || profile === void 0 ? void 0 : profile.id) || `unconfigured-${line.fulfillment}`;
        const group = groups.get(key) || { profile, quantity: 0, fulfillment: line.fulfillment };
        group.quantity += line.quantity;
        groups.set(key, group);
    }
    const shippingGroups = [...groups.entries()].map(([profileId, group]) => {
        var _a, _b, _c;
        const zone = (_a = group.profile) === null || _a === void 0 ? void 0 : _a.zones.find(zone => zone.countries.includes(quote.country));
        const options = ((zone === null || zone === void 0 ? void 0 : zone.methods) || []).filter(method => method.active && method.firstCents !== null && method.additionalCents !== null).map(method => ({ id: method.id, label: method.label, amountCents: method.firstCents + (group.quantity - 1) * method.additionalCents, transitMin: method.transitMin, transitMax: method.transitMax }));
        const choice = selected[profileId];
        if (choice !== undefined && (typeof choice !== "string" || !options.some(option => option.id === choice)))
            return fail("Ce mode de livraison a changé. Vérifiez votre sélection.");
        const chosen = options.find(option => option.id === choice) || options[0];
        return { profileId, label: ((_b = group.profile) === null || _b === void 0 ? void 0 : _b.label) || "", fulfillment: group.fulfillment, quantity: group.quantity, options, selectedMethodId: (chosen === null || chosen === void 0 ? void 0 : chosen.id) || null, amountCents: (_c = chosen === null || chosen === void 0 ? void 0 : chosen.amountCents) !== null && _c !== void 0 ? _c : null };
    });
    if (Object.keys(selected).some(key => !groups.has(key)))
        return fail("Un profil de livraison ne correspond plus à la sélection.");
    const shippingPending = shippingGroups.some(group => group.amountCents === null);
    const shippingCents = shippingPending ? null : shippingGroups.reduce((sum, group) => sum + group.amountCents, 0);
    const readiness = artPaymentReadiness(config);
    const result = { ...quote, pricesIncludeVat: true, shippingGroups, shippingPending, shippingCents, totalCents: shippingCents === null ? null : quote.subtotalCents + shippingCents, paymentEnabled: readiness.enabled && !shippingPending, paymentMode: config.mode, termsUrl: config.termsUrl, termsVersion: config.termsVersion };
    const digest = node_crypto_1.default.createHash("sha256").update(JSON.stringify({ ...result, taxCode: config.taxCode })).digest("hex");
    return { ...result, digest };
}
