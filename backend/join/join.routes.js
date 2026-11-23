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
const { startCheckout, confirmFromBrowser, publicOrder, unusedPaidOrder } = require("../payments/service");
const { MEMBERSHIP_TYPES, PAYMENT_PAGES } = require("../config/membership");
const { memberUpload, pickFiles, checkFileContents, toStoredFile, removeUploaded, removeStoredFiles } = require("../documents/upload");
const { verifyApplication, referenceRegex } = require("../payments/zohoPage");
const digilocker = require("../digilocker/service");
const digilockerHealth = require("../digilocker/health");
const { MESSAGES: DIGILOCKER_MESSAGES } = require("../digilocker/errors");
const { DIGILOCKER_TYPES } = require("../config/membership");

// Public sign-up (details, then payment):
//   1. POST /otp                  email -> 6-digit code by email (refused if already a member)
//   2. POST /verify               code  -> join token (header X-Join-Token on the next calls)
//   3. POST /application          form + documents -> UNPAID application
//   4. POST /application/checkout -> starts the online payment for that application
//   5. POST /orders/:id/confirm   -> browser reports the result; once paid the application
//                                    becomes PENDING and goes to the admin for review
//   -- the admin approves it: the member is registered and the ID card emailed --
// An unused payment (e.g. after a rejection) is re-used: the new application is PENDING at once.
// Older applications approved before payment also pay via POST /application/checkout.
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

// A Zoho payment page payment from an application that was rejected or withdrawn: it is
// carried over to the next application, so the applicant does not pay twice.
function unusedPaymentReference(email) {
  return Application.findOne({ email, status: { $in: ["REJECTED", "CANCELLED"] }, paymentReference: { $ne: "" } }).sort({ createdAt: -1 });
}

// The applicant's paid, not yet used payment, for the join page.
async function paidOrderInfo(email) {
  const label = (t) => (MEMBERSHIP_TYPES[t] ? MEMBERSHIP_TYPES[t].label : t);
  const o = await unusedPaidOrder(email);
  if (o) return { _id: o._id, orderNo: o.orderNo, membershipType: o.membershipType, typeLabel: label(o.membershipType), amount: o.amount, paidAt: o.paidAt };
  const old = await unusedPaymentReference(email);
  if (!old) return null;
  const type = MEMBERSHIP_TYPES[old.membershipType];
  return {
    reference: old.paymentReference,
    membershipType: old.membershipType,
    typeLabel: label(old.membershipType),
    amount: type ? type.fee : null,
    paidAt: old.paymentReportedAt,
  };
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
    paidOrder: await paidOrderInfo(email),
  });
});

// GET /api/join/application — the open application, or the one just paid / rejected,
// plus the applicant's DigiLocker verification (if any) to fill the form again.
router.get("/application", requireJoin, async (req, res) => {
  res.json({
    ...(await applicationResponse(await latestApplication(req.joinEmail))),
    email: req.joinEmail,
    digilocker: await digilocker.latestVerified(req.joinEmail),
    paidOrder: await paidOrderInfo(req.joinEmail),
  });
});

// POST /api/join/application  (multipart: data=JSON, photo, signature, idProof)
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

  // A payment not used yet (e.g. kept after a rejection) is re-used for the plan it paid for.
  const paidOrder = await unusedPaidOrder(req.joinEmail);
  const oldReference = paidOrder ? null : await unusedPaymentReference(req.joinEmail);
  if (paidOrder) input.membershipType = paidOrder.membershipType;
  if (oldReference) input.membershipType = oldReference.membershipType;

  // Filled from Aadhaar through DigiLocker: the locked fields always come from our own
  // verified record, never from what the browser sent.
  // An applicant who already verified cannot switch back to typing these details by hand.
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
    if (verified) {
      digilocker.applyVerified(input, verified);
      // The Aadhaar photo is the passport photograph; any photo uploaded instead is dropped.
      const photo = await digilocker.photoFile(verified);
      if (photo) {
        if (files.photo) await removeUploaded({ photo: files.photo });
        files.photo = photo;
      }
    }
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
    status: paidOrder || oldReference ? "PENDING" : "UNPAID",
    paymentOrderId: paidOrder ? paidOrder._id : null,
    paymentReference: oldReference ? oldReference.paymentReference : "",
    paymentReportedAt: oldReference ? oldReference.paymentReportedAt : null,
  });
  if (paidOrder) {
    paidOrder.applicationId = application._id;
    paidOrder.name = application.name;
    if (paidOrder.failureReason.startsWith("Application ") || paidOrder.failureReason.startsWith("Paid, but the application")) paidOrder.failureReason = "";
    await paidOrder.save();
  }
  if (oldReference) await verifyApplication(application);
  if (paidOrder || oldReference) {
    await trySend(() => sendApplicationReceivedEmail(application, { paid: true }));
    await trySend(() => sendNewApplicationAdminEmail(application));
  }
  res.status(201).json(await applicationResponse(application));
});

