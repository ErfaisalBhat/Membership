const crypto = require("crypto");
const DigilockerVerification = require("./DigilockerVerification");
const { digilockerProvider, digilockerProblem } = require("./provider");
const { DigilockerError, MESSAGES } = require("./errors");
const { mapAadhaar } = require("./aadhaar");
const health = require("./health");
const { FRONTEND_URL, ORG_CODE } = require("../config/membership");

// Aadhaar auto-fill for the join form:
//   start()    -> URL of the DigiLocker consent page; DigiLocker sends the student back to
//                 /join?type=STUDENT&dl=<verificationId>
//   complete() -> asks Cashfree for the Aadhaar details and returns them to fill the form
// Whatever goes wrong, the student is told why and fills the form by hand instead.

// Fields the student cannot change after DigiLocker filled them (when DigiLocker gave a value).
const LOCKED = ["name", "dob", "gender", "fatherName"];

function publicResult(v) {
  const a = v.aadhaar || {};
  return {
    verified: true,
    verificationId: v.verificationId,
    last4: a.last4 || "",
    prefill: { name: a.name, dob: a.dob, gender: a.gender, fatherName: a.fatherName, address: a.address },
    locked: LOCKED.filter((k) => a[k]),
  };
}

async function start(email, membershipType) {
  if (digilockerProblem()) throw new DigilockerError("UNAVAILABLE", digilockerProblem());
  const provider = digilockerProvider();
  const verificationId = `${ORG_CODE}-${crypto.randomBytes(10).toString("hex")}`.slice(0, 50);
  const record = await DigilockerVerification.create({ verificationId, email, provider: provider.name });
  const redirectUrl = `${FRONTEND_URL}/join?type=${encodeURIComponent(membershipType)}&dl=${encodeURIComponent(verificationId)}`;
  try {
    const { url } = await provider.createUrl({
      verificationId,
      redirectUrl,
      purpose: "Membership application",
      companyName: ORG_CODE,
    });
    return { url };
  } catch (err) {
    record.status = "FAILED";
    record.failureKind = err.kind || "UNAVAILABLE";
    record.failureDetail = String(err.message).slice(0, 300);
    await record.save();
    console.error(`[DIGILOCKER] start failed for ${verificationId}:`, err.message);
    if (record.failureKind === "UNAVAILABLE") health.markDown(err.message);
    throw err instanceof DigilockerError ? err : new DigilockerError("UNAVAILABLE", err.message);
  }
}

// Returns { verified: true, ... } or { verified: false, kind, message }. Never throws for
// DigiLocker problems, so the join page can always fall back to the manual form.
async function complete(email, verificationId) {
  const record = await DigilockerVerification.findOne({ verificationId: String(verificationId || ""), email });
  if (!record) return { verified: false, kind: "EXPIRED", message: "This DigiLocker verification was not found or has expired." };
  if (record.status === "VERIFIED") return publicResult(record);

  const provider = digilockerProvider();
  try {
    if (!provider || provider.name !== record.provider) throw new DigilockerError("UNAVAILABLE", "Provider changed or switched off");
    const doc = await provider.fetchAadhaar(record.verificationId);
    const mapped = mapAadhaar(doc);
    if (!mapped.name) throw new DigilockerError("UNAVAILABLE", "Aadhaar document had no name");
    record.status = "VERIFIED";
    record.verifiedAt = new Date();
    record.failureKind = "";
    record.failureDetail = "";
    record.aadhaar = mapped;
    await record.save();
    return publicResult(record);
  } catch (err) {
    const kind = err instanceof DigilockerError ? err.kind : "UNAVAILABLE";
    record.status = "FAILED";
    record.failureKind = kind;
    record.failureDetail = String(err.message).slice(0, 300);
    await record.save();
    console.error(`[DIGILOCKER] complete failed for ${record.verificationId} (${kind}):`, err.message);
    return { verified: false, kind, message: MESSAGES[kind] || MESSAGES.UNAVAILABLE };
  }
}

// For the form submission: this applicant's verified record (the given one, else their
// latest), or null. Once a student is verified, their Aadhaar details are always used.
async function findVerified(email, verificationId) {
  if (verificationId) {
    const v = await DigilockerVerification.findOne({ verificationId: String(verificationId), email, status: "VERIFIED" });
    if (v) return v;
  }
  return DigilockerVerification.findOne({ email, status: "VERIFIED" }).sort({ verifiedAt: -1 });
}

// The applicant's latest successful verification, to fill the form again after a refresh,
// a closed tab or a new email login — so they are never asked to use DigiLocker twice.
async function latestVerified(email) {
  const v = await DigilockerVerification.findOne({ email, status: "VERIFIED" }).sort({ verifiedAt: -1 });
  return v ? publicResult(v) : null;
}

module.exports = { start, complete, findVerified, latestVerified, LOCKED };
