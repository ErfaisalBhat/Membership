const crypto = require("crypto");

// Fake gateway for trying the whole join / renew flow on your own computer.
// The browser shows "Simulate successful payment" / "Simulate failed payment" buttons
// and this provider believes whatever the browser says — so it is refused in production.

module.exports = {
  name: "test",

  problem() {
    if (process.env.NODE_ENV === "production") {
      return "Test payments cannot be used when NODE_ENV=production. Set PAYMENT_PROVIDER=zoho.";
    }
    return null;
  },

  async createCheckout(order) {
    return {
      sessionId: `test_${crypto.randomBytes(8).toString("hex")}`,
      client: { mode: "test" },
    };
  },

  async verifyPayment(order, result) {
    if (result && result.outcome === "success") {
      return { status: "PAID", paymentId: `test_pay_${crypto.randomBytes(6).toString("hex")}`, method: "test" };
    }
    return { status: "FAILED", reason: "Test payment marked as failed." };
  },

  async parseWebhook() {
    return null; // the test gateway never sends webhooks
  },
};
