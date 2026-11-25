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
const { verifyApplication, confirmPagePayment } = require("../payments/zohoPage");
const digilocker = require("../digilocker/service");
const digilockerHealth = require("../digilocker/health");
const { MESSAGES: DIGILOCKER_MESSAGES } = require("../digilocker/errors");
const { DIGILOCKER_TYPES } = require("../config/membership");
const panCheck = require("../pan/service");

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
    pan: await panCheck.latestVerified(email),
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
    pan: await panCheck.latestVerified(req.joinEmail),
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
        message: "Your DigiLocker verification has expired. Please verify with DigiLocker again.",
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

  // Institutional: the organisation's PAN, checked with the Income Tax records. When PAN
  // verification is switched on it is required, and the PAN and institution name come from
  // our own verified record.
  let panVerified = null;
  if (input.membershipType === "INSTITUTIONAL") {
    panVerified = await panCheck.findVerified(req.joinEmail, input.panVerificationId);
    if (panVerified) panCheck.applyVerified(input, panVerified);
  }

  const { data, errors } = validateMember(input, { files, mode: "public", aadhaarVerified: !!verified });
  data.aadhaar = verified
    ? { verified: true, verifiedAt: verified.verifiedAt, last4: verified.aadhaar.last4 || "", verificationId: verified.verificationId, provider: verified.provider }
    : { verified: false };
  if (input.membershipType === "INSTITUTIONAL") {
    if (panVerified) {
      Object.assign(data.pan, {
        verified: true,
        verifiedAt: panVerified.verifiedAt,
        registeredName: panVerified.registeredName,
        panType: panVerified.panType,
        verificationId: panVerified.verificationId,
        provider: panVerified.provider,
      });
    } else if (panCheck.required() && !errors.pan) {
      errors.pan = "Please verify the PAN of the institution.";
    }
  }
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
    paidOnPage: !!oldReference,
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
    // Cashfree down / out of credits (kind UNAVAILABLE): the join page silently switches to the
    // manual form. Anything else (e.g. the session ran out) keeps the applicant on DigiLocker.
    const kind = err.kind || "UNAVAILABLE";
    res.status(kind === "UNAVAILABLE" ? 503 : 400).json({
      code: kind === "UNAVAILABLE" ? "DIGILOCKER_UNAVAILABLE" : `DIGILOCKER_${kind}`,
      message: DIGILOCKER_MESSAGES[kind] || DIGILOCKER_MESSAGES.UNAVAILABLE,
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

// POST /api/join/pan/verify { pan } — Institutional: checks the organisation's PAN.
// 200 { verified, verificationId, pan, name, panType, locked }; 400/503 { message, errors.pan }.
router.post("/pan/verify", otpLimiter, requireJoin, async (req, res) => {
  try {
    res.json(await panCheck.verify(req.joinEmail, req.body && req.body.pan));
  } catch (err) {
    if (!(err instanceof panCheck.PanCheckError)) throw err;
    if (err.code === "PAN_UNAVAILABLE") return res.status(503).json({ code: err.code, message: err.message });
    res.status(err.status).json({ message: err.message, errors: { pan: err.message } });
  }
});

// DELETE /api/join/application — withdraw the open application.
router.delete("/application", requireJoin, async (req, res) => {
  const open = await Application.find({ email: req.joinEmail, status: { $in: OPEN_STATUSES } });
  for (const a of open) await cancelApplication(a, "Withdrawn by the applicant.");
  res.json({ cancelled: open.length });
});

// POST /api/join/application/paid — "I have completed the payment" on the Zoho payment page.
// Usually not needed: Zoho's webhook sends the application to the admin by itself. This checks
// again for a payment Zoho has reported for this email; without one, nothing changes (409).
router.post("/application/paid", requireJoin, async (req, res) => {
  const application = await Application.findOne({ email: req.joinEmail, status: { $in: ["UNPAID", "PENDING"] } }).sort({ createdAt: -1 });
  if (!application) return res.status(404).json({ message: "Please fill in your details first." });
  if (application.status === "PENDING") return res.json(await applicationResponse(application)); // the webhook was first
  if (!PAYMENT_PAGES[application.membershipType]) {
    return res.status(400).json({ message: "Paying on the payment page is not available for this plan. Please contact the membership office." });
  }
  // Only a payment Zoho has actually reported sends the application for review.
  const result = await confirmPagePayment(application);
  if (!result.verified) {
    return res.status(409).json({
      code: "PAYMENT_NOT_RECEIVED",
      message:
        "We have not received your payment from Zoho yet. If you have just paid, please wait a minute and try again. " +
        "If you used a different email address on the Zoho page, please contact the membership office.",
    });
  }
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
