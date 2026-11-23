const crypto = require("crypto");
const { ORG_NAME } = require("../../config/membership");

// Zoho Payments (India): https://www.zoho.com/in/payments/api/v1/
//
//   createCheckout  -> creates a payment session; the browser opens the Zoho widget with it
//   verifyPayment   -> asks Zoho (never the browser) whether the payment succeeded
//   parseWebhook    -> checks the X-Zoho-Webhook-Signature, then asks Zoho for the real status
//
// .env keys:
//   ZOHO_ACCOUNT_ID       Zoho Payments > Settings > Account details
//   ZOHO_API_KEY          Zoho Payments > Settings > Developer Space > API key (widget key)
//   ZOHO_CLIENT_ID        OAuth client from https://api-console.zoho.in
//   ZOHO_CLIENT_SECRET
//   ZOHO_REFRESH_TOKEN    generated once through the OAuth client
//   ZOHO_REDIRECT_URI     the redirect URI of the OAuth client (used when refreshing the token)
//   ZOHO_WEBHOOK_SECRET   signing key of the webhook (recommended)
//   ZOHO_SANDBOX=true     use the Zoho Payments sandbox (test mode, no real money)

const API = "https://payments.zoho.in/api/v1";
const TOKEN_URL = "https://accounts.zoho.in/oauth/v2/token";

const env = (k) => (process.env[k] || "").trim();
const sandbox = () => env("ZOHO_SANDBOX").toLowerCase() === "true";
const REQUIRED = ["ZOHO_ACCOUNT_ID", "ZOHO_API_KEY", "ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN"];

// ---------- OAuth access token (about 1 hour; cached, refreshed 5 minutes early) ----------
let cachedToken = null; // { value, expiresAt }

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) return cachedToken.value;
  const params = new URLSearchParams({
    refresh_token: env("ZOHO_REFRESH_TOKEN"),
    client_id: env("ZOHO_CLIENT_ID"),
    client_secret: env("ZOHO_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  if (env("ZOHO_REDIRECT_URI")) params.set("redirect_uri", env("ZOHO_REDIRECT_URI"));
  const res = await fetch(TOKEN_URL, { method: "POST", body: params });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Zoho login failed: ${data.error || res.status}. Check ZOHO_CLIENT_ID / SECRET / REFRESH_TOKEN.`);
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

async function zoho(method, path, body) {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}account_id=${encodeURIComponent(env("ZOHO_ACCOUNT_ID"))}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${await accessToken()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) cachedToken = null; // try a fresh token next time
  if (!res.ok || (data.code !== undefined && data.code !== 0)) {
    throw new Error(`Zoho ${method} ${path.split("?")[0]} failed (${res.status}): ${data.message || "no message"}`);
  }
  return data;
}

const getPayment = async (paymentId) => (await zoho("GET", `/payments/${encodeURIComponent(paymentId)}`)).payment;

// A Zoho payment -> what payments/service.js understands. Checks it really is for this order.
function mapPayment(order, payment) {
  if (!payment) return { status: "PENDING" };
  if (order && order.providerSessionId && payment.payments_session_id !== order.providerSessionId) {
    throw new Error(`Payment ${payment.payment_id} belongs to another payment session.`);
  }
  const method = (payment.payment_method && payment.payment_method.type) || "";
  if (payment.status === "succeeded") {
    if (order && Math.abs(Number(payment.amount) - Number(order.amount)) > 0.001) {
      throw new Error(`Payment ${payment.payment_id} amount ${payment.amount} does not match the order amount ${order.amount}.`);
    }
    return { status: "PAID", paymentId: payment.payment_id, method };
  }
  if (["failed", "canceled", "blocked"].includes(payment.status)) {
    return { status: "FAILED", paymentId: payment.payment_id, method, reason: `Payment ${payment.status} at Zoho.` };
  }
  return { status: "PENDING", paymentId: payment.payment_id, method }; // initiated, incomplete ...
}

const hasApiKeys = () => REQUIRED.every((k) => env(k));

function checkSignature(rawBody, headers) {
  const secret = env("ZOHO_WEBHOOK_SECRET");
  if (!secret) {
    // Without the signing key, a webhook is only accepted because it is double-checked with the API.
    if (hasApiKeys()) return;
    throw new Error("ZOHO_WEBHOOK_SECRET is not set, so the webhook cannot be checked.");
  }
  const header = String(headers["x-zoho-webhook-signature"] || "");
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=")));
  if (!parts.t || !parts.v) throw new Error("Missing X-Zoho-Webhook-Signature.");
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(parts.v).toLowerCase());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Wrong webhook signature.");
}

module.exports = {
  name: "zoho",

  problem() {
    const missing = REQUIRED.filter((k) => !env(k));
    if (missing.length) return `Zoho Payments is missing ${missing.join(", ")} in backend/.env.`;
    if (typeof fetch !== "function") return "Zoho Payments needs Node.js 18 or newer.";
    return null;
  },

  async createCheckout(order) {
    const description = `${ORG_NAME} — ${order.purpose === "RENEWAL" ? "membership renewal" : "membership fee"}`.slice(0, 500);
    const data = await zoho("POST", "/paymentsessions", {
      amount: Number(order.amount),
      currency: order.currency || "INR",
      description,
      invoice_number: String(order.orderNo).slice(0, 50),
      reference_number: String(order._id).slice(0, 50),
      expires_in: 900,
    });
    const sessionId = data.payments_session && data.payments_session.payments_session_id;
    if (!sessionId) throw new Error("Zoho did not return a payment session id.");
    return {
      sessionId,
      client: {
        account_id: env("ZOHO_ACCOUNT_ID"),
        api_key: env("ZOHO_API_KEY"),
        payments_session_id: sessionId,
        is_test_mode: sandbox(),
        business: ORG_NAME,
        description,
      },
    };
  },

  // result: { payment_id } from the widget. Without it (widget closed early), look at the session.
  async verifyPayment(order, result) {
    const paymentId = result && result.payment_id ? String(result.payment_id) : "";
    if (paymentId) return mapPayment(order, await getPayment(paymentId));

    if (!order.providerSessionId) return { status: "PENDING" };
    const session = (await zoho("GET", `/paymentsessions/${encodeURIComponent(order.providerSessionId)}`)).payments_session || {};
    const attempts = session.payments || [];
    const won = attempts.find((p) => p.status === "succeeded");
    if (won) return mapPayment(order, await getPayment(won.payment_id));
    return { status: "PENDING" }; // still open; the webhook or the nightly job closes it
  },

  async parseWebhook(rawBody, headers) {
    checkSignature(rawBody, headers);
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new Error("Webhook body is not JSON.");
    }
    // payment.succeeded / payment.failed, and payment page / link events that carry a payment.
    const sent = event.event_object && event.event_object.payment;
    if (!sent || !sent.payment_id) return null;
    // With the API keys, ask Zoho for the payment instead of trusting the body; without them
    // (payment page only) the signature check above is what proves it came from Zoho.
    const payment = hasApiKeys() ? await getPayment(sent.payment_id) : sent;
    const mapped = mapPayment(null, payment);
    if (mapped.status === "FAILED" && sent.failure_code) mapped.reason = `Payment failed at Zoho (${sent.failure_code}).`;
    return {
      sessionId: payment.payments_session_id || "",
      amount: Number(payment.amount),
      ...mapped,
      zohoPayment: { ...sent, ...payment },
      liveMode: event.live_mode !== false,
    };
  },
};
