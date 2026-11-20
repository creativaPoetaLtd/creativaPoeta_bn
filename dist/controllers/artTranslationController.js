"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateArt = void 0;
const artController_1 = require("./artController");
const artTranslation_1 = require("../domain/artTranslation");
const artTranslationService_1 = require("../services/artTranslationService");
exports.translateArt = (0, artController_1.artHandler)(async (req, res) => {
    const input = (0, artTranslation_1.parseArtTranslation)(req.body);
    try {
        res.json({ language: input.language, translations: await (0, artTranslationService_1.translateArtEntries)(input.language, input.entries) });
    }
    catch (error) {
        if (!(error instanceof artTranslationService_1.ArtTranslationUnavailable))
            throw error;
        res.status(error.status).json({ message: error.message });
    }
});
