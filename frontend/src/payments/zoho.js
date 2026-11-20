// Zoho Payments checkout — TO BE CONNECTED.
//
// `checkout` comes from the backend (backend/payments/providers/zoho.js createCheckout):
//   { orderId, orderNo, amount, currency, name, email, purpose, client: { ...what createCheckout returned } }
//
// Return whatever the backend's verifyPayment(order, result) needs, e.g. { payment_id }.
// Throw an Error with code "widget_closed" if the person closed the widget without paying.
//
// Sketch from the Zoho Payments docs (load https://static.zohocdn.com/zpay/zpay-js/v1/zpayments.js first,
// and allow that script in the Content-Security-Policy in backend/server.js):
//
//   const instance = new window.ZPayments({
//     account_id: checkout.client.account_id,
//     domain: "IN",
//     otherOptions: { api_key: checkout.client.api_key },
//   });
//   try {
//     const data = await instance.requestPaymentMethod({
//       amount: String(checkout.amount),
//       currency_code: "INR",
//       payments_session_id: checkout.client.payments_session_id,
//       currency_symbol: "₹",
//       business: "<organization name>",
//       description: "Membership fee",
//       invoice_number: checkout.orderNo,
//       address: { name: checkout.name, email: checkout.email },
//     });
//     return { payment_id: data.payment_id };
//   } finally {
//     await instance.close();
//   }

export async function payWithZoho(checkout) {
  void checkout;
  throw new Error("Zoho Payments is not connected yet (frontend/src/payments/zoho.js).");
}
