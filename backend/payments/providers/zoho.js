// Zoho Payments — TO BE CONNECTED.
//
// Fill in the four functions below. Nothing else in the backend needs to change:
// payments/service.js already creates orders, activates memberships, issues receipts
// and sends emails once verifyPayment / parseWebhook report "PAID".
//
// Notes from the Zoho Payments (India) API documentation, to save you looking them up:
//   API base:        https://payments.zoho.in/api/v1        (all calls need ?account_id=<id>)
//   Auth header:     Authorization: Zoho-oauthtoken <access_token>
//                    access token from POST https://accounts.zoho.in/oauth/v2/token
//                    with grant_type=refresh_token (tokens last about 1 hour — cache it)
//   Scopes:          ZohoPay.payments.CREATE, ZohoPay.payments.READ
//   Create session:  POST /paymentsessions   { amount, currency: "INR", description,
//                    invoice_number, reference_number }  -> payments_session.payments_session_id
//   Get payment:     GET  /payments/{payment_id}           -> payment.status ("succeeded", "failed" ...)
//   Get session:     GET  /paymentsessions/{session_id}    -> payments_session.status, payments[]
//   Webhooks:        events payment.succeeded / payment.failed; header X-Zoho-Webhook-Signature
//                    "t=<timestamp>,v=<signature>", HMAC-SHA256 of `${t}.${rawBody}` with the signing key
//   Browser widget:  https://static.zohocdn.com/zpay/zpay-js/v1/zpayments.js  (see frontend/src/payments/zoho.js)
//
// Suggested .env keys: ZOHO_ACCOUNT_ID, ZOHO_API_KEY (widget key, safe for the browser),
// ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_WEBHOOK_SECRET.
//
// order fields you will need: order.orderNo (use as invoice_number), order.amount,
// order.currency, order.name, order.email, order.purpose, order.providerSessionId.

const NOT_CONNECTED = "Zoho Payments is not connected yet (backend/payments/providers/zoho.js).";

module.exports = {
  name: "zoho",

  // Return null once the keys you need are present in .env.
  problem() {
    return NOT_CONNECTED;
  },

  // Create a Zoho payment session for the order.
  // Return { sessionId: payments_session_id, client: { account_id, api_key, payments_session_id, ... } }
  async createCheckout(order) {
    throw new Error(NOT_CONNECTED);
  },

  // `result` is what frontend/src/payments/zoho.js sent back (e.g. { payment_id }).
  // Fetch the payment from Zoho, check it belongs to order.providerSessionId and the amount matches.
  // Return { status: "PAID", paymentId, method } / { status: "FAILED", reason } / { status: "PENDING" }.
  async verifyPayment(order, result) {
    throw new Error(NOT_CONNECTED);
  },

  // Verify X-Zoho-Webhook-Signature against rawBody, then map the event to
  // { sessionId, status: "PAID" | "FAILED", paymentId, method, reason }.
  // Throw an Error if the signature is wrong. Return null for events you don't care about.
  async parseWebhook(rawBody, headers) {
    throw new Error(NOT_CONNECTED);
  },
};
