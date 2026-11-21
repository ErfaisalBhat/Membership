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
const { sendCodeEmail, sendApplicationReceivedEmail, sendNewApplicationAdminEmail, trySend } = require("../mail/mailer");
const { startCheckout, confirmFromBrowser, publicOrder } = require("../payments/service");
const { memberUpload, pickFiles, checkFileContents, toStoredFile, removeUploaded, removeStoredFiles } = require("../documents/upload");
const digilocker = require("../digilocker/service");
const digilockerHealth = require("../digilocker/health");
const { MESSAGES: DIGILOCKER_MESSAGES } = require("../digilocker/errors");
const { DIGILOCKER_TYPES } = require("../config/membership");

// Public sign-up:
//   1. POST /otp       email -> 6-digit code by email (refused if already a member)
//   2. POST /verify    code  -> join token (header X-Join-Token on the next calls)
//   3. POST /application      form + documents -> PENDING application (waits for admin review)
//   -- the admin approves it (APPROVED) and the applicant is emailed a link back here --
//   4. POST /application/checkout             -> starts the online payment (APPROVED only)
//   5. POST /orders/:id/confirm               -> browser reports the payment result
// The applicant sees the status of their application by verifying the same email again.

const { OPEN_STATUSES } = Application;

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

// The application to show the applicant: the open one, else the last paid or rejected one.
async function latestApplication(email) {
  return (
    (await Application.findOne({ email, status: { $in: OPEN_STATUSES } }).sort({ createdAt: -1 })) ||
    (await Application.findOne({ email, status: { $in: ["PAID", "REJECTED"] } }).sort({ updatedAt: -1 }))
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
  const latest = await latestApplication(email);
  res.json({
    joinToken,
    email,
    application: latest && latest.status !== "PAID" ? serializeApplication(latest) : null,
    digilocker: await digilocker.latestVerified(email),
  });
});

// GET /api/join/application — the open application, or the one just paid / rejected,
// plus the applicant's DigiLocker verification (if any) to fill the form again.
router.get("/application", requireJoin, async (req, res) => {
  res.json({
    ...(await applicationResponse(await latestApplication(req.joinEmail))),
    email: req.joinEmail,
    digilocker: await digilocker.latestVerified(req.joinEmail),
  });
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

  // Filled from Aadhaar through DigiLocker: the locked fields always come from our own
  // verified record, never from what the browser sent.
  // A student who already verified cannot switch back to typing these details by hand.
  let verified = null;
  if (DIGILOCKER_TYPES.includes(input.membershipType)) {
    verified = await digilocker.findVerified(req.joinEmail, input.digilockerId);
    if (input.digilockerId && !verified) {
      await removeUploaded(files);
      return res.status(400).json({
        code: "DIGILOCKER_EXPIRED",
        message: "Your DigiLocker verification has expired. Please verify with DigiLocker again, or fill the form manually.",
      });
    }
    if (verified) for (const k of digilocker.LOCKED) if (verified.aadhaar[k]) input[k] = verified.aadhaar[k];
  }

  const { data, errors } = validateMember(input, { files, mode: "public", aadhaarVerified: !!verified });
  data.aadhaar = verified
    ? { verified: true, verifiedAt: verified.verifiedAt, last4: verified.aadhaar.last4 || "", verificationId: verified.verificationId, provider: verified.provider }
    : { verified: false };
  Object.assign(errors, await checkFileContents(files));
  if (Object.keys(errors).length) {
    await removeUploaded(files);
    return res.status(400).json({ message: "Please correct the highlighted fields.", errors });
  }
  if (await Member.exists({ email: data.email })) {
    await removeUploaded(files);
    return res.status(409).json(MEMBER_EXISTS);
  }

  // One open application per email: a new submission replaces the old one (and goes back to review).
  const previous = await Application.find({ email: data.email, status: { $in: OPEN_STATUSES } });
  for (const old of previous) await cancelApplication(old, "Replaced by a new application.");

  const application = await Application.create({
    ...data,
    documents: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, toStoredFile(f)])),
    termsAcceptedAt: new Date(),
  });
  await trySend(() => sendApplicationReceivedEmail(application));
  await trySend(() => sendNewApplicationAdminEmail(application));
  res.status(201).json(await applicationResponse(application));
});

// GET /api/join/digilocker/available -> { available } — asked before showing the DigiLocker
// screen; when false (Cashfree down) the student goes straight to the manual form.
router.get("/digilocker/available", async (req, res) => {
  res.json({ available: await digilockerHealth.isAvailable() });
});

// POST /api/join/digilocker/start { membershipType } -> { url } of the DigiLocker consent page.
// 503 DIGILOCKER_UNAVAILABLE when Cashfree / DigiLocker can't be used: fill the form by hand.
router.post("/digilocker/start", otpLimiter, requireJoin, async (req, res) => {
  const type = String((req.body && req.body.membershipType) || "");
  if (!DIGILOCKER_TYPES.includes(type)) return res.status(400).json({ message: "DigiLocker is not available for this membership type." });
  if (await digilocker.latestVerified(req.joinEmail)) {
    return res.status(409).json({ code: "DIGILOCKER_DONE", message: "Your Aadhaar is already verified through DigiLocker." });
  }
  try {
    res.json(await digilocker.start(req.joinEmail, type));
  } catch (err) {
    res.status(503).json({
      code: "DIGILOCKER_UNAVAILABLE",
      message: `${DIGILOCKER_MESSAGES.UNAVAILABLE} Please fill the form manually; the membership office will review your documents.`,
    });
  }
});

// POST /api/join/digilocker/complete { verificationId } — the student is back from DigiLocker.
// Always 200: { email, verified: true, prefill, locked, last4, verificationId }
//          or { email, verified: false, kind, message } (then the form is filled by hand).
router.post("/digilocker/complete", requireJoin, async (req, res) => {
  const result = await digilocker.complete(req.joinEmail, req.body && req.body.verificationId);
  res.json({ email: req.joinEmail, ...result });
});

// DELETE /api/join/application — withdraw the open application.
router.delete("/application", requireJoin, async (req, res) => {
  const open = await Application.find({ email: req.joinEmail, status: { $in: OPEN_STATUSES } });
  for (const a of open) await cancelApplication(a, "Withdrawn by the applicant.");
  res.json({ cancelled: open.length });
});

// POST /api/join/application/checkout — start the online payment (approved applications only).
router.post("/application/checkout", requireJoin, async (req, res) => {
  const application = await Application.findOne({ email: req.joinEmail, status: "APPROVED" }).sort({ createdAt: -1 });
  if (!application) return res.status(404).json({ message: "Your application has not been approved yet, so it cannot be paid for." });
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
