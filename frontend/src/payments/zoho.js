// Zoho Payments checkout widget.
//
// `checkout` comes from the backend (backend/payments/providers/zoho.js createCheckout):
//   { orderId, orderNo, amount, currency, name, email, client: { account_id, api_key,
//     payments_session_id, is_test_mode, business, description } }
//
// Resolves with { payment_id } for the backend to verify with Zoho. Rejects with
// code "widget_closed" when the person closes the window without paying.

const SCRIPT = "https://static.zohocdn.com/zpay/zpay-js/v1/zpayments.js";
let loading = null;

function loadScript() {
  if (window.ZPayments) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error("The payment window could not be loaded. Check your internet connection and try again."));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export async function payWithZoho(checkout) {
  await loadScript();
  const c = checkout.client;
  const instance = new window.ZPayments({
    account_id: c.account_id,
    domain: "IN",
    otherOptions: { api_key: c.api_key, ...(c.is_test_mode ? { is_test_mode: true } : {}) },
  });
  try {
    const data = await instance.requestPaymentMethod({
      amount: Number(checkout.amount).toFixed(2),
      currency_code: checkout.currency || "INR",
      currency_symbol: "₹",
      payments_session_id: c.payments_session_id,
      business: c.business,
      description: c.description,
      invoice_number: checkout.orderNo,
      address: { name: checkout.name, email: checkout.email },
    });
    return { payment_id: data && data.payment_id };
  } catch (err) {
    if (err && err.code === "widget_closed") {
      const closed = new Error("Payment window closed.");
      closed.code = "widget_closed";
      throw closed;
    }
    // Expired session etc.: the backend still checks the session, in case it was paid.
    if (err && (err.code === "session_expired" || err.code === "invalid_payment_session")) return {};
    throw new Error((err && err.message) || "The payment could not be completed.");
  } finally {
    try {
      await instance.close();
    } catch {
      /* already closed */
    }
  }
}
