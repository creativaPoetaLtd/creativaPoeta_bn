"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSearchConsoleReport = void 0;
const crypto_1 = __importDefault(require("crypto"));
const SearchConsoleCache_1 = __importDefault(require("../models/SearchConsoleCache"));
const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEARCH_ANALYTICS_URL = "https://www.googleapis.com/webmasters/v3/sites";
const DEFAULT_CACHE_MINUTES = 360;
let accessTokenCache = null;
const round = (value, precision = 2) => {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
};
const base64Url = (value) => Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const getPrivateKey = () => {
    const plain = String(process.env.GSC_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim();
    const encoded = String(process.env.GSC_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64 || "").trim();
    if (plain)
        return plain.replace(/\\n/g, "\n");
    if (!encoded)
        return "";
    try {
        return Buffer.from(encoded, "base64").toString("utf8").replace(/\\n/g, "\n");
    }
    catch {
        return "";
    }
};
const getSiteUrls = () => Array.from(new Set(String(process.env.GSC_SITE_URLS || "")
    .split(/[;,\n]/)
    .map((value) => value.trim())
    .filter(Boolean)));
const getConfiguration = () => {
    const clientEmail = String(process.env.GSC_SERVICE_ACCOUNT_EMAIL || "").trim();
    const privateKey = getPrivateKey();
    const siteUrls = getSiteUrls();
    const missing = [];
    if (!clientEmail)
        missing.push("GSC_SERVICE_ACCOUNT_EMAIL");
    if (!privateKey)
        missing.push("GSC_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64");
    if (!siteUrls.length)
        missing.push("GSC_SITE_URLS");
    return { clientEmail, privateKey, siteUrls, missing };
};
const fetchWithTimeout = async (url, init, timeoutMs = 15000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(timeout);
    }
};
const getAccessToken = async (clientEmail, privateKey) => {
    if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 60000) {
        return accessTokenCache.token;
    }
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = base64Url(JSON.stringify({
        iss: clientEmail,
        scope: SEARCH_CONSOLE_SCOPE,
        aud: TOKEN_URL,
        iat: issuedAt - 30,
        exp: issuedAt + 3600,
    }));
    const unsignedToken = `${header}.${claim}`;
    const signature = crypto_1.default.sign("RSA-SHA256", Buffer.from(unsignedToken), privateKey);
    const assertion = `${unsignedToken}.${base64Url(signature)}`;
    const response = await fetchWithTimeout(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
        }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.access_token) {
        throw new Error(payload.error_description || `Google OAuth failed (${response.status}).`);
    }
    accessTokenCache = {
        token: payload.access_token,
        expiresAt: Date.now() + Math.max(300, Number(payload.expires_in || 3600)) * 1000,
    };
    return payload.access_token;
};
const querySearchAnalytics = async (accessToken, siteUrl, startDate, endDate, dimensions, rowLimit) => {
    var _a;
    const response = await fetchWithTimeout(`${SEARCH_ANALYTICS_URL}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            startDate,
            endDate,
            dimensions,
            type: "web",
            aggregationType: dimensions.includes("page") ? "auto" : "byProperty",
            dataState: "final",
            rowLimit,
            startRow: 0,
        }),
    });
    const payload = await response.json();
    if (!response.ok) {
        throw new Error(((_a = payload.error) === null || _a === void 0 ? void 0 : _a.message) || `Search Console query failed (${response.status}).`);
    }
    return payload.rows || [];
};
const normalizeRow = (row, name) => ({
    name,
    clicks: Math.round(Number(row.clicks || 0)),
    impressions: Math.round(Number(row.impressions || 0)),
    ctr: round(Number(row.ctr || 0) * 100),
    position: round(Number(row.position || 0)),
});
const queryProperty = async (accessToken, siteUrl, startDate, endDate) => {
    const [summaryRows, timelineRows, queryRows, pageRows, countryRows, deviceRows] = await Promise.all([
        querySearchAnalytics(accessToken, siteUrl, startDate, endDate, [], 1),
        querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["date"], 500),
        querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["query"], 100),
        querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["page"], 100),
        querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["country"], 50),
        querySearchAnalytics(accessToken, siteUrl, startDate, endDate, ["device"], 10),
    ]);
    return {
        siteUrl,
        summary: normalizeRow(summaryRows[0] || {}, siteUrl),
        timeline: timelineRows.map((row) => { var _a; return normalizeRow(row, ((_a = row.keys) === null || _a === void 0 ? void 0 : _a[0]) || "unknown"); }),
        queries: queryRows.map((row) => { var _a; return normalizeRow(row, ((_a = row.keys) === null || _a === void 0 ? void 0 : _a[0]) || "Unknown query"); }),
        pages: pageRows.map((row) => { var _a; return normalizeRow(row, ((_a = row.keys) === null || _a === void 0 ? void 0 : _a[0]) || "/"); }),
        countries: countryRows.map((row) => { var _a; return normalizeRow(row, ((_a = row.keys) === null || _a === void 0 ? void 0 : _a[0]) || "unknown"); }),
        devices: deviceRows.map((row) => { var _a; return normalizeRow(row, ((_a = row.keys) === null || _a === void 0 ? void 0 : _a[0]) || "unknown"); }),
    };
};
const mergeRows = (rows, sortBy = "clicks") => {
    const merged = new Map();
    rows.forEach((row) => {
        const current = merged.get(row.name) || { name: row.name, clicks: 0, impressions: 0, positionWeight: 0 };
        current.clicks += row.clicks;
        current.impressions += row.impressions;
        current.positionWeight += row.position * row.impressions;
        merged.set(row.name, current);
    });
    const result = Array.from(merged.values()).map((row) => ({
        name: row.name,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.impressions > 0 ? round((row.clicks / row.impressions) * 100) : 0,
        position: row.impressions > 0 ? round(row.positionWeight / row.impressions) : 0,
    }));
    return result.sort((left, right) => sortBy === "name" ? left.name.localeCompare(right.name) : right.clicks - left.clicks || right.impressions - left.impressions);
};
const buildMergedReport = (properties, startDate, endDate) => {
    const propertySummaries = properties.map((property) => property.summary);
    const totalClicks = propertySummaries.reduce((sum, row) => sum + row.clicks, 0);
    const totalImpressions = propertySummaries.reduce((sum, row) => sum + row.impressions, 0);
    const positionWeight = propertySummaries.reduce((sum, row) => sum + row.position * row.impressions, 0);
    const timeline = mergeRows(properties.flatMap((property) => property.timeline), "name");
    return {
        configured: true,
        status: "connected",
        startDate,
        endDate,
        dataThrough: timeline.length ? timeline[timeline.length - 1].name : null,
        summary: {
            clicks: totalClicks,
            impressions: totalImpressions,
            ctr: totalImpressions > 0 ? round((totalClicks / totalImpressions) * 100) : 0,
            position: totalImpressions > 0 ? round(positionWeight / totalImpressions) : 0,
        },
        timeline,
        queries: mergeRows(properties.flatMap((property) => property.queries)).slice(0, 100),
        pages: mergeRows(properties.flatMap((property) => property.pages)).slice(0, 100),
        countries: mergeRows(properties.flatMap((property) => property.countries)).slice(0, 50),
        devices: mergeRows(properties.flatMap((property) => property.devices)).slice(0, 10),
        properties: properties.map((property) => ({ siteUrl: property.siteUrl, ...property.summary })),
    };
};
const toDateOnly = (value) => value.toISOString().slice(0, 10);
const getSearchConsoleReport = async (from, to) => {
    const configuration = getConfiguration();
    if (configuration.missing.length) {
        return {
            configured: false,
            status: "not_configured",
            missing: configuration.missing,
            message: "Google Search Console is ready but its server credentials are not configured yet.",
        };
    }
    const startDate = toDateOnly(from);
    const endDate = toDateOnly(to);
    const cacheKey = crypto_1.default
        .createHash("sha256")
        .update(`${[...configuration.siteUrls].sort().join("|")}:${startDate}:${endDate}:web:v1`)
        .digest("hex");
    const cached = await SearchConsoleCache_1.default.findOne({ cacheKey }).lean();
    if (cached && cached.expiresAt.getTime() > Date.now()) {
        return { ...cached.payload, cached: true, fetchedAt: cached.fetchedAt };
    }
    try {
        const accessToken = await getAccessToken(configuration.clientEmail, configuration.privateKey);
        const propertyResults = await Promise.allSettled(configuration.siteUrls.map((siteUrl) => queryProperty(accessToken, siteUrl, startDate, endDate)));
        const properties = propertyResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
        const propertyErrors = propertyResults.flatMap((result, index) => {
            var _a;
            return result.status === "rejected"
                ? [{
                        siteUrl: configuration.siteUrls[index],
                        message: String(((_a = result.reason) === null || _a === void 0 ? void 0 : _a.message) || result.reason || "Search Console query failed.").slice(0, 240),
                    }]
                : [];
        });
        if (!properties.length) {
            throw new Error(propertyErrors.map((item) => `${item.siteUrl}: ${item.message}`).join(" | ") ||
                "No Search Console property could be queried.");
        }
        const report = {
            ...buildMergedReport(properties, startDate, endDate),
            propertyErrors,
            warning: propertyErrors.length
                ? `${propertyErrors.length} Search Console propert${propertyErrors.length === 1 ? "y" : "ies"} could not be refreshed.`
                : undefined,
        };
        const fetchedAt = new Date();
        const configuredMinutes = Number(process.env.GSC_CACHE_MINUTES || DEFAULT_CACHE_MINUTES);
        const cacheMinutes = Number.isFinite(configuredMinutes)
            ? Math.max(15, Math.min(1440, configuredMinutes))
            : DEFAULT_CACHE_MINUTES;
        const expiresAt = new Date(fetchedAt.getTime() + cacheMinutes * 60000);
        const deleteAfter = new Date(fetchedAt.getTime() + 7 * 24 * 60 * 60000);
        await SearchConsoleCache_1.default.updateOne({ cacheKey }, { $set: { payload: report, fetchedAt, expiresAt, deleteAfter } }, { upsert: true });
        return { ...report, cached: false, fetchedAt };
    }
    catch (error) {
        if (cached) {
            return {
                ...cached.payload,
                cached: true,
                stale: true,
                fetchedAt: cached.fetchedAt,
                warning: error.message.slice(0, 240),
            };
        }
        return {
            configured: true,
            status: "error",
            message: error.message.slice(0, 240),
            properties: configuration.siteUrls.map((siteUrl) => ({ siteUrl })),
        };
    }
};
exports.getSearchConsoleReport = getSearchConsoleReport;