// GET /api/join/digilocker/available -> { available } — asked before showing the DigiLocker
// screen; when false (Cashfree down) the applicant goes straight to the manual form.
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

// POST /api/join/digilocker/complete { verificationId } — the applicant is back from DigiLocker.
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

// POST /api/join/application/payment-reference { reference } — paid on the Zoho payment page:
// the applicant enters the Zoho payment ID and the application goes to the admin, who checks
// the payment in Zoho before approving.
router.post("/application/payment-reference", requireJoin, async (req, res) => {
  const reference = String((req.body && req.body.reference) || "").trim();
  if (reference.length < 4 || reference.length > 100) {
    return res.status(400).json({ message: "Enter the payment ID shown by Zoho after paying.", errors: { reference: "Enter the payment ID from Zoho." } });
  }
  const application = await Application.findOne({ email: req.joinEmail, status: "UNPAID" }).sort({ createdAt: -1 });
  if (!application) return res.status(404).json({ message: "Please fill in your details first." });
  if (!PAYMENT_PAGES[application.membershipType]) {
    return res.status(400).json({ message: "Paying on the payment page is not available for this plan. Please contact the membership office." });
  }
  const used = await Application.exists({
    _id: { $ne: application._id },
    paymentReference: referenceRegex(reference),
    status: { $in: ["PENDING", "APPROVED", "PAID"] },
  });
  if (used) {
    return res.status(409).json({ message: "This payment ID has already been used for another application.", errors: { reference: "Already used." } });
  }
  application.paymentReference = reference;
  application.paymentReportedAt = new Date();
  application.status = "PENDING";
  await verifyApplication(application); // saves; verified now if Zoho's webhook already arrived
  await trySend(() => sendApplicationReceivedEmail(application, { paid: true }));
  await trySend(() => sendNewApplicationAdminEmail(application));
  res.json(await applicationResponse(application));
});

// POST /api/join/application/checkout — pay for the submitted application (UNPAID, or
// APPROVED under the older flow).
router.post("/application/checkout", requireJoin, async (req, res) => {
  const application = await Application.findOne({ email: req.joinEmail, status: { $in: ["UNPAID", "APPROVED"] } }).sort({ createdAt: -1 });
  if (!application) {
    const pending = await Application.exists({ email: req.joinEmail, status: "PENDING" });
    return res.status(pending ? 409 : 404).json(
      pending
        ? { code: "ALREADY_PAID", message: "Your payment has been received and your application is being reviewed. You do not need to pay again." }
        : { message: "Please fill in your details first." }
    );
  }
  if (await Member.exists({ email: req.joinEmail })) return res.status(409).json(MEMBER_EXISTS);
  res.json({ checkout: await startCheckout({ purpose: "NEW", application }) });
});

// POST /api/join/orders/:id/confirm { result } — the browser checkout finished.
router.post("/orders/:id/confirm", requireJoin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Payment not found." });
  const order = await PaymentOrder.findOne({ _id: req.params.id, purpose: "NEW" });
  if (!order || order.email !== req.joinEmail) return res.status(404).json({ message: "Payment not found." });

  const updated = await confirmFromBrowser(order, req.body && req.body.result);
  const fresh = updated.applicationId ? await Application.findById(updated.applicationId) : null;
  res.json({ order: publicOrder(updated), ...(await applicationResponse(fresh)), paidOrder: await paidOrderInfo(req.joinEmail) });
});

module.exports = router;
