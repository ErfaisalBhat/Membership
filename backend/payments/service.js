const PaymentOrder = require("./PaymentOrder");
const Application = require("../join/Application");
const Member = require("../members/Member");
const { PERSON_KEYS } = require("../members/memberFields");
const { MEMBERSHIP_TYPES } = require("../config/membership");
const { nextMembershipId, nextReceiptNo, nextOrderNo } = require("../members/membershipId");
const { computeExpiry, todayIST } = require("../shared/dates");
const { renewalPeriod } = require("../members/renewal");
const { activeProvider, paymentsProblem, providerByName } = require("./provider");
const {
  sendCardEmail,
  sendPaymentIncompleteEmail,
  sendApplicationReceivedEmail,
  sendNewApplicationAdminEmail,
  trySend,
} = require("../mail/mailer");

class PaymentError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

// Adds a payment to member.payments, with a receipt number when money was received.
// Does not save the member.
async function addPayment(member, entry) {
  const receiptNo = entry.amount > 0 ? await nextReceiptNo(entry.date) : "";
  member.payments.push({ ...entry, receiptNo });
  return member.payments[member.payments.length - 1];
}

// Creates a Member from a paid Application. Used for online payments and when the
// admin records an offline payment for an application.
async function createMemberFromApplication(application, payment) {
  const joinDate = todayIST();
  const expiryDate = computeExpiry(joinDate, MEMBERSHIP_TYPES[application.membershipType].validityMonths);
  const fields = {};
  for (const key of PERSON_KEYS) fields[key] = application[key];

  const member = new Member({
    ...fields,
    membershipId: await nextMembershipId(joinDate),
    status: "ACTIVE",
    source: "ONLINE",
    joinDate,
    expiryDate,
  });
  const entry = await addPayment(member, { kind: "NEW", ...payment, periodFrom: joinDate, periodTo: expiryDate });
  await member.save();

  application.status = "PAID";
  application.memberId = member._id;
  await application.save();
  return { member, entry };
}

// ---------- Starting a payment ----------

function checkoutPayload(order, client) {
  return {
    provider: order.provider,
    orderId: order._id,
    orderNo: order.orderNo,
    amount: order.amount,
    currency: order.currency,
    purpose: order.purpose,
    name: order.name,
    email: order.email,
    client,
  };
}

// applicant: { name, email, membershipType } for a new membership paid before the
// details are filled (no application yet).
async function startCheckout({ purpose, application = null, member = null, applicant = null }) {
  const problem = paymentsProblem();
  if (problem) throw new PaymentError(`${problem} Please contact the membership office to pay.`, 503);
  const provider = activeProvider();

  const person = application || member || applicant;
  const order = await PaymentOrder.create({
    orderNo: await nextOrderNo(),
    purpose,
    applicationId: application ? application._id : null,
    memberId: member ? member._id : null,
    name: person.name,
    email: person.email,
    membershipType: person.membershipType,
    amount: MEMBERSHIP_TYPES[person.membershipType].fee,
    provider: provider.name,
  });

  try {
    const { sessionId, client } = await provider.createCheckout(order);
    order.providerSessionId = sessionId || "";
    await order.save();
    return checkoutPayload(order, client);
  } catch (err) {
    order.status = "FAILED";
    order.failureReason = `Could not start payment: ${err.message}`;
    await order.save();
    console.error("[PAYMENT] createCheckout failed:", err.message);
    throw new PaymentError("The payment could not be started. Please try again in a few minutes.", 502);
  }
}

// ---------- Applying the gateway's answer ----------

