const express = require("express");
const mongoose = require("mongoose");
const Application = require("../join/Application");
const Member = require("../members/Member");
const PaymentOrder = require("../payments/PaymentOrder");
const { requireAdmin } = require("../auth/requireAdmin");
const { validatePayment } = require("../members/validateMember");
const { serializeApplication } = require("../members/serialize");
const { pagination } = require("../members/query");
const { todayIST, parseDateOnly } = require("../shared/dates");
const { DOCUMENT_FIELDS, filePath, removeStoredFiles } = require("../documents/upload");
const { sendCardEmail, trySend } = require("../mail/mailer");
const { providerByName, paymentsProblem, activeProvider } = require("../payments/provider");
const { createMemberFromApplication, confirmFromBrowser, serializeOrder } = require("../payments/service");

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
  const [pendingApplications, attention, paidThisMonth] = await Promise.all([
    Application.countDocuments({ status: "PENDING" }),
    PaymentOrder.countDocuments({ failureReason: { $ne: "" }, status: { $in: ["PAID", "CREATED"] } }),
    PaymentOrder.aggregate([
      { $match: { status: "PAID", paidAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    pendingApplications,
    paymentsNeedingAttention: attention,
    onlineThisMonth: paidThisMonth[0] ? { total: paidThisMonth[0].total, count: paidThisMonth[0].count } : { total: 0, count: 0 },
    onlinePayments: { enabled: !paymentsProblem(), provider: activeProvider() ? activeProvider().name : "", problem: paymentsProblem() },
  });
});

// ---------- Applications ----------

// GET /api/admin/applications?status=PENDING&search=&page=
router.get("/applications", async (req, res) => {
  const status = ["PENDING", "PAID", "CANCELLED"].includes(one(req.query.status)) ? one(req.query.status) : "PENDING";
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

// POST /api/admin/applications/:id/record-payment { amount, mode, reference, date }
// The applicant paid offline (bank transfer, cash ...): register them now.
router.post("/applications/:id/record-payment", async (req, res) => {
  const application = await loadById(Application, req.params.id, res, "Application");
  if (!application) return;
  if (application.status !== "PENDING") return res.status(400).json({ message: "Only pending applications can be registered." });
  if (await Member.exists({ email: application.email })) {
    return res.status(409).json({ message: "A member with this email address already exists." });
  }

  const errors = {};
  const payment = validatePayment(req.body || {}, errors, { defaultDate: todayIST(), prefix: "payment" });
  if (Object.keys(errors).length) return res.status(400).json({ message: "Please correct the highlighted fields.", errors });

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
  if (application.status !== "PENDING") return res.status(400).json({ message: "Only pending applications can be cancelled." });
  application.status = "CANCELLED";
  application.cancelReason = String((req.body && req.body.reason) || "Cancelled by the admin.").slice(0, 300);
  await application.save();
  const docs = application.documents ? application.documents.toObject() : {};
  await removeStoredFiles(Object.values(docs).map((f) => f && f.filename));
  res.json({ application: serializeApplication(application) });
});

// ---------- Payments (online orders) ----------

// GET /api/admin/payments?status=&purpose=&search=&attention=1&page=
router.get("/payments", async (req, res) => {
  const filter = { ...searchFilter(req.query, ["name", "email", "orderNo", "providerPaymentId", "receiptNo"]) };
  const status = one(req.query.status);
  if (["CREATED", "PAID", "FAILED", "REFUNDED"].includes(status)) filter.status = status;
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
  res.json({ items: items.map(serializeOrder), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
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

// POST /api/admin/payments/:id/refund { amount, date, reference, note, deactivate }
// Records a refund made in the payment gateway's dashboard.
router.post("/payments/:id/refund", async (req, res) => {
  const order = await loadById(PaymentOrder, req.params.id, res, "Payment");
  if (!order) return;
  if (order.status !== "PAID") return res.status(400).json({ message: "Only paid payments can be refunded." });

  const body = req.body || {};
  const errors = {};
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > order.amount) errors.amount = `Enter an amount between 1 and ${order.amount}.`;
  const date = body.date ? parseDateOnly(body.date) : todayIST();
  if (!date || date > todayIST()) errors.date = "Enter a valid date, not in the future.";
  const reference = String(body.reference || "").trim().slice(0, 100);
  const note = String(body.note || "").trim().slice(0, 300);
  if (Object.keys(errors).length) return res.status(400).json({ message: "Please correct the highlighted fields.", errors });

  order.status = "REFUNDED";
  order.refund = { amount, date, reference, note };
  await order.save();

  if (order.memberId) {
    const member = await Member.findById(order.memberId);
    if (member) {
      const entry = member.payments.find((p) => p.orderId && String(p.orderId) === String(order._id));
      if (entry) entry.refunded = true;
      if (body.deactivate === true || body.deactivate === "true") {
        member.status = "INACTIVE";
        member.statusReason = `Payment refunded${note ? `: ${note}` : ""}`.slice(0, 300);
      }
      await member.save();
    }
  }
  res.json({ order: serializeOrder(order) });
});

module.exports = router;
