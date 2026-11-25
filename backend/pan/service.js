const crypto = require("crypto");
const PanVerification = require("./PanVerification");
const { panProvider, panProviderProblem } = require("./provider");
const { normalizePan, panProblem, holderType } = require("./pan");

// PAN verification for Institutional applicants:
//   verify(email, pan)  -> checks the PAN with Cashfree; on success the institution name is the
//                          name registered with the Income Tax Department.
// Personal PANs (Individual / HUF) are refused, both by the PAN itself and by the type Cashfree reports.

class PanCheckError extends Error {
  constructor(message, status = 400, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Cashfree down or out of credits: the PAN is then typed by hand (no message to the applicant)
// and verification is not required. Cashfree is not asked again for DOWN_MS; a submission is
// accepted unverified for GRACE_MS after the last failure, so a form being filled is not refused.
const DOWN_MS = 5 * 60 * 1000;
const GRACE_MS = 60 * 60 * 1000;
let lastDownAt = 0;
function markDown(reason) {
  lastDownAt = Date.now();
  console.warn(`[PAN] Cashfree unavailable — PAN typed by hand: ${reason}`);
}
const isDown = () => Date.now() - lastDownAt < DOWN_MS;
const unavailable = () => new PanCheckError("PAN verification is not available right now.", 503, "PAN_UNAVAILABLE");

const enabled = () => !panProviderProblem();
const available = () => enabled() && !isDown();
// Must the Institutional applicant verify the PAN before submitting?
const required = () => enabled() && Date.now() - lastDownAt >= GRACE_MS;
const currentProvider = () => (panProvider() ? panProvider().name : "");

function publicResult(v) {
  return {
    verified: true,
    verificationId: v.verificationId,
    pan: v.pan,
    name: v.registeredName,
    panType: v.panType || holderType(v.pan),
    locked: ["pan", ...(v.registeredName ? ["name"] : [])],
  };
}

async function verify(email, rawPan) {
  const pan = normalizePan(rawPan);
  const problem = panProblem(pan);
  if (problem) throw new PanCheckError(problem);
  if (!enabled()) throw unavailable();

  // Already verified in the last 30 days (same applicant again, or another applicant from the
  // same institution): reuse it instead of paying Cashfree for the same PAN twice.
  // Only checks made by the provider now in use count: a fake "test" result is never reused
  // once real Cashfree checks are switched on.
  const earlier = await PanVerification.findOne({ pan, provider: currentProvider() }).sort({ verifiedAt: -1 });
  if (earlier) {
    const reused = await PanVerification.create({
      verificationId: crypto.randomBytes(12).toString("hex"),
      email,
      provider: earlier.provider,
      pan,
      registeredName: earlier.registeredName,
      panType: earlier.panType,
      panStatus: earlier.panStatus,
      verifiedAt: earlier.verifiedAt,
    });
    return publicResult(reused);
  }

  if (isDown()) throw unavailable();
  let r;
  try {
    r = await panProvider().verify(pan);
  } catch (err) {
    console.error("PAN verification failed:", err.message);
    markDown(err.message);
    throw unavailable();
  }
  if (!r.valid) throw new PanCheckError("This PAN could not be verified. Please check the number and try again.");
  // Cashfree's holder type, e.g. "Individual or Person", "HUF", "Body of Individuals (BOI)".
  // Only a type that *starts* with Individual / Person / HUF is personal — "Body of Individuals" is not.
  if (/^\s*(individual|person|huf\b|hindu undivided)/i.test(r.panType)) {
    throw new PanCheckError("This is a personal PAN. Please enter the PAN of the institution or organisation, not of a person.");
  }

  const v = await PanVerification.create({
    verificationId: crypto.randomBytes(12).toString("hex"),
    email,
    provider: panProvider().name,
    pan,
    registeredName: r.registeredName.replace(/\s+/g, " ").slice(0, 120),
    panType: r.panType || holderType(pan),
    panStatus: r.status,
  });
  return publicResult(v);
}

async function findVerified(email, verificationId) {
  if (!verificationId || typeof verificationId !== "string") return null;
  return PanVerification.findOne({ email, verificationId, provider: currentProvider() });
}

// The applicant's latest PAN check, to fill the form again after a refresh.
async function latestVerified(email) {
  if (!enabled()) return null;
  const v = await PanVerification.findOne({ email, provider: currentProvider() }).sort({ verifiedAt: -1 });
  return v ? publicResult(v) : null;
}

// On submission: the PAN and the institution name always come from the verified record.
function applyVerified(input, v) {
  input.pan = v.pan;
  if (v.registeredName) input.name = v.registeredName;
}

module.exports = { verify, findVerified, latestVerified, applyVerified, enabled, available, required, PanCheckError };
