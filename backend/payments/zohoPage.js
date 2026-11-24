const ZohoPayment = require("./ZohoPayment");
const Application = require("../join/Application");
const { MEMBERSHIP_TYPES } = require("../config/membership");
const { sendApplicationReceivedEmail, sendNewApplicationAdminEmail, trySend } = require("../mail/mailer");

// Payments made on the Zoho payment pages (one page per plan, fee fixed).
//
// Zoho calls the webhook for every payment; it is stored in ZohoPayment and matched to the
// applicant's application by email: the application then goes to the admin for review, marked
// "verified by Zoho". "I have completed the payment" only checks for such a payment again: an
// application never goes for review until Zoho has reported the payment.

const pick = (...values) => values.find((v) => v !== undefined && v !== null && v !== "") || "";

function referenceRegex(reference) {
  return new RegExp(`^${String(reference).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

// Stores (or updates) a payment from the webhook, then finds the application it pays for.
async function recordWebhookPayment(payment, { liveMode = true } = {}) {
  if (!payment || !payment.payment_id) return null;
  const customer = payment.customer || payment.customer_details || payment.billing_details || {};
  const doc = await ZohoPayment.findOneAndUpdate(
    { paymentId: String(payment.payment_id) },
    {
      $set: {
        status: String(payment.status || ""),
        amount: Number(payment.amount) || 0,
        currency: payment.currency || "INR",
        email: String(pick(payment.email, payment.customer_email, payment.email_id, customer.email, customer.email_id, payment.receipt_email)),
        name: String(pick(payment.customer_name, customer.name, payment.name)),
        method: String((payment.payment_method && payment.payment_method.type) || ""),
        liveMode,
        paidAt: payment.date ? new Date(Number(payment.date) * (String(payment.date).length <= 10 ? 1000 : 1)) : new Date(),
        raw: payment,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  if (doc.status !== "succeeded" || doc.applicationId) return doc;

  const application =
    (await Application.findOne({ status: "PENDING", paymentReference: referenceRegex(doc.paymentId) })) ||
    (doc.email
      ? await Application.findOne({ email: doc.email, status: { $in: ["UNPAID", "PENDING"] }, paymentReference: "", paymentOrderId: null }).sort({ createdAt: -1 })
      : null);
  if (application) await attachPayment(application, doc);
  else console.warn(`[ZOHO PAGE] Payment ${doc.paymentId}${doc.email ? ` from ${doc.email}` : " (no email)"} matches no application yet.`);
  return doc;
}

// Links a Zoho payment to the application: it goes to the admin (if it was waiting for payment).
async function attachPayment(application, payment) {
  const wasUnpaid = application.status === "UNPAID";
  application.paidOnPage = true;
  application.paymentReference = payment.paymentId;
  if (!application.paymentReportedAt) application.paymentReportedAt = payment.paidAt || new Date();
  application.status = "PENDING";
  await verifyApplication(application); // saves
  if (wasUnpaid) {
    await trySend(() => sendApplicationReceivedEmail(application, { paid: true }));
    await trySend(() => sendNewApplicationAdminEmail(application));
  }
}

// A payment Zoho reported for this applicant's email that is not linked to anything yet.
function unlinkedPaymentFor(application) {
  return ZohoPayment.findOne({ email: application.email, status: "succeeded", applicationId: null }).sort({ paidAt: -1 });
}

// Checks the application's payment against what Zoho reported. Saves; returns { verified, note }.
async function verifyApplication(application) {
  if (!application.paymentReference && application.paidOnPage) {
    const found = await unlinkedPaymentFor(application);
    if (found) application.paymentReference = found.paymentId;
  }
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
  if (!reference) return { verified: false, note: `Zoho has not reported a payment from ${application.email} yet.` };
  const payment = await ZohoPayment.findOne({ paymentId: referenceRegex(reference) });
  if (!payment) return { verified: false, note: "Not received from Zoho yet." };
  if (payment.status !== "succeeded") return { verified: false, note: `Zoho reports this payment as ${payment.status || "unknown"}.`, payment };
  if (payment.applicationId && String(payment.applicationId) !== String(application._id)) {
    const other = await Application.findById(payment.applicationId).select("status").lean();
    if (other && !["REJECTED", "CANCELLED"].includes(other.status)) {
      return { verified: false, note: "This payment is already linked to another application.", payment };
    }
  }
  const type = MEMBERSHIP_TYPES[application.membershipType];
  if (type && Math.abs(payment.amount - type.fee) > 0.001) {
    return { verified: false, note: `Zoho received Rs. ${payment.amount}, but the ${type.label} fee is Rs. ${type.fee}.`, payment };
  }
  return { verified: true, note: `Verified by Zoho: Rs. ${payment.amount}${payment.method ? ` by ${payment.method}` : ""}.`, payment };
}

// "I have completed the payment": links a payment Zoho has already reported for this email
// (right amount, not used elsewhere) and sends the application for review. Nothing changes
// when there is none. Returns { verified, note }.
async function confirmPagePayment(application) {
  const found = await unlinkedPaymentFor(application);
  if (!found) return { verified: false, note: "Zoho has not reported a payment yet." };
  const result = await checkReference(found.paymentId, application);
  if (!result.verified) return result;
  await attachPayment(application, found);
  return result;
}

module.exports = { recordWebhookPayment, verifyApplication, confirmPagePayment, referenceRegex };
