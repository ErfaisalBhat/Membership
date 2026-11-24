const express = require("express");
const mongoose = require("mongoose");
const Application = require("../join/Application");
const Member = require("../members/Member");
const PaymentOrder = require("../payments/PaymentOrder");
const ZohoPayment = require("../payments/ZohoPayment");
const { referenceRegex, verifyApplication } = require("../payments/zohoPage");
const { MEMBERSHIP_TYPES, PAYMENT_PAGES } = require("../config/membership");
const { currentFees, saveFees } = require("../settings/fees");
const { requireAdmin } = require("../auth/requireAdmin");
const { validatePayment } = require("../members/validateMember");
const { serializeApplication } = require("../members/serialize");
const { pagination } = require("../members/query");
const { todayIST } = require("../shared/dates");
const { DOCUMENT_FIELDS, filePath, removeStoredFiles } = require("../documents/upload");
const { sendCardEmail, sendApplicationApprovedEmail, sendApplicationRejectedEmail, trySend } = require("../mail/mailer");
const { providerByName, paymentsProblem, activeProvider } = require("../payments/provider");
const { createMemberFromApplication, registerPaidApplication, confirmFromBrowser, serializeOrder } = require("../payments/service");

// Admin pages for online sign-ups and payments. Mounted at /api/admin.

const router = express.Router();
router.use(requireAdmin);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const one = (v) => (Array.isArray(v) ? v[0] : v);

function searchFilter(query, fields) {
  const search = String(one(query.search) || "").trim().slice(0, 100);
  if (!search) return {};
  const rx = new RegExp(escapeRegex(search), "i");
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

async function loadById(Model, id, res, label) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ message: `${label} not found.` });
    return null;
  }
  const doc = await Model.findById(id);
  if (!doc) res.status(404).json({ message: `${label} not found.` });
  return doc;
}

// ---------- Overview ----------