// Marks the order paid and activates / extends the membership. Safe to call twice
// (browser confirmation and webhook can both arrive): only the first call does the work.
async function activateOrder(orderId, { paymentId = "", method = "" } = {}) {
  const order = await PaymentOrder.findOneAndUpdate(
    { _id: orderId, status: { $in: ["CREATED", "FAILED"] } },
    { $set: { status: "PAID", paidAt: new Date(), providerPaymentId: paymentId, paymentMethod: method, failureReason: "" } },
    { returnDocument: "after" }
  );
  if (!order) return PaymentOrder.findById(orderId); // already handled

  try {
    const payment = {
      amount: order.amount,
      mode: "Online",
      reference: paymentId || order.orderNo,
      date: todayIST(),
      source: "ONLINE",
      orderId: order._id,
    };

    if (order.purpose === "NEW" && !order.applicationId) {
      // Paid before any details were filled (an earlier version of the join page): the money is held until the applicant fills in their details and
      // the admin approves; the member (and receipt) is created on approval.
      if (await Member.exists({ email: order.email })) {
        order.failureReason = "Paid, but a member with this email already exists. Check the member and refund if needed.";
        await order.save();
        console.error(`[PAYMENT] ${order.orderNo}: member with email already exists`);
        return order;
      }
      const other = await PaymentOrder.exists({ _id: { $ne: order._id }, email: order.email, purpose: "NEW", status: "PAID", memberId: null });
      if (other) {
        order.failureReason = "Paid twice: this email already has an unused membership payment. Refund one of them.";
        await order.save();
        console.error(`[PAYMENT] ${order.orderNo}: second unused payment for ${order.email}`);
      }
      return order;
    }

    if (order.purpose === "NEW") {
      const application = await Application.findById(order.applicationId);
      const paidByOther = application && application.paymentOrderId && !application.paymentOrderId.equals(order._id);
      if (!application || application.status === "PAID" || paidByOther) {
        order.failureReason = "Paid twice: this application was already paid by another order. Refund this payment.";
        await order.save();
        console.error(`[PAYMENT] ${order.orderNo}: duplicate payment for application ${order.applicationId}`);
        return order;
      }
      if (application.status === "UNPAID") {
        // Details filled, now paid: the application goes to the admin for review. The member
        // (and receipt) is created when the admin approves it.
        if (await Member.exists({ email: application.email })) {
          order.failureReason = "Paid, but a member with this email already exists. Check the member and refund if needed.";
          await order.save();
          console.error(`[PAYMENT] ${order.orderNo}: member with email already exists`);
          return order;
        }
        application.status = "PENDING";
        application.paymentOrderId = order._id;
        await application.save();
        order.name = application.name;
        await order.save();
        await trySend(() => sendApplicationReceivedEmail(application, { paid: true }));
        await trySend(() => sendNewApplicationAdminEmail(application));
        return order;
      }
      if (application.status !== "APPROVED") {
        // e.g. the admin cancelled or the applicant withdrew it while the payment was in progress.
        // The payment stays unused, so a new application from this email re-uses it.
        order.failureReason = `Paid, but the application is ${application.status.toLowerCase()}. Refund this payment, unless the applicant submits a new application.`;
        await order.save();
        console.error(`[PAYMENT] ${order.orderNo}: application ${application._id} is ${application.status}`);
        return order;
      }
      if (await Member.exists({ email: application.email })) {
        order.failureReason = "Paid, but a member with this email already exists. Check the member and refund if needed.";
        await order.save();
        console.error(`[PAYMENT] ${order.orderNo}: member with email already exists`);
        return order;
      }
      const { member, entry } = await createMemberFromApplication(application, payment);
      order.memberId = member._id;
      order.receiptNo = entry.receiptNo;
      order.periodFrom = entry.periodFrom;
      order.periodTo = entry.periodTo;
      await order.save();
      await trySend(() => sendCardEmail(member, "welcome", { payment: entry }));
      return order;
    }

    // RENEWAL
    const member = await Member.findById(order.memberId);
    if (!member) throw new Error("Member not found for renewal order.");
    const { periodFrom, periodTo } = renewalPeriod(member, todayIST());
    order.previousExpiry = member.expiryDate;
    member.expiryDate = periodTo;
    member.status = "ACTIVE";
    member.statusReason = "";
    const entry = await addPayment(member, { kind: "RENEWAL", ...payment, periodFrom, periodTo });
    await member.save();
    order.receiptNo = entry.receiptNo;
    order.periodFrom = periodFrom;
    order.periodTo = periodTo;
    await order.save();
    await trySend(() => sendCardEmail(member, "renewal", { payment: entry }));
    return order;
  } catch (err) {
    // Put the order back so the webhook or the admin can retry; the money was received.
    console.error(`[PAYMENT] Activation failed for ${order.orderNo}:`, err);
    await PaymentOrder.updateOne(
      { _id: order._id },
      { $set: { status: "CREATED", failureReason: `Payment received but activation failed: ${err.message}` } }
    );
    throw err;
  }
}

