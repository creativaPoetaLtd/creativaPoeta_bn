"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.artTranslationMaxLength = artTranslationMaxLength;
exports.parseArtTranslation = parseArtTranslation;
exports.validateArtTranslation = validateArtTranslation;
const artPolicy_1 = require("./artPolicy");
function artTranslationMaxLength(key) {
    if (key === "title")
        return 160;
    if (key === "sentence")
        return 350;
    if (key === "story")
        return 8000;
    if (/^detail\.[0-7]\.title$/.test(key))
        return 120;
    if (/^detail\.[0-7]\.text$/.test(key))
        return 1200;
    if (/^image\.(?:[0-9]|1[01])\.alt$/.test(key))
        return 240;
    throw new artPolicy_1.ArtInputError("Ce champ ne peut pas être traduit automatiquement.");
}
function parseArtTranslation(value) {
    const data = value;
    if (!data || typeof data !== "object" || Array.isArray(data) || (data.language !== "en" && data.language !== "nl"))
        throw new artPolicy_1.ArtInputError("Choisissez l’anglais ou le néerlandais pour la traduction.");
    if (!Array.isArray(data.entries) || !data.entries.length || data.entries.length > 31)
        throw new artPolicy_1.ArtInputError("Sélectionnez entre 1 et 31 champs français à traduire.");
    const keys = new Set();
    const entries = data.entries.map(value => {
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new artPolicy_1.ArtInputError("Champ de traduction invalide.");
        const key = (0, artPolicy_1.artString)(value.key, 40, "Champ", true);
        const text = (0, artPolicy_1.artString)(value.text, artTranslationMaxLength(key), "Texte français", true);
        if (keys.has(key))
            throw new artPolicy_1.ArtInputError("Un champ est présent plusieurs fois dans la traduction.");
        keys.add(key);
        return { key, text };
    });
    if (entries.reduce((length, entry) => length + entry.text.length, 0) > 24000)
        throw new artPolicy_1.ArtInputError("Traduisez moins de texte à la fois.");
    return { language: data.language, entries };
}
function validateArtTranslation(value, requested) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== requested.length)
        throw new Error("IncompleteArtTranslation");
    const data = value;
    return requested.map(entry => {
        const text = data[entry.key];
        if (typeof text !== "string" || !text.trim() || text.trim().length > artTranslationMaxLength(entry.key))
            throw new Error("InvalidArtTranslation");
        return { key: entry.key, text: text.trim() };
    });
}
