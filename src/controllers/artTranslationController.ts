import { artHandler } from "./artController";
import { parseArtTranslation } from "../domain/artTranslation";
import { ArtTranslationUnavailable, translateArtEntries } from "../services/artTranslationService";

export const translateArt = artHandler(async (req, res) => {
  const input = parseArtTranslation(req.body);
  try { res.json({ language: input.language, translations: await translateArtEntries(input.language, input.entries) }); }
  catch (error) {
    if (!(error instanceof ArtTranslationUnavailable)) throw error;
    res.status(error.status).json({ message: error.message });
  }
});