// The paid, not yet used payment of an applicant (pay-first flow), if any.
function unusedPaidOrder(email) {
  return PaymentOrder.findOne({ email, purpose: "NEW", status: "PAID", memberId: null }).sort({ paidAt: -1 });
}

// The admin approved an application that was paid online beforehand: register the member
// with that payment, link everything and send the welcome email with ID card and receipt.
async function registerPaidApplication(application, order) {
  const payment = {
    amount: order.amount,
    mode: "Online",
    reference: order.providerPaymentId || order.orderNo,
    date: todayIST(),
    source: "ONLINE",
    orderId: order._id,
  };
  const { member, entry } = await createMemberFromApplication(application, payment);
  order.applicationId = application._id;
  order.memberId = member._id;
  order.name = application.name;
  order.receiptNo = entry.receiptNo;
  order.periodFrom = entry.periodFrom;
  order.periodTo = entry.periodTo;
  order.failureReason = "";
  await order.save();
  const email = await trySend(() => sendCardEmail(member, "welcome", { payment: entry }));
  return { member, entry, email };
}

async function failOrder(orderId, reason) {
  const order = await PaymentOrder.findOneAndUpdate(
    { _id: orderId, status: "CREATED" },
    { $set: { status: "FAILED", failureReason: reason || "Payment failed." } },
    { returnDocument: "after" }
  );
  if (!order) return PaymentOrder.findById(orderId);
  if (order.purpose === "NEW") {
    const application = await Application.findById(order.applicationId);
    if (application && application.status === "APPROVED") await trySend(() => sendPaymentIncompleteEmail(application));
  }
  return order;
}

async function applyResult(order, result) {
  if (result.status === "PAID") return activateOrder(order._id, result);
  if (result.status === "FAILED") return failOrder(order._id, result.reason);
  return order; // PENDING: wait for the webhook
}

// Called when the browser checkout finishes. The provider double-checks with the gateway.
async function confirmFromBrowser(order, clientResult) {
  if (order.status === "PAID" || order.status === "REFUNDED") return order;
  const provider = providerByName(order.provider);
  if (!provider) throw new PaymentError("Unknown payment provider for this order.", 500);
  const result = await provider.verifyPayment(order, clientResult || {});
  return applyResult(order, result);
}

function serializeOrder(o) {
  return {
    _id: o._id,
    orderNo: o.orderNo,
    purpose: o.purpose,
    status: o.status,
    amount: o.amount,
    currency: o.currency,
    name: o.name,
    email: o.email,
    membershipType: o.membershipType,
    typeLabel: MEMBERSHIP_TYPES[o.membershipType] ? MEMBERSHIP_TYPES[o.membershipType].label : o.membershipType,
    provider: o.provider,
    providerPaymentId: o.providerPaymentId,
    paymentMethod: o.paymentMethod,
    failureReason: o.failureReason,
    receiptNo: o.receiptNo,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
    periodFrom: o.periodFrom,
    periodTo: o.periodTo,
    memberId: o.memberId,
    applicationId: o.applicationId,
    refund: o.refund && o.refund.date ? o.refund : null,
  };
}

// What the payer sees about their own order.
function publicOrder(o) {
  return {
    _id: o._id,
    orderNo: o.orderNo,
    status: o.status,
    amount: o.amount,
    receiptNo: o.receiptNo,
    periodTo: o.periodTo,
  };
}

module.exports = {
  PaymentError,
  publicOrder,
  addPayment,
  createMemberFromApplication,
  registerPaidApplication,
  unusedPaidOrder,
  startCheckout,
  activateOrder,
  failOrder,
  confirmFromBrowser,
  serializeOrder,
};
