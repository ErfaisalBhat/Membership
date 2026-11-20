// Picks the online payment gateway from PAYMENT_PROVIDER in .env:
//
//   PAYMENT_PROVIDER=test   fake payments for trying the site locally (refused in production)
//   PAYMENT_PROVIDER=zoho   Zoho Payments — fill in providers/zoho.js
//   (empty)                 online payment is switched off; applications wait for the admin
//
// Every provider exports the same functions, so the rest of the app never changes:
//
//   name                         short id saved on each order ("test", "zoho")
//   problem()                    null when ready, otherwise a sentence saying what is missing
//   createCheckout(order)        start a payment with the gateway.
//                                returns { sessionId, client } — `client` is sent to the browser
//                                and passed to the matching frontend checkout (frontend/src/payments)
//   verifyPayment(order, result) ask the GATEWAY (not the browser) whether the order was paid.
//                                `result` is what the browser checkout returned.
//                                returns { status: "PAID" | "FAILED" | "PENDING", paymentId, method, reason }
//   parseWebhook(rawBody, headers)
//                                check the webhook signature (throw if wrong) and return
//                                { sessionId, status, paymentId, method, reason } or null to ignore it

const providers = {
  test: require("./providers/test"),
  zoho: require("./providers/zoho"),
};

const NAME = (process.env.PAYMENT_PROVIDER || "").trim().toLowerCase();

function activeProvider() {
  return providers[NAME] || null;
}

// null when online payments can be taken, otherwise why not.
function paymentsProblem() {
  const provider = activeProvider();
  if (!NAME) return "Online payment is not switched on yet.";
  if (!provider) return `Unknown PAYMENT_PROVIDER "${NAME}".`;
  return provider.problem();
}

function providerByName(name) {
  return providers[name] || null;
}

module.exports = { activeProvider, providerByName, paymentsProblem };
