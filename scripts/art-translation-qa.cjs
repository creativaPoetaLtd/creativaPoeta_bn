// Isolated QA provider: never imported by application code or used in production.
const originalFetch = global.fetch;
process.env.OPENAI_API_KEY = "qa-translation-not-a-real-key";
process.env.OPENAI_MODEL = "gpt-5-mini";
global.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url || String(input));
  if (url.hostname !== "api.openai.com") return originalFetch(input, init);
  if (url.pathname !== "/v1/responses") throw new Error("Unmocked translation provider request");
  const payload = JSON.parse(String(init.body));
  const entries = JSON.parse(payload.input).entries;
  if (entries.some(entry => entry.text.includes("QA_TRANSLATION_FAIL"))) return new Response("{}", { status: 503 });
  const prefix = payload.instructions.includes("Dutch") ? "NL" : "EN";
  const translated = Object.fromEntries(entries.map(entry => [entry.key, `${prefix}: ${entry.text}`]));
  return new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(translated) }] }] }), { headers: { "content-type": "application/json" } });
};
