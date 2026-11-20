const crypto = require("crypto");
const EmailCode = require("./EmailCode");

const CODE_MINUTES = 10; // a code works for 10 minutes
const RESEND_SECONDS = 60; // wait this long before asking for another code
const MAX_PER_HOUR = 5; // codes per email address per hour
const MAX_ATTEMPTS = 5; // wrong guesses allowed per code

class OtpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

const hashCode = (email, purpose, code) =>
  crypto.createHash("sha256").update(`${purpose}:${email}:${code}`).digest("hex");

// Creates a new 6-digit code and returns it (the caller emails it).
async function createCode(email, purpose) {
  const now = Date.now();
  const recent = await EmailCode.find({ email, purpose, createdAt: { $gt: new Date(now - 3600 * 1000) } })
    .sort({ createdAt: -1 })
    .lean();
  if (recent[0] && now - recent[0].createdAt.getTime() < RESEND_SECONDS * 1000) {
    throw new OtpError("A code was sent less than a minute ago. Please check your inbox, or try again in a minute.", 429);
  }
  if (recent.length >= MAX_PER_HOUR) {
    throw new OtpError("Too many codes requested for this email. Please try again in an hour.", 429);
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await EmailCode.create({
    email,
    purpose,
    codeHash: hashCode(email, purpose, code),
    expiresAt: new Date(now + CODE_MINUTES * 60 * 1000),
    deleteAt: new Date(now + 3600 * 1000),
  });
  return code;
}

// Throws OtpError if the code is wrong or expired. Each code works once.
async function checkCode(email, purpose, code) {
  const clean = String(code || "").replace(/\D/g, "");
  if (clean.length !== 6) throw new OtpError("Enter the 6-digit code from the email.");

  const record = await EmailCode.findOne({ email, purpose, used: false }).sort({ createdAt: -1 });
  if (!record || record.expiresAt < new Date()) {
    throw new OtpError("This code has expired. Please ask for a new code.");
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    throw new OtpError("Too many wrong attempts. Please ask for a new code.");
  }

  const expected = Buffer.from(record.codeHash, "hex");
  const given = Buffer.from(hashCode(email, purpose, clean), "hex");
  if (!crypto.timingSafeEqual(expected, given)) {
    record.attempts += 1;
    await record.save();
    const left = MAX_ATTEMPTS - record.attempts;
    throw new OtpError(left > 0 ? `Incorrect code. ${left} attempt(s) left.` : "Too many wrong attempts. Please ask for a new code.");
  }
  record.used = true;
  await record.save();
}

module.exports = { createCode, checkCode, OtpError, CODE_MINUTES };
