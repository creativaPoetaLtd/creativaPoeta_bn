import test from "node:test";
import assert from "node:assert/strict";
import { ArtInputError } from "../domain/artPolicy";
import { parseArtTranslation, validateArtTranslation } from "../domain/artTranslation";
import { ArtTranslationUnavailable, translateArtEntries } from "../services/artTranslationService";

test("translation accepts only bounded editorial fields and supported destination languages", () => {
  const value = { language: "en", entries: [{ key: "title", text: "L’autre rive" }, { key: "image.11.alt", text: "Le détail du bateau" }] };
  assert.equal(parseArtTranslation(value).entries.length, 2);
  assert.throws(() => parseArtTranslation({ ...value, language: "fr" }), ArtInputError);
  assert.throws(() => parseArtTranslation({ ...value, entries: [] }), ArtInputError);
  for (const key of ["providerReference", "image.12.alt", "detail.8.text", "__proto__"]) assert.throws(() => parseArtTranslation({ ...value, entries: [{ key, text: "test" }] }), ArtInputError);
  assert.throws(() => parseArtTranslation({ ...value, entries: [{ key: "title", text: "x".repeat(161) }] }), ArtInputError);
  assert.throws(() => parseArtTranslation({ ...value, entries: [value.entries[0], value.entries[0]] }), ArtInputError);
});
test("partial, extra and oversized provider output never replaces the editor's content", () => {
  const requested = [{ key: "title", text: "L’autre rive" }, { key: "story", text: "Un nouveau départ." }];
  assert.deepEqual(validateArtTranslation({ title: "The Other Shore", story: "A new beginning." }, requested), [{ key: "title", text: "The Other Shore" }, { key: "story", text: "A new beginning." }]);
  for (const result of [null, [], { title: "The Other Shore" }, { title: "The Other Shore", wrong: "wrong" }, { title: "x".repeat(161), story: "A new beginning." }]) assert.throws(() => validateArtTranslation(result, requested));
});
test("translation uses structured plain-text output and reports upstream failures without fabricated translations", async () => {
  const originalFetch = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = "qa-fake-key";
  process.env.OPENAI_MODEL = "gpt-5-mini";
  const entries = [{ key: "title", text: "L’autre rive" }];
  try {
    global.fetch = (async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const request = JSON.parse(String(init?.body));
      assert.equal(request.store, false);
      assert.equal(request.text.format.type, "json_schema");
      assert.deepEqual(request.text.format.schema.required, ["title"]);
      assert.ok(request.instructions.includes("Dutch"));
      return new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify({ title: "De andere oever" }) }] }] }));
    }) as typeof fetch;
    assert.deepEqual(await translateArtEntries("nl", entries), [{ key: "title", text: "De andere oever" }]);
    global.fetch = (async () => new Response(JSON.stringify({ status: "incomplete", output: [] }))) as typeof fetch;
    await assert.rejects(translateArtEntries("en", entries), (error: unknown) => error instanceof ArtTranslationUnavailable && error.status === 502);
    delete process.env.OPENAI_API_KEY;
    await assert.rejects(translateArtEntries("en", entries), (error: unknown) => error instanceof ArtTranslationUnavailable && error.status === 503);
  } finally {
    global.fetch = originalFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
    if (model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = model;
  }
});
