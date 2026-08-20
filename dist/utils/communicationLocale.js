"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPartnershipReplySubject = exports.getContactReplySubject = exports.normalizeCommunicationLocale = void 0;
const supportedLocales = new Set(["en", "fr", "nl", "rw"]);
const localeAliases = {
    kin: "rw",
    kiny: "rw",
};
const normalizeCommunicationLocale = (value, fallback = "en") => {
    const raw = String(value || "").trim().toLowerCase();
    const baseLocale = raw.split(/[-_]/)[0];
    const normalized = localeAliases[baseLocale] || baseLocale;
    return supportedLocales.has(normalized)
        ? normalized
        : fallback;
};
exports.normalizeCommunicationLocale = normalizeCommunicationLocale;
const contactReplySubjects = {
    en: "Re: Your message to Creativa Poeta",
    fr: "Re : Votre message à Creativa Poeta",
    nl: "Re: Uw bericht aan Creativa Poeta",
    rw: "Igisubizo: Ubutumwa bwawe kuri Creativa Poeta",
};
const partnershipReplySubjects = {
    en: "Re: Partnership with Creativa Poeta",
    fr: "Re : Partenariat avec Creativa Poeta",
    nl: "Re: Partnerschap met Creativa Poeta",
    rw: "Igisubizo: Ubufatanye na Creativa Poeta",
};
const getContactReplySubject = (locale) => contactReplySubjects[(0, exports.normalizeCommunicationLocale)(locale)];
exports.getContactReplySubject = getContactReplySubject;
const getPartnershipReplySubject = (locale) => partnershipReplySubjects[(0, exports.normalizeCommunicationLocale)(locale)];
exports.getPartnershipReplySubject = getPartnershipReplySubject;