// GET /api/admin/overview — numbers for the admin dashboard cards.
router.get("/overview", async (req, res) => {
  const today = todayIST();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const [pendingApplications, approvedApplications, attention, paidThisMonth] = await Promise.all([
    Application.countDocuments({ status: "PENDING" }),
    Application.countDocuments({ status: "APPROVED" }),
    PaymentOrder.countDocuments({ failureReason: { $ne: "" }, status: { $in: ["PAID", "CREATED"] } }),
    PaymentOrder.aggregate([
      { $match: { status: "PAID", paidAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    pendingApplications,
    approvedApplications,
    paymentsNeedingAttention: attention,
    onlineThisMonth: paidThisMonth[0] ? { total: paidThisMonth[0].total, count: paidThisMonth[0].count } : { total: 0, count: 0 },
    onlinePayments: { enabled: !paymentsProblem(), provider: activeProvider() ? activeProvider().name : "", problem: paymentsProblem() },
  });
});

// ---------- Plan fees ----------

// GET /api/admin/fees -> { fees: [{ key, label, fee, regularFee }], paymentPages }
router.get("/fees", (req, res) => {
  res.json({ fees: currentFees(), paymentPages: Object.keys(PAYMENT_PAGES) });
});

// PUT /api/admin/fees { fees: { ANNUAL: { fee, regularFee }, ... } }
// New applicants and renewals pay the new fees at once. Payments already made keep their amount.
router.put("/fees", async (req, res) => {
  const result = await saveFees(req.body && req.body.fees, req.admin && req.admin.email);
  if (result.errors) return res.status(400).json({ message: "Please correct the highlighted fees.", errors: result.errors });
  res.json(result);
});

// ---------- Applications ----------

// GET /api/admin/applications?status=PENDING&search=&page=
router.get("/applications", async (req, res) => {
  const status = ["UNPAID", "PENDING", "APPROVED", "PAID", "REJECTED", "CANCELLED"].includes(one(req.query.status)) ? one(req.query.status) : "PENDING";
  const filter = { status, ...searchFilter(req.query, ["name", "email", "whatsapp"]) };
  const { page, limit, skip } = pagination(req.query);
  const [items, total] = await Promise.all([
    Application.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Application.countDocuments(filter),
  ]);
  // Last payment attempt per application, so the admin can see failed tries.
  const orders = await PaymentOrder.find({ applicationId: { $in: items.map((a) => a._id) } })
    .sort({ createdAt: -1 })
    .select("applicationId status createdAt")
    .lean();
  const lastAttempt = {};
  for (const o of orders) if (!lastAttempt[o.applicationId]) lastAttempt[o.applicationId] = { status: o.status, at: o.createdAt };

  res.json({
    items: items.map((a) => ({ ...serializeApplication(a), lastAttempt: lastAttempt[a._id] || null })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

// GET /api/admin/applications/:id
router.get("/applications/:id", async (req, res) => {
  const application = await loadById(Application, req.params.id, res, "Application");
  if (!application) return;
  // Zoho payment page: check again in case Zoho's webhook arrived after the applicant submitted.
  if (application.status === "PENDING" && application.paidOnPage && !application.paymentVerified) {
    await verifyApplication(application);
  }
  const orders = await PaymentOrder.find({ applicationId: application._id }).sort({ createdAt: -1 }).lean();
  res.json({ application: serializeApplication(application, { full: true }), orders: orders.map(serializeOrder) });
});

// GET /api/admin/applications/:id/files/:kind
router.get("/applications/:id/files/:kind", async (req, res) => {
  if (!DOCUMENT_FIELDS[req.params.kind]) return res.status(404).json({ message: "Unknown document." });
  const application = await loadById(Application, req.params.id, res, "Application");
  if (!application) return;
  const doc = application.documents && application.documents[req.params.kind];
  if (!doc || !doc.filename) return res.status(404).json({ message: "Document not uploaded." });
  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(filePath(doc.filename), (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: "File is missing on the server." });
  });
});

const isOpen = (application) => Application.OPEN_STATUSES.includes(application.status);

async function deleteDocuments(application) {
  const docs = application.documents ? application.documents.toObject() : {};
  await removeStoredFiles(Object.values(docs).map((f) => f && f.filename));
}

// The online payment an application was paid with beforehand (pay-first flow), if any.
const paidOrderOf = (application) => (application.paymentOrderId ? PaymentOrder.findById(application.paymentOrderId) : null);

// Rejected or cancelled after paying: note on the payment that it is not used yet (it shows
// under Payments -> Needs attention). It is kept for the applicant's next application, which
// clears the note. No refunds are made.
async function flagUnusedPayment(application, what) {
  const order = await paidOrderOf(application);
  if (!order || order.status !== "PAID" || order.memberId) return false;
  order.failureReason = `Application ${what}. The payment is kept for this applicant's next application.`;
  await order.save();
  return true;
}

// POST /api/admin/applications/:id/approve
// Paid beforehand (pay-first flow): the member is registered now and the ID card emailed.
// Older unpaid applications: the applicant is emailed a link to pay.
router.post("/applications/:id/approve", async (req, res) => {
  const application = await loadById(Application, req.params.id, res, "Application");
  if (!application) return;
  if (application.status !== "PENDING") return res.status(400).json({ message: "Only applications waiting for review can be approved." });
  if (await Member.exists({ email: application.email })) {
    return res.status(409).json({ message: "A member with this email address already exists." });
  }
  if (application.paymentOrderId) {
    const order = await paidOrderOf(application);
    if (!order || order.status !== "PAID" || order.memberId) {
      return res.status(400).json({ message: "The payment for this application is no longer available, so it cannot be approved." });
    }
    application.reviewedAt = new Date();
    application.reviewNote = "";
    const { member, email } = await registerPaidApplication(application, order);
    return res.json({
      application: serializeApplication(application, { full: true }),
      memberId: member._id,
      membershipId: member.membershipId,
      email,
    });
  }
  if (application.paidOnPage || application.paymentReference) {
    // Paid on the Zoho payment page (verified by the webhook, or checked by the admin in Zoho).
    application.reviewedAt = new Date();
    application.reviewNote = "";
    // The amount Zoho actually received (the fee may have changed since); else the current fee.
    const zoho = application.paymentReference ? await ZohoPayment.findOne({ paymentId: referenceRegex(application.paymentReference) }).lean() : null;
    const { member, entry } = await createMemberFromApplication(application, {
      amount: zoho && zoho.amount > 0 ? zoho.amount : MEMBERSHIP_TYPES[application.membershipType].fee,
      mode: "Online",
      reference: application.paymentReference ? `Zoho ${application.paymentReference}`.slice(0, 100) : "Zoho payment page",
      date: todayIST(),
      source: "OFFLINE",
    });
    if (application.paymentReference) {
      await ZohoPayment.updateOne({ paymentId: referenceRegex(application.paymentReference) }, { $set: { applicationId: application._id } });
    }
    const email = await trySend(() => sendCardEmail(member, "welcome", { payment: entry }));
    return res.json({ application: serializeApplication(application, { full: true }), memberId: member._id, membershipId: member.membershipId, email });
  }
  application.status = "APPROVED";
  application.reviewedAt = new Date();
  application.reviewNote = "";
  await application.save();
  const email = await trySend(() => sendApplicationApprovedEmail(application));
  res.json({ application: serializeApplication(application, { full: true }), email });
});

// POST /api/admin/applications/:id/reject { reason }
// The reason is emailed to the applicant; the uploaded documents are deleted.
router.post("/applications/:id/reject", async (req, res) => {
  const application = await loadById(Application, req.params.id, res, "Application");
  if (!application) return;
  if (!isOpen(application)) return res.status(400).json({ message: "Only applications waiting for review or payment can be rejected." });
  const reason = String((req.body && req.body.reason) || "").trim().slice(0, 500);
  if (!reason) return res.status(400).json({ message: "Enter the reason. It is sent to the applicant.", errors: { reason: "Enter the reason." } });

  application.status = "REJECTED";
  application.reviewedAt = new Date();
  application.reviewNote = reason;
  // The Zoho payment ID is not genuine: it is not carried over to a new application.
  if (req.body && req.body.paymentNotFound && application.paidOnPage) {
    application.invalidPaymentReference = application.paymentReference || "(none)";
    application.paymentReference = "";
    application.paidOnPage = false;
  }
  await application.save();
  await deleteDocuments(application);
  await PaymentOrder.updateMany(
    { applicationId: application._id, status: "CREATED" },
    { $set: { status: "FAILED", failureReason: "Closed: the application was rejected." } }
  );
  // A payment Zoho confirmed is kept for a new application (see join.routes unusedPaymentReference).
  const paid = (await flagUnusedPayment(application, "rejected")) || !!application.paymentReference;
  const email = await trySend(() => sendApplicationRejectedEmail(application, reason, { paid }));
  res.json({ application: serializeApplication(application, { full: true }), email });
});

// POST /api/admin/applications/:id/record-payment { amount, mode, reference, date }
// The applicant paid offline (bank transfer, cash ...): approve and register them now.
router.post("/applications/:id/record-payment", async (req, res) => {
  const application = await loadById(Application, req.params.id, res, "Application");
  if (!application) return;
  if (!isOpen(application)) return res.status(400).json({ message: "Only applications waiting for review or payment can be registered." });
  if (application.paymentOrderId) {
    return res.status(400).json({ message: "This applicant has already paid online. Use Approve to register them." });
  }
  if (await Member.exists({ email: application.email })) {
    return res.status(409).json({ message: "A member with this email address already exists." });
  }

  const errors = {};
  const payment = validatePayment(req.body || {}, errors, { defaultDate: todayIST(), prefix: "payment" });
  if (Object.keys(errors).length) return res.status(400).json({ message: "Please correct the highlighted fields.", errors });

  if (!application.reviewedAt) application.reviewedAt = new Date();
  const { member, entry } = await createMemberFromApplication(application, { ...payment, source: "OFFLINE" });
  await PaymentOrder.updateMany(
    { applicationId: application._id, status: "CREATED" },
    { $set: { status: "FAILED", failureReason: "Closed: the applicant paid offline." } }
  );
  const email = await trySend(() => sendCardEmail(member, "welcome", { payment: entry }));
  res.json({ memberId: member._id, membershipId: member.membershipId, email });
});

// POST /api/admin/applications/:id/cancel { reason }
router.post("/applications/:id/cancel", async (req, res) => {
  const application = await loadById(Application, req.params.id, res, "Application");
  if (!application) return;
  if (!isOpen(application)) return res.status(400).json({ message: "Only applications waiting for review or payment can be cancelled." });
  application.status = "CANCELLED";
  application.cancelReason = String((req.body && req.body.reason) || "Cancelled by the admin.").slice(0, 300);
  await application.save();
  await deleteDocuments(application);
  await flagUnusedPayment(application, "cancelled");
  res.json({ application: serializeApplication(application) });
});

// ---------- Payments (online orders) ----------

// GET /api/admin/payments?status=&purpose=&search=&attention=1&page=
router.get("/payments", async (req, res) => {
  const filter = { ...searchFilter(req.query, ["name", "email", "orderNo", "providerPaymentId", "receiptNo"]) };
  const status = one(req.query.status);
  if (["CREATED", "PAID", "FAILED"].includes(status)) filter.status = status;
  const purpose = one(req.query.purpose);
  if (["NEW", "RENEWAL"].includes(purpose)) filter.purpose = purpose;
  if (one(req.query.attention) === "1") {
    filter.failureReason = { $ne: "" };
    filter.status = { $in: ["PAID", "CREATED"] };
  }
  const { page, limit, skip } = pagination(req.query);
  const [items, total] = await Promise.all([
    PaymentOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PaymentOrder.countDocuments(filter),
  ]);
  // Flag orders whose member / application record no longer exists, so the page
  // doesn't link to a "not found" screen.
  const memberIds = items.map((o) => o.memberId).filter(Boolean);
  const appIds = items.map((o) => o.applicationId).filter(Boolean);
  const [members, apps] = await Promise.all([
    Member.find({ _id: { $in: memberIds } }).select("_id").lean(),
    Application.find({ _id: { $in: appIds } }).select("_id").lean(),
  ]);
  const haveMember = new Set(members.map((m) => String(m._id)));
  const haveApp = new Set(apps.map((a) => String(a._id)));
  res.json({
    items: items.map((o) => ({
      ...serializeOrder(o),
      memberMissing: !!o.memberId && !haveMember.has(String(o.memberId)),
      applicationMissing: !!o.applicationId && !haveApp.has(String(o.applicationId)),
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

// POST /api/admin/payments/:id/check — ask the gateway again (e.g. a webhook was missed).
router.post("/payments/:id/check", async (req, res) => {
  const order = await loadById(PaymentOrder, req.params.id, res, "Payment");
  if (!order) return;
  if (order.status !== "CREATED" && !(order.status === "FAILED" && order.provider !== "test")) {
    return res.status(400).json({ message: "Only open or failed payments can be checked." });
  }
  if (!providerByName(order.provider)) return res.status(400).json({ message: "Unknown payment provider." });
  const updated = await confirmFromBrowser(order, {});
  res.json({ order: serializeOrder(updated) });
});

module.exports = router;
