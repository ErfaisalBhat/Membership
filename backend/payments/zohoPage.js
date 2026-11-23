const ZohoPayment = require("./ZohoPayment");
const Application = require("../join/Application");
const { MEMBERSHIP_TYPES } = require("../config/membership");

// Payments made on the Zoho payment page (one page for all plans).
//
// Zoho calls the webhook for every payment; it is stored in ZohoPayment. The applicant enters
// the Zoho payment ID on the join page; when both are there and the amount matches the plan,
// the application is marked "verified by Zoho". The admin approves either way, but sees
// whether Zoho confirmed the payment.

const pick = (...values) => values.find((v) => v !== undefined && v !== null && v !== "") || "";

// Stores (or updates) a payment from the webhook, then verifies a waiting application.
async function recordWebhookPayment(payment, { liveMode = true } = {}) {
  if (!payment || !payment.payment_id) return null;
  const customer = payment.customer || payment.customer_details || {};
  const doc = await ZohoPayment.findOneAndUpdate(
    { paymentId: String(payment.payment_id) },
    {
      $set: {
        status: String(payment.status || ""),
        amount: Number(payment.amount) || 0,
        currency: payment.currency || "INR",
        email: String(pick(payment.email, payment.customer_email, customer.email, payment.receipt_email)),
        name: String(pick(payment.customer_name, customer.name, payment.name)),
        method: String((payment.payment_method && payment.payment_method.type) || ""),
        liveMode,
        paidAt: payment.date ? new Date(Number(payment.date) * (String(payment.date).length <= 10 ? 1000 : 1)) : new Date(),
        raw: payment,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  const waiting = await Application.findOne({ status: "PENDING", paymentReference: referenceRegex(doc.paymentId) });
  if (waiting) await verifyApplication(waiting);
  return doc;
}

function referenceRegex(reference) {
  return new RegExp(`^${String(reference).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

// Checks the application's payment ID against the payments Zoho reported. Saves and returns
// { verified, note } — note says why it is not verified.
async function verifyApplication(application) {
  const result = await checkReference(application.paymentReference, application);
  application.paymentVerified = result.verified;
  application.paymentNote = result.note;
  await application.save();
  if (result.verified && result.payment && !result.payment.applicationId) {
    result.payment.applicationId = application._id;
    await result.payment.save();
  }
  return result;
}

async function checkReference(reference, application) {
  if (!reference) return { verified: false, note: "" };
  const payment = await ZohoPayment.findOne({ paymentId: referenceRegex(reference) });
  if (!payment) return { verified: false, note: "Not received from Zoho yet." };
  if (payment.status !== "succeeded") return { verified: false, note: `Zoho reports this payment as ${payment.status || "unknown"}.`, payment };
  if (payment.applicationId && String(payment.applicationId) !== String(application._id)) {
    const other = await Application.findById(payment.applicationId).select("status").lean();
    if (other && !["REJECTED", "CANCELLED"].includes(other.status)) {
      return { verified: false, note: "This payment is already linked to another application.", payment };
    }
  }
  const fee = MEMBERSHIP_TYPES[application.membershipType] ? MEMBERSHIP_TYPES[application.membershipType].fee : null;
  if (fee !== null && Math.abs(payment.amount - fee) > 0.001) {
    return { verified: false, note: `Zoho received Rs. ${payment.amount}, but the ${MEMBERSHIP_TYPES[application.membershipType].label} fee is Rs. ${fee}.`, payment };
  }
  return { verified: true, note: `Verified by Zoho: Rs. ${payment.amount}${payment.method ? ` by ${payment.method}` : ""}.`, payment };
}

module.exports = { recordWebhookPayment, verifyApplication, referenceRegex };
