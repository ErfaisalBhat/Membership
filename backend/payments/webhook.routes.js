const express = require("express");
const PaymentOrder = require("./PaymentOrder");
const { providerByName } = require("./provider");
const { activateOrder, failOrder } = require("./service");
const { recordWebhookPayment } = require("./zohoPage");

// POST /api/payments/webhook/:provider  (e.g. /api/payments/webhook/zoho)
//
// The gateway calls this when a payment succeeds or fails. The body is kept raw
// because the signature is calculated over the exact bytes received.
// Gateways want a quick 2xx, so the membership is activated after replying.

const router = express.Router();

router.post("/:provider", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  const provider = providerByName(req.params.provider);
  if (!provider) return res.status(404).json({ message: "Unknown payment provider." });

  let event;
  try {
    event = await provider.parseWebhook(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "", req.headers);
  } catch (err) {
    console.error(`[WEBHOOK ${provider.name}] Rejected:`, err.message);
    return res.status(400).json({ message: "Invalid webhook." });
  }
  res.json({ received: true });
  if (!event) return;

  try {
    // Zoho payment page payments: kept so the payment ID applicants enter can be checked.
    if (event.zohoPayment) await recordWebhookPayment(event.zohoPayment, { liveMode: event.liveMode });
    if (!event.sessionId) return;
    const order = await PaymentOrder.findOne({ provider: provider.name, providerSessionId: event.sessionId });
    if (!order) return; // e.g. a payment page payment (no order on this site)
    if (event.status === "PAID" && event.amount !== undefined && Math.abs(event.amount - order.amount) > 0.001) {
      return console.error(`[WEBHOOK ${provider.name}] ${order.orderNo}: paid ${event.amount}, expected ${order.amount}. Not activated.`);
    }
    if (event.status === "PAID") await activateOrder(order._id, event);
    else if (event.status === "FAILED") await failOrder(order._id, event.reason);
  } catch (err) {
    console.error(`[WEBHOOK ${provider.name}] Processing failed:`, err);
  }
});

module.exports = router;
