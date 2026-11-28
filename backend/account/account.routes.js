const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const Member = require("../members/Member");
const PaymentOrder = require("../payments/PaymentOrder");
const { normalizeEmail, isValidEmail, validateSelfUpdate } = require("../members/validateMember");
const { serializeOwnMember, effectiveStatus, typeLabel } = require("../members/serialize");
const { renewalInfo } = require("../members/renewal");
const { createCode, checkCode, CODE_MINUTES } = require("../auth/otp");
const { createSession, endSession, requireMember, MEMBER_SESSION_HOURS } = require("../auth/sessions");
const { sendCodeEmail, trySend } = require("../mail/mailer");
const { generateIdCard } = require("../idcard/idCard");
const { generateReceipt } = require("../idcard/receipt");
const { filePath } = require("../documents/upload");
const { paymentsProblem } = require("../payments/provider");
const { startCheckout, confirmFromBrowser, publicOrder } = require("../payments/service");

// Member account. Members have no password: they log in with a code sent to their email.

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again in 15 minutes." },
});

// One person (email) can hold several plans, one member record each. They log in to one and
// can switch to the others (POST /switch).
async function plansOf(email) {
  const members = await Member.find({ email }, "membershipId membershipType status expiryDate joinDate").sort({ joinDate: 1, _id: 1 }).lean();
  return members.map((m) => ({
    _id: m._id,
    membershipId: m.membershipId,
    membershipType: m.membershipType,
    typeLabel: typeLabel(m.membershipType),
    status: effectiveStatus(m),
    expiryDate: m.expiryDate,
  }));
}

async function accountResponse(member) {
  return {
    member: serializeOwnMember(member),
    renewal: renewalInfo(member),
    onlinePayments: !paymentsProblem(),
    plans: await plansOf(member.email),
  };
}

// POST /api/account/otp { email }
// The answer is the same whether or not the email belongs to a member.
router.post("/otp", loginLimiter, async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  if (!isValidEmail(email)) return res.status(400).json({ message: "Enter a valid email address.", errors: { email: "Enter a valid email address." } });
  let emailLogOnly = false;
  if (await Member.exists({ email })) {
    const code = await createCode(email, "LOGIN");
    const result = await trySend(() => sendCodeEmail(email, code, "LOGIN", CODE_MINUTES));
    if (!result.sent) return res.status(502).json({ message: "We could not send the email. Please try again later." });
    emailLogOnly = result.simulated;
  }
  res.json({ sent: true, email, emailLogOnly });
});

// POST /api/account/verify { email, code }
router.post("/verify", loginLimiter, async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  await checkCode(email, "LOGIN", req.body && req.body.code);
  // Several plans: the first one is opened; the page then asks which plan to show.
  const member = await Member.findOne({ email }).sort({ joinDate: 1, _id: 1 });
  if (!member) return res.status(400).json({ message: "This code has expired. Please ask for a new code." });
  const token = await createSession("MEMBER", member._id, MEMBER_SESSION_HOURS);
  res.json({ token, ...(await accountResponse(member)) });
});

router.use(requireMember);

// GET /api/account/me
router.get("/me", async (req, res) => {
  res.json(await accountResponse(req.member));
});

// POST /api/account/switch { memberId } — open another plan of the same person (same email).
router.post("/switch", async (req, res) => {
  const memberId = req.body && req.body.memberId;
  const member = mongoose.isValidObjectId(memberId) ? await Member.findOne({ _id: memberId, email: req.member.email }) : null;
  if (!member) return res.status(404).json({ message: "Membership not found." });
  const token = await createSession("MEMBER", member._id, MEMBER_SESSION_HOURS);
  await endSession(req.sessionToken);
  res.json({ token, ...(await accountResponse(member)) });
});

// PUT /api/account/me { whatsapp, address, affiliated, affiliation, showInPublicList }
router.put("/me", async (req, res) => {
  const { data, errors } = validateSelfUpdate(req.body || {}, req.member);
  if (Object.keys(errors).length) return res.status(400).json({ message: "Please correct the highlighted fields.", errors });
  req.member.set(data);
  await req.member.save();
  // The person's other plans get the same contact details.
  await Member.updateMany({ email: req.member.email, _id: { $ne: req.member._id } }, { $set: data });
  res.json(await accountResponse(req.member));
});

// POST /api/account/logout
router.post("/logout", async (req, res) => {
  await endSession(req.sessionToken);
  res.json({ message: "Logged out." });
});

// GET /api/account/card.pdf
router.get("/card.pdf", async (req, res) => {
  const pdf = await generateIdCard(req.member);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="ID-Card-${req.member.membershipId}.pdf"`);
  res.send(pdf);
});

// GET /api/account/receipts/:paymentId.pdf
router.get("/receipts/:paymentId.pdf", async (req, res) => {
  const payment = req.member.payments.id(req.params.paymentId);
  if (!payment || !payment.receiptNo) return res.status(404).json({ message: "Receipt not found." });
  const pdf = await generateReceipt(req.member, payment);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="Receipt-${payment.receiptNo.replace(/\//g, "-")}.pdf"`);
  res.send(pdf);
});

// GET /api/account/photo
router.get("/photo", (req, res) => {
  const photo = req.member.documents && req.member.documents.photo;
  if (!photo || !photo.filename) return res.status(404).end();
  res.setHeader("Content-Type", photo.mimeType);
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(filePath(photo.filename), (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// POST /api/account/renew/checkout — start an online renewal payment.
router.post("/renew/checkout", async (req, res) => {
  const info = renewalInfo(req.member);
  if (!info.canRenew) return res.status(400).json({ message: info.reason });
  res.json({ checkout: await startCheckout({ purpose: "RENEWAL", member: req.member }) });
});

// POST /api/account/orders/:id/confirm { result }
router.post("/orders/:id/confirm", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Payment not found." });
  const order = await PaymentOrder.findOne({ _id: req.params.id, memberId: req.member._id, purpose: "RENEWAL" });
  if (!order) return res.status(404).json({ message: "Payment not found." });
  const updated = await confirmFromBrowser(order, req.body && req.body.result);
  const member = await Member.findById(req.member._id);
  res.json({ order: publicOrder(updated), ...(await accountResponse(member)) });
});

module.exports = router;
