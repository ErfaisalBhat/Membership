const express = require("express");
const mongoose = require("mongoose");
const Member = require("./Member");
const { requireAdmin } = require("../auth/requireAdmin");
const { MEMBERSHIP_TYPES } = require("../config/membership");
const { validateMember, validatePayment } = require("./validateMember");
const { nextMembershipId } = require("./membershipId");
const { computeExpiry, todayIST, displayDate } = require("../shared/dates");
const { buildMemberFilter, pagination } = require("./query");
const { serializeMember, serializeRow, effectiveStatus } = require("./serialize");
const { renewalPeriod } = require("./renewal");
const { addPayment } = require("../payments/service");
const Application = require("../join/Application");
const { generateIdCard } = require("../idcard/idCard");
const { generateReceipt } = require("../idcard/receipt");
const { sendCardEmail, trySend } = require("../mail/mailer");
const {
  memberUpload,
  pickFiles,
  checkFileContents,
  toStoredFile,
  filePath,
  removeStoredFiles,
  removeUploaded,
  DOCUMENT_FIELDS,
} = require("../documents/upload");

const router = express.Router();
router.use(requireAdmin);

const ADMIN_SEARCH_FIELDS = ["name", "membershipId", "email", "whatsapp", "contactPerson"];

async function loadMember(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: "Member not found." });
    return null;
  }
  const member = await Member.findById(req.params.id);
  if (!member) res.status(404).json({ message: "Member not found." });
  return member;
}

