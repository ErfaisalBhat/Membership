const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const Application = require("./Application");
const Member = require("../members/Member");
const PaymentOrder = require("../payments/PaymentOrder");
const { validateMember, normalizeEmail, isValidEmail } = require("../members/validateMember");
const { serializeApplication } = require("../members/serialize");
const { createCode, checkCode, CODE_MINUTES } = require("../auth/otp");
const { createSession, requireJoin, JOIN_SESSION_HOURS } = require("../auth/sessions");
const { sendCodeEmail, trySend } = require("../mail/mailer");
const { startCheckout, confirmFromBrowser, publicOrder } = require("../payments/service");
const { memberUpload, pickFiles, checkFileContents, toStoredFile, removeUploaded, removeStoredFiles } = require("../documents/upload");

// Public sign-up:
//   1. POST /otp       email -> 6-digit code by email (refused if already a member)
//   2. POST /verify    code  -> join token (header X-Join-Token on the next calls)
//   3. POST /application      form + documents -> PENDING application
//   4. POST /application/checkout             -> starts the online payment
//   5. POST /orders/:id/confirm               -> browser reports the payment result
// A PENDING application can be continued later by verifying the same email again.

const router = express.Router();

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again in 15 minutes." },
});

const MEMBER_EXISTS = {
  code: "MEMBER_EXISTS",
  message: "This email address already belongs to a member. Please log in to your member account to download your card or renew.",
};

const filesOf = (doc) =>
  Object.values((doc.documents && (doc.documents.toObject ? doc.documents.toObject() : doc.documents)) || {})
    .map((f) => f && f.filename)
    .filter(Boolean);

async function cancelApplication(application, reason) {
  application.status = "CANCELLED";
  application.cancelReason = reason;
  await application.save();
  await removeStoredFiles(filesOf(application));
}

async function latestApplication(email) {
  return (
    (await Application.findOne({ email, status: "PENDING" }).sort({ createdAt: -1 })) ||
    (await Application.findOne({ email, status: "PAID" }).sort({ updatedAt: -1 }))
  );
}

async function applicationResponse(application) {
  if (!application) return { application: null, member: null };
  let member = null;
  if (application.memberId) {
    const m = await Member.findById(application.memberId).select("membershipId expiryDate joinDate name").lean();
    if (m) member = { membershipId: m.membershipId, expiryDate: m.expiryDate, joinDate: m.joinDate, name: m.name };
  }
  return { application: serializeApplication(application), member };
}

// POST /api/join/otp { email }
router.post("/otp", otpLimiter, async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  if (!isValidEmail(email)) return res.status(400).json({ message: "Enter a valid email address.", errors: { email: "Enter a valid email address." } });
  if (await Member.exists({ email })) return res.status(409).json(MEMBER_EXISTS);

  const code = await createCode(email, "JOIN");
  const result = await trySend(() => sendCodeEmail(email, code, "JOIN", CODE_MINUTES));
  if (!result.sent) return res.status(502).json({ message: "We could not send the email. Please check the address and try again." });
  res.json({ sent: true, email, emailLogOnly: result.simulated });
});

// POST /api/join/verify { email, code }
router.post("/verify", otpLimiter, async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  if (!isValidEmail(email)) return res.status(400).json({ message: "Enter a valid email address." });
  await checkCode(email, "JOIN", req.body && req.body.code);
  if (await Member.exists({ email })) return res.status(409).json(MEMBER_EXISTS);

  const joinToken = await createSession("JOIN", email, JOIN_SESSION_HOURS);
  const pending = await Application.findOne({ email, status: "PENDING" }).sort({ createdAt: -1 });
  res.json({ joinToken, email, application: pending ? serializeApplication(pending) : null });
});

// GET /api/join/application — the pending application, or the one just paid.
router.get("/application", requireJoin, async (req, res) => {
  res.json(await applicationResponse(await latestApplication(req.joinEmail)));
});

// POST /api/join/application  (multipart: data=JSON, photo, signature, idProof, studentId)
router.post("/application", requireJoin, memberUpload, async (req, res) => {
  const files = pickFiles(req.files);
  let input;
  try {
    input = JSON.parse((req.body && req.body.data) || "{}");
  } catch {
    input = null;
  }
  if (!input || typeof input !== "object") {
    await removeUploaded(files);
    return res.status(400).json({ message: "Invalid form data." });
  }
  input.email = req.joinEmail; // always the verified address

  const { data, errors } = validateMember(input, { files, mode: "public" });
  Object.assign(errors, await checkFileContents(files));
  if (Object.keys(errors).length) {
    await removeUploaded(files);
    return res.status(400).json({ message: "Please correct the highlighted fields.", errors });
  }
  if (await Member.exists({ email: data.email })) {
    await removeUploaded(files);
    return res.status(409).json(MEMBER_EXISTS);
  }

  // One pending application per email: a new submission replaces the old one.
  const previous = await Application.find({ email: data.email, status: "PENDING" });
  for (const old of previous) await cancelApplication(old, "Replaced by a new application.");

  const application = await Application.create({
    ...data,
    documents: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, toStoredFile(f)])),
    termsAcceptedAt: new Date(),
  });
  res.status(201).json(await applicationResponse(application));
});

// DELETE /api/join/application — start over.
router.delete("/application", requireJoin, async (req, res) => {
  const pending = await Application.find({ email: req.joinEmail, status: "PENDING" });
  for (const a of pending) await cancelApplication(a, "Cancelled by the applicant.");
  res.json({ cancelled: pending.length });
});

// POST /api/join/application/checkout — start the online payment.
router.post("/application/checkout", requireJoin, async (req, res) => {
  const application = await Application.findOne({ email: req.joinEmail, status: "PENDING" }).sort({ createdAt: -1 });
  if (!application) return res.status(404).json({ message: "No application is waiting for payment." });
  if (await Member.exists({ email: req.joinEmail })) return res.status(409).json(MEMBER_EXISTS);
  res.json({ checkout: await startCheckout({ purpose: "NEW", application }) });
});

// POST /api/join/orders/:id/confirm { result } — the browser checkout finished.
router.post("/orders/:id/confirm", requireJoin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Payment not found." });
  const order = await PaymentOrder.findOne({ _id: req.params.id, purpose: "NEW" });
  const application = order && (await Application.findById(order.applicationId));
  if (!order || !application || application.email !== req.joinEmail) return res.status(404).json({ message: "Payment not found." });

  const updated = await confirmFromBrowser(order, req.body && req.body.result);
  const fresh = await Application.findById(application._id);
  res.json({ order: publicOrder(updated), ...(await applicationResponse(fresh)) });
});

module.exports = router;
