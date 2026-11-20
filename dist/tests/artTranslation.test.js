"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const artPolicy_1 = require("../domain/artPolicy");
const artTranslation_1 = require("../domain/artTranslation");
const artTranslationService_1 = require("../services/artTranslationService");
(0, node_test_1.default)("translation accepts only bounded editorial fields and supported destination languages", () => {
    const value = { language: "en", entries: [{ key: "title", text: "L’autre rive" }, { key: "image.11.alt", text: "Le détail du bateau" }] };
    strict_1.default.equal((0, artTranslation_1.parseArtTranslation)(value).entries.length, 2);
    strict_1.default.throws(() => (0, artTranslation_1.parseArtTranslation)({ ...value, language: "fr" }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artTranslation_1.parseArtTranslation)({ ...value, entries: [] }), artPolicy_1.ArtInputError);
    for (const key of ["providerReference", "image.12.alt", "detail.8.text", "__proto__"])
        strict_1.default.throws(() => (0, artTranslation_1.parseArtTranslation)({ ...value, entries: [{ key, text: "test" }] }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artTranslation_1.parseArtTranslation)({ ...value, entries: [{ key: "title", text: "x".repeat(161) }] }), artPolicy_1.ArtInputError);
    strict_1.default.throws(() => (0, artTranslation_1.parseArtTranslation)({ ...value, entries: [value.entries[0], value.entries[0]] }), artPolicy_1.ArtInputError);
});
(0, node_test_1.default)("partial, extra and oversized provider output never replaces the editor's content", () => {
    const requested = [{ key: "title", text: "L’autre rive" }, { key: "story", text: "Un nouveau départ." }];
    strict_1.default.deepEqual((0, artTranslation_1.validateArtTranslation)({ title: "The Other Shore", story: "A new beginning." }, requested), [{ key: "title", text: "The Other Shore" }, { key: "story", text: "A new beginning." }]);
    for (const result of [null, [], { title: "The Other Shore" }, { title: "The Other Shore", wrong: "wrong" }, { title: "x".repeat(161), story: "A new beginning." }])
        strict_1.default.throws(() => (0, artTranslation_1.validateArtTranslation)(result, requested));
});
(0, node_test_1.default)("translation uses structured plain-text output and reports upstream failures without fabricated translations", async () => {
    const originalFetch = global.fetch;
    const key = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    process.env.OPENAI_API_KEY = "qa-fake-key";
    process.env.OPENAI_MODEL = "gpt-5-mini";
    const entries = [{ key: "title", text: "L’autre rive" }];
    try {
        global.fetch = (async (url, init) => {
            strict_1.default.equal(url, "https://api.openai.com/v1/responses");
            const request = JSON.parse(String(init === null || init === void 0 ? void 0 : init.body));
            strict_1.default.equal(request.store, false);
            strict_1.default.equal(request.text.format.type, "json_schema");
            strict_1.default.deepEqual(request.text.format.schema.required, ["title"]);
            strict_1.default.ok(request.instructions.includes("Dutch"));
            return new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify({ title: "De andere oever" }) }] }] }));
        });
        strict_1.default.deepEqual(await (0, artTranslationService_1.translateArtEntries)("nl", entries), [{ key: "title", text: "De andere oever" }]);
        global.fetch = (async () => new Response(JSON.stringify({ status: "incomplete", output: [] })));
        await strict_1.default.rejects((0, artTranslationService_1.translateArtEntries)("en", entries), (error) => error instanceof artTranslationService_1.ArtTranslationUnavailable && error.status === 502);
        delete process.env.OPENAI_API_KEY;
        await strict_1.default.rejects((0, artTranslationService_1.translateArtEntries)("en", entries), (error) => error instanceof artTranslationService_1.ArtTranslationUnavailable && error.status === 503);
    }
    finally {
        global.fetch = originalFetch;
        if (key === undefined)
            delete process.env.OPENAI_API_KEY;
        else
            process.env.OPENAI_API_KEY = key;
        if (model === undefined)
            delete process.env.OPENAI_MODEL;
        else
            process.env.OPENAI_MODEL = model;
    }
});