function parseFormData(req) {
  try {
    const data = JSON.parse(req.body && req.body.data ? req.body.data : "{}");
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function validationFailed(res, errors) {
  return res.status(400).json({ message: "Please correct the highlighted fields.", errors });
}

// GET /api/members?search=&type=&status=&expiring=30&page=&limit=
router.get("/", async (req, res) => {
  const filter = buildMemberFilter(req.query, ADMIN_SEARCH_FIELDS);
  const { page, limit, skip } = pagination(req.query);
  const [items, total] = await Promise.all([
    Member.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Member.countDocuments(filter),
  ]);
  res.json({ items: items.map(serializeRow), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

// GET /api/members/stats
router.get("/stats", async (req, res) => {
  const count = (query) => Member.countDocuments(buildMemberFilter(query, ADMIN_SEARCH_FIELDS));
  const [total, active, expired, inactive, expiringSoon] = await Promise.all([
    Member.estimatedDocumentCount(),
    count({ status: "ACTIVE" }),
    count({ status: "EXPIRED" }),
    count({ status: "INACTIVE" }),
    count({ expiring: "30" }),
  ]);
  const byTypeRaw = await Member.aggregate([{ $group: { _id: "$membershipType", count: { $sum: 1 } } }]);
  const byType = Object.fromEntries(Object.keys(MEMBERSHIP_TYPES).map((k) => [k, 0]));
  for (const t of byTypeRaw) byType[t._id] = t.count;
  res.json({ total, active, expired, inactive, expiringSoon, byType });
});

// GET /api/members/export.csv  (same filters as the list)
router.get("/export.csv", async (req, res) => {
  const filter = buildMemberFilter(req.query, ADMIN_SEARCH_FIELDS);
  const members = await Member.find(filter).sort({ membershipId: 1 }).lean();

  // Prefix cells that Excel would treat as formulas.
  const cell = (v) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = [
    "Membership ID", "Name", "Contact Person", "Type", "Status", "Email", "Number",
    "Gender", "Date of Birth", "Date of Joining", "Valid Till", "Address Line 1", "Address Line 2",
    "City", "State", "PIN Code", "Affiliated", "Institution", "Department", "Designation",
    "Affiliation State", "Listed Publicly", "Total Paid", "Remarks",
  ];
  const lines = [header.map(cell).join(",")];
  for (const m of members) {
    const a = m.address || {};
    const af = m.affiliation || {};
    const paid = (m.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    lines.push(
      [
        m.membershipId, m.name, m.contactPerson, MEMBERSHIP_TYPES[m.membershipType]?.label || m.membershipType,
        effectiveStatus(m), m.email, m.whatsapp, m.gender, displayDate(m.dob), displayDate(m.joinDate),
        m.expiryDate ? displayDate(m.expiryDate) : "Lifetime", a.line1, a.line2, a.city, a.state, a.pincode,
        m.affiliated ? "Yes" : "No", af.institution, af.department, af.designation, af.state,
        m.showInPublicList ? "Yes" : "No", paid, m.remarks,
      ].map(cell).join(",")
    );
  }
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="members-${stamp}.csv"`);
  res.send("﻿" + lines.join("\r\n")); // BOM so Excel reads UTF-8 names correctly
});

// POST /api/members  (multipart: data=JSON, photo, signature, idProof)
router.post("/", memberUpload, async (req, res) => {
  const files = pickFiles(req.files);
  const input = parseFormData(req);
  if (!input) {
    await removeUploaded(files);
    return res.status(400).json({ message: "Invalid form data." });
  }

  const { data, errors } = validateMember(input, { files });
  Object.assign(errors, await checkFileContents(files));
  if (!errors.email && (await Member.exists({ email: data.email }))) {
    errors.email = "A member with this email address already exists.";
  }
  if (Object.keys(errors).length) {
    await removeUploaded(files);
    return validationFailed(res, errors);
  }

  const { payment, ...fields } = data;
  const expiryDate = computeExpiry(data.joinDate, MEMBERSHIP_TYPES[data.membershipType].validityMonths);
  const member = new Member({
    ...fields,
    membershipId: await nextMembershipId(data.joinDate),
    status: expiryDate && expiryDate < todayIST() ? "EXPIRED" : "ACTIVE",
    source: "ADMIN",
    expiryDate,
    documents: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, toStoredFile(f)])),
  });
  const entry = await addPayment(member, { kind: "NEW", ...payment, periodFrom: data.joinDate, periodTo: expiryDate });

  try {
    await member.save();
  } catch (err) {
    await removeUploaded(files);
    if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
      return validationFailed(res, { email: "A member with this email address already exists." });
    }
    throw err;
  }

  // An open online application from the same person is no longer needed.
  await Application.updateMany(
    { email: member.email, status: { $in: Application.OPEN_STATUSES } },
    { $set: { status: "CANCELLED", cancelReason: "Registered by the admin." } }
  );

  const email = await trySend(() => sendCardEmail(member, "welcome", { payment: entry }));
  res.status(201).json({ member: serializeMember(member), email });
});

// GET /api/members/:id
router.get("/:id", async (req, res) => {
  const member = await loadMember(req, res);
  if (member) res.json({ member: serializeMember(member) });
});

// PUT /api/members/:id  (multipart; files are optional and replace the old ones)
router.put("/:id", memberUpload, async (req, res) => {
  const files = pickFiles(req.files);
  const member = await loadMember(req, res);
  if (!member) return removeUploaded(files);
  const input = parseFormData(req);
  if (!input) {
    await removeUploaded(files);
    return res.status(400).json({ message: "Invalid form data." });
  }

  const { data, errors } = validateMember(input, { files, existing: member });
  Object.assign(errors, await checkFileContents(files));
  if (!errors.email && (await Member.exists({ email: data.email, _id: { $ne: member._id } }))) {
    errors.email = "Another member already uses this email address.";
  }
  if (Object.keys(errors).length) {
    await removeUploaded(files);
    return validationFailed(res, errors);
  }

  const replaced = [];
  for (const [key, f] of Object.entries(files)) {
    if (member.documents[key] && member.documents[key].filename) replaced.push(member.documents[key].filename);
    member.documents[key] = toStoredFile(f);
  }
  delete data.membershipType;
  member.set(data);

  try {
    await member.save();
  } catch (err) {
    await removeUploaded(files);
    if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
      return validationFailed(res, { email: "Another member already uses this email address." });
    }
    throw err;
  }
  await removeStoredFiles(replaced);
  res.json({ member: serializeMember(member) });
});

// POST /api/members/:id/renew  { amount, mode, reference, date }
router.post("/:id/renew", async (req, res) => {
  const member = await loadMember(req, res);
  if (!member) return;
  const months = MEMBERSHIP_TYPES[member.membershipType].validityMonths;
  if (!months) return res.status(400).json({ message: "Life memberships do not need renewal." });
  if (member.status === "INACTIVE") {
    return res.status(400).json({ message: "This membership is inactive. Reinstate it before renewing." });
  }

  const errors = {};
  const payment = validatePayment(req.body || {}, errors, { defaultDate: todayIST(), prefix: "payment" });
  if (Object.keys(errors).length) return validationFailed(res, errors);

  // Still valid: extend from the current expiry. Already expired: start again from the payment date.
  const { periodFrom, periodTo } = renewalPeriod(member, payment.date);
  if (periodTo < todayIST()) {
    return validationFailed(res, { "payment.date": "This payment date would give a period that has already ended." });
  }

  member.expiryDate = periodTo;
  member.status = "ACTIVE";
  member.statusReason = "";
  const entry = await addPayment(member, { kind: "RENEWAL", ...payment, periodFrom, periodTo });
  await member.save();

  const email = await trySend(() => sendCardEmail(member, "renewal", { payment: entry }));
  res.json({ member: serializeMember(member), email });
});

// POST /api/members/:id/status  { action: "deactivate", reason } | { action: "reinstate" }
router.post("/:id/status", async (req, res) => {
  const member = await loadMember(req, res);
  if (!member) return;
  const action = req.body && req.body.action;
  const reason = String((req.body && req.body.reason) || "").trim();

  if (action === "deactivate") {
    if (!reason) return validationFailed(res, { reason: "Enter the reason for making this membership inactive." });
    if (reason.length > 300) return validationFailed(res, { reason: "Must be at most 300 characters." });
    member.status = "INACTIVE";
    member.statusReason = reason;
  } else if (action === "reinstate") {
    if (member.status !== "INACTIVE") return res.status(400).json({ message: "This membership is not inactive." });
    const expired = member.expiryDate && member.expiryDate < todayIST();
    member.status = expired ? "EXPIRED" : "ACTIVE";
    member.statusReason = "";
  } else {
    return res.status(400).json({ message: "Unknown action." });
  }
  await member.save();
  res.json({ member: serializeMember(member) });
});

// GET /api/members/:id/card.pdf
router.get("/:id/card.pdf", async (req, res) => {
  const member = await loadMember(req, res);
  if (!member) return;
  const pdf = await generateIdCard(member);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="ID-Card-${member.membershipId}.pdf"`);
  res.send(pdf);
});

// GET /api/members/:id/receipts/:paymentId.pdf
router.get("/:id/receipts/:paymentId.pdf", async (req, res) => {
  const member = await loadMember(req, res);
  if (!member) return;
  const payment = member.payments.id(req.params.paymentId);
  if (!payment || !payment.receiptNo) return res.status(404).json({ message: "Receipt not found." });
  const pdf = await generateReceipt(member, payment);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="Receipt-${payment.receiptNo.replace(/\//g, "-")}.pdf"`);
  res.send(pdf);
});

// POST /api/members/:id/send-card
router.post("/:id/send-card", async (req, res) => {
  const member = await loadMember(req, res);
  if (!member) return;
  const email = await trySend(() => sendCardEmail(member, "resend"));
  if (!email.sent) return res.status(502).json({ message: `Email could not be sent: ${email.error}`, email });
  res.json({ message: "ID card emailed.", email });
});

// GET /api/members/:id/files/:kind  (photo | signature | idProof)
router.get("/:id/files/:kind", async (req, res) => {
  if (!DOCUMENT_FIELDS[req.params.kind]) return res.status(404).json({ message: "Unknown document." });
  const member = await loadMember(req, res);
  if (!member) return;
  const doc = member.documents && member.documents[req.params.kind];
  if (!doc || !doc.filename) return res.status(404).json({ message: "Document not uploaded." });
  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(filePath(doc.filename), (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: "File is missing on the server." });
  });
});

module.exports = router;
