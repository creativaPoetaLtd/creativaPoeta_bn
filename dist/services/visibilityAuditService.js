"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTechnicalVisibilityAudit = exports.VisibilityAuditError = void 0;
const cheerio = __importStar(require("cheerio"));
const promises_1 = require("node:dns/promises");
const node_http_1 = __importDefault(require("node:http"));
const node_https_1 = __importDefault(require("node:https"));
const node_net_1 = require("node:net");
const MAX_REDIRECTS = 4;
const MAX_HTML_BYTES = 1000000;
const REQUEST_TIMEOUT_MS = 8000;
class VisibilityAuditError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.name = "VisibilityAuditError";
    }
}
exports.VisibilityAuditError = VisibilityAuditError;
const isBlockedIpv4 = (address) => {
    const parts = address.split(".").map(Number);
    if (parts.length !== 4 || parts.some(Number.isNaN))
        return true;
    const [a, b, c] = parts;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0) ||
        (a === 192 && b === 168) || (a === 192 && b === 0 && c === 2) ||
        (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) ||
        (a === 203 && b === 0 && c === 113);
};
const isBlockedIp = (address) => {
    const version = (0, node_net_1.isIP)(address);
    if (version === 4)
        return isBlockedIpv4(address);
    if (version !== 6)
        return true;
    const value = address.toLowerCase();
    if (value.startsWith("::ffff:"))
        return isBlockedIpv4(value.slice(7));
    return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("2001:db8");
};
const parsePublicUrl = (input) => {
    const value = input.trim();
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    let url;
    try {
        url = new URL(normalized);
    }
    catch {
        throw new VisibilityAuditError("L'adresse du site n'est pas valide.");
    }
    if (!["http:", "https:"].includes(url.protocol))
        throw new VisibilityAuditError("Seuls les sites HTTP et HTTPS peuvent etre analyses.");
    if (url.username || url.password)
        throw new VisibilityAuditError("Les adresses contenant des identifiants sont refusees.");
    if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".local"))
        throw new VisibilityAuditError("Cette adresse ne peut pas etre analysee.");
    url.hash = "";
    return url;
};
const resolvePublicAddress = async (hostname) => {
    const directVersion = (0, node_net_1.isIP)(hostname);
    const addresses = directVersion ? [{ address: hostname, family: directVersion }] : await (0, promises_1.lookup)(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((item) => isBlockedIp(item.address)))
        throw new VisibilityAuditError("Le site pointe vers une adresse reseau non autorisee.");
    return addresses[0];
};
const requestHtml = async (url, redirects = 0) => {
    const startedAt = Date.now();
    let address;
    try {
        address = await resolvePublicAddress(url.hostname);
    }
    catch (error) {
        if (error instanceof VisibilityAuditError)
            throw error;
        throw new VisibilityAuditError("Impossible de resoudre l'adresse de ce site.", 422);
    }
    const transport = url.protocol === "https:" ? node_https_1.default : node_http_1.default;
    const pinnedLookup = (_hostname, _options, callback) => callback(null, address.address, address.family);
    return new Promise((resolve, reject) => {
        const request = transport.request(url, {
            method: "GET", lookup: pinnedLookup,
            servername: url.protocol === "https:" ? url.hostname : undefined,
            headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "Accept-Encoding": "identity", "User-Agent": "CreativaPoetaVisibilityAudit/1.0" },
        }, async (response) => {
            const status = response.statusCode || 0;
            const location = response.headers.location;
            if (status >= 300 && status < 400 && location) {
                response.resume();
                if (redirects >= MAX_REDIRECTS)
                    return reject(new VisibilityAuditError("Le site effectue trop de redirections.", 422));
                try {
                    resolve(await requestHtml(parsePublicUrl(new URL(location, url).toString()), redirects + 1));
                }
                catch (error) {
                    reject(error);
                }
                return;
            }
            if (status < 200 || status >= 400) {
                response.resume();
                return reject(new VisibilityAuditError(`Le site a repondu avec le statut HTTP ${status}.`, 422));
            }
            const contentType = String(response.headers["content-type"] || "");
            if (!contentType.toLowerCase().includes("html")) {
                response.resume();
                return reject(new VisibilityAuditError("L'adresse ne renvoie pas une page HTML.", 422));
            }
            if (Number(response.headers["content-length"] || 0) > MAX_HTML_BYTES) {
                response.destroy();
                return reject(new VisibilityAuditError("La page est trop volumineuse.", 422));
            }
            const chunks = [];
            let bytes = 0;
            response.on("data", (chunk) => { bytes += chunk.length; if (bytes > MAX_HTML_BYTES)
                response.destroy(new VisibilityAuditError("La page est trop volumineuse.", 422));
            else
                chunks.push(chunk); });
            response.on("end", () => resolve({ finalUrl: url.toString(), html: Buffer.concat(chunks).toString("utf8"), status, contentType, redirects, responseTimeMs: Date.now() - startedAt }));
            response.on("error", reject);
        });
        request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new VisibilityAuditError("Le site met trop de temps a repondre.", 504)));
        request.on("error", (error) => reject(error instanceof VisibilityAuditError ? error : new VisibilityAuditError("Impossible de joindre ce site.", 422)));
        request.end();
    });
};
const clean = (value) => value.replace(/\s+/g, " ").trim();
const runTechnicalVisibilityAudit = async (rawUrl) => {
    const requestedUrl = parsePublicUrl(rawUrl);
    const fetched = await requestHtml(requestedUrl);
    const $ = cheerio.load(fetched.html);
    const title = clean($("title").first().text());
    const description = clean($("meta[name='description']").attr("content") || "");
    const language = clean($("html").attr("lang") || "");
    const canonical = clean($("link[rel='canonical']").attr("href") || "");
    const viewport = clean($("meta[name='viewport']").attr("content") || "");
    const robots = clean($("meta[name='robots']").attr("content") || "").toLowerCase();
    const h1Texts = $("h1").map((_i, el) => clean($(el).text())).get().filter(Boolean);
    const bodyText = clean($("body").text());
    const links = $("a[href]").map((_i, el) => $(el).attr("href") || "").get();
    const socialDomains = ["facebook.com", "instagram.com", "linkedin.com", "tiktok.com", "x.com", "youtube.com"];
    const socialLinks = links.filter((href) => socialDomains.some((domain) => href.toLowerCase().includes(domain)));
    const mapLinks = links.filter((href) => /google\.[^/]+\/maps|maps\.apple\.com|goo\.gl\/maps/i.test(href));
    const structuredDataTypes = new Set();
    let validStructuredDataBlocks = 0;
    $("script[type='application/ld+json']").each((_i, el) => {
        try {
            const parsed = JSON.parse($(el).text());
            (Array.isArray(parsed) ? parsed : [parsed]).forEach((item) => {
                const types = Array.isArray(item === null || item === void 0 ? void 0 : item["@type"]) ? item["@type"] : [item === null || item === void 0 ? void 0 : item["@type"]];
                types.filter(Boolean).forEach((type) => structuredDataTypes.add(type));
            });
            validStructuredDataBlocks += 1;
        }
        catch { /* Reported by the check below. */ }
    });
    const hasEmail = $("a[href^='mailto:']").length > 0;
    const hasPhone = $("a[href^='tel:']").length > 0;
    const checks = [
        { id: "https", label: "Connexion securisee", passed: fetched.finalUrl.startsWith("https://"), weight: 8, detail: fetched.finalUrl, priority: "Activer HTTPS sur toutes les pages." },
        { id: "title", label: "Titre de page", passed: title.length >= 15 && title.length <= 65, weight: 10, detail: title || "Aucun titre.", priority: "Ajouter un titre clair de 15 a 65 caracteres." },
        { id: "description", label: "Description", passed: description.length >= 70 && description.length <= 180, weight: 10, detail: description || "Aucune description.", priority: "Rediger une description claire de 70 a 180 caracteres." },
        { id: "h1", label: "Titre principal", passed: h1Texts.length === 1, weight: 9, detail: `${h1Texts.length} H1 detecte(s).`, priority: "Conserver un seul H1 clair sur la page." },
        { id: "language", label: "Langue declaree", passed: Boolean(language), weight: 7, detail: language || "Langue absente.", priority: "Declarer la langue principale dans la balise HTML." },
        { id: "viewport", label: "Compatibilite mobile", passed: /width\s*=\s*device-width/i.test(viewport), weight: 8, detail: viewport || "Viewport absent.", priority: "Ajouter une configuration viewport mobile correcte." },
        { id: "canonical", label: "Adresse officielle", passed: Boolean(canonical), weight: 6, detail: canonical || "Canonical absent.", priority: "Definir l'adresse canonical de la page officielle." },
        { id: "indexing", label: "Indexation", passed: !robots.includes("noindex"), weight: 8, detail: robots || "Indexation autorisee.", priority: "Retirer noindex si la page doit etre visible." },
        { id: "contact", label: "Contact direct", passed: hasEmail || hasPhone, weight: 10, detail: `${hasPhone ? "Telephone" : "Sans telephone"}; ${hasEmail ? "email" : "sans email"}.`, priority: "Ajouter des liens telephone ou email utilisables." },
        { id: "structured-data", label: "Donnees structurees", passed: validStructuredDataBlocks > 0, weight: 10, detail: Array.from(structuredDataTypes).join(", ") || "Aucun JSON-LD valide.", priority: "Ajouter des donnees structurees valides." },
        { id: "public-profiles", label: "Profils publics", passed: socialLinks.length > 0 || mapLinks.length > 0, weight: 7, detail: `${socialLinks.length} social, ${mapLinks.length} maps.`, priority: "Relier le site aux profils sociaux ou maps officiels." },
        { id: "content", label: "Contenu lisible", passed: bodyText.length >= 500, weight: 7, detail: `${bodyText.length} caracteres lisibles.`, priority: "Ajouter du contenu utile sur l'activite et les services." },
    ];
    const total = checks.reduce((sum, check) => sum + check.weight, 0);
    const earned = checks.filter((check) => check.passed).reduce((sum, check) => sum + check.weight, 0);
    const score = Math.round((earned / total) * 100);
    return {
        requestedUrl: requestedUrl.toString(), finalUrl: fetched.finalUrl, fetchedAt: new Date().toISOString(), score,
        verdict: score >= 76 ? "Base technique solide" : score >= 46 ? "Base correcte a renforcer" : "Presence technique fragile",
        priorities: checks.filter((check) => !check.passed).sort((a, b) => b.weight - a.weight).slice(0, 5).map((check) => check.priority),
        http: { status: fetched.status, contentType: fetched.contentType, redirects: fetched.redirects, responseTimeMs: fetched.responseTimeMs },
        page: { title, description, language, canonical, h1Count: h1Texts.length, h1Texts: h1Texts.slice(0, 3), bodyTextLength: bodyText.length },
        discoverability: { hasEmail, hasPhone, socialLinks: socialLinks.slice(0, 10), mapLinks: mapLinks.slice(0, 10), structuredDataTypes: Array.from(structuredDataTypes), validStructuredDataBlocks },
        images: { total: $("img").length, withoutAlt: $("img").filter((_i, el) => !clean($(el).attr("alt") || "")).length },
        checks,
    };
};
exports.runTechnicalVisibilityAudit = runTechnicalVisibilityAudit;
