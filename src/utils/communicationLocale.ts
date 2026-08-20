export type CommunicationLocale = "en" | "fr" | "nl" | "rw";

const supportedLocales = new Set<CommunicationLocale>(["en", "fr", "nl", "rw"]);
const localeAliases: Record<string, CommunicationLocale> = {
  kin: "rw",
  kiny: "rw",
};

export const normalizeCommunicationLocale = (
  value: unknown,
  fallback: CommunicationLocale = "en"
): CommunicationLocale => {
  const raw = String(value || "").trim().toLowerCase();
  const baseLocale = raw.split(/[-_]/)[0];
  const normalized = localeAliases[baseLocale] || baseLocale;

  return supportedLocales.has(normalized as CommunicationLocale)
    ? (normalized as CommunicationLocale)
    : fallback;
};

const contactReplySubjects: Record<CommunicationLocale, string> = {
  en: "Re: Your message to Creativa Poeta",
  fr: "Re : Votre message à Creativa Poeta",
  nl: "Re: Uw bericht aan Creativa Poeta",
  rw: "Igisubizo: Ubutumwa bwawe kuri Creativa Poeta",
};

const partnershipReplySubjects: Record<CommunicationLocale, string> = {
  en: "Re: Partnership with Creativa Poeta",
  fr: "Re : Partenariat avec Creativa Poeta",
  nl: "Re: Partnerschap met Creativa Poeta",
  rw: "Igisubizo: Ubufatanye na Creativa Poeta",
};

export const getContactReplySubject = (locale: unknown) =>
  contactReplySubjects[normalizeCommunicationLocale(locale)];

export const getPartnershipReplySubject = (locale: unknown) =>
  partnershipReplySubjects[normalizeCommunicationLocale(locale)];
