// Used exclusively by art-qa-server.cjs, which creates its own temporary database.
// No real Stripe request or charge is made. Never import this from src/.
const crypto = require("node:crypto");
const sessions = new Map();
const idempotency = new Map();
const realFetch = global.fetch;
process.env.ART_CHECKOUT_ENABLED = "true";
process.env.ART_LIVE_PAYMENTS_ENABLED = "false";
process.env.ART_STRIPE_LIVE_SECRET_KEY = "";
process.env.ART_STRIPE_LIVE_WEBHOOK_SECRET = "";
process.env.ART_STRIPE_TEST_SECRET_KEY = "sk_test_cp_art_isolated_qa_only";
process.env.ART_STRIPE_TEST_WEBHOOK_SECRET = "whsec_cp_art_isolated_qa_only";
process.env.ART_PUBLIC_ORIGIN = "http://127.0.0.1:5185";
global.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url || String(input));
  if (url.hostname !== "api.stripe.com") return realFetch(input, init);
  if (url.pathname.startsWith("/v1/payment_intents/") && init?.method === "GET") {
    const session = [...sessions.values()].find(session => session.payment_intent === url.pathname.split("/").pop());
    if (!session) throw new Error("Unknown simulated payment intent");
    return response({ id: session.payment_intent, object: "payment_intent", metadata: session.metadata, livemode: false, currency: "eur", amount: session.amount_total });
  }
  if (url.pathname !== "/v1/checkout/sessions" || init?.method !== "POST") throw new Error("Unmocked Stripe call in isolated QA");
  const headers = new Headers(init.headers);
  const key = headers.get("idempotency-key");
  if (idempotency.has(key)) return response(idempotency.get(key));
  const form = new URLSearchParams(init.body.toString());
  if (form.get("automatic_tax[enabled]") !== "true") throw new Error("Inclusive automatic tax must be enabled");
  let subtotal = 0;
  for (let i = 0; form.has(`line_items[${i}][quantity]`); i++) {
    if (form.get(`line_items[${i}][price_data][tax_behavior]`) !== "inclusive") throw new Error("Tax must be included in the displayed price");
    subtotal += Number(form.get(`line_items[${i}][quantity]`)) * Number(form.get(`line_items[${i}][price_data][unit_amount]`));
  }
  const shipping = Number(form.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]"));
  const id = `cs_test_qa_${crypto.randomBytes(10).toString("hex")}`;
  const session = { id, object: "checkout.session", url: `https://checkout.stripe.com/c/pay/${id}`, livemode: false, mode: "payment", payment_status: "unpaid", status: "open", currency: "eur", amount_total: subtotal + shipping, client_reference_id: form.get("client_reference_id"), metadata: { artOrderId: form.get("metadata[artOrderId]"), artReference: form.get("metadata[artReference]") }, payment_intent: `pi_qa_${crypto.randomBytes(10).toString("hex")}`, success_url: form.get("success_url"), cancel_url: form.get("cancel_url"), collected_information: { shipping_details: { name: "Client QA fictif", address: { line1: "1 rue de test", postal_code: "1000", city: "Bruxelles", country: form.get("shipping_address_collection[allowed_countries][0]") } } }, customer_details: { email: "payment-qa@example.test", name: "Client QA fictif" }, consent: { terms_of_service: "accepted" } };
  sessions.set(id, session); idempotency.set(key, session); return response(session);
};
function response(value) { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json", "request-id": "req_isolated_qa" } }); }
module.exports = { sessions };
