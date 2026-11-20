import { ArtInputError, artString } from "./artPolicy";

export type ArtTranslationLanguage = "en" | "nl";
export type ArtTranslationEntry = { key: string; text: string };
export function artTranslationMaxLength(key: string): number {
  if (key === "title") return 160;
  if (key === "sentence") return 350;
  if (key === "story") return 8000;
  if (/^detail\.[0-7]\.title$/.test(key)) return 120;
  if (/^detail\.[0-7]\.text$/.test(key)) return 1200;
  if (/^image\.(?:[0-9]|1[01])\.alt$/.test(key)) return 240;
  throw new ArtInputError("Ce champ ne peut pas être traduit automatiquement.");
}
export function parseArtTranslation(value: unknown): { language: ArtTranslationLanguage; entries: ArtTranslationEntry[] } {
  const data = value as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || Array.isArray(data) || (data.language !== "en" && data.language !== "nl")) throw new ArtInputError("Choisissez l’anglais ou le néerlandais pour la traduction.");
  if (!Array.isArray(data.entries) || !data.entries.length || data.entries.length > 31) throw new ArtInputError("Sélectionnez entre 1 et 31 champs français à traduire.");
  const keys = new Set<string>();
  const entries = data.entries.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ArtInputError("Champ de traduction invalide.");
    const key = artString(value.key, 40, "Champ", true);
    const text = artString(value.text, artTranslationMaxLength(key), "Texte français", true);
    if (keys.has(key)) throw new ArtInputError("Un champ est présent plusieurs fois dans la traduction.");
    keys.add(key); return { key, text };
  });
  if (entries.reduce((length, entry) => length + entry.text.length, 0) > 24000) throw new ArtInputError("Traduisez moins de texte à la fois.");
  return { language: data.language, entries };
}
export function validateArtTranslation(value: unknown, requested: ArtTranslationEntry[]): ArtTranslationEntry[] {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== requested.length) throw new Error("IncompleteArtTranslation");
  const data = value as Record<string, unknown>;
  return requested.map(entry => {
    const text = data[entry.key];
    if (typeof text !== "string" || !text.trim() || text.trim().length > artTranslationMaxLength(entry.key)) throw new Error("InvalidArtTranslation");
    return { key: entry.key, text: text.trim() };
  });
}
