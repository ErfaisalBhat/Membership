const crypto = require("crypto");
const Session = require("./Session");
const Member = require("../members/Member");
const { hashToken, bearerToken } = require("./requireAdmin");

const MEMBER_SESSION_HOURS = 24;
const JOIN_SESSION_HOURS = 24;

async function createSession(kind, subject, hours) {
  const token = crypto.randomBytes(32).toString("hex");
  await Session.create({
    kind,
    subject: String(subject),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + hours * 3600 * 1000),
  });
  return token;
}

async function findSession(kind, token) {
  if (!token) return null;
  return Session.findOne({ kind, tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
}

async function endSession(token) {
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
}

// Member account pages: "Authorization: Bearer <token>" from the member login.
async function requireMember(req, res, next) {
  const session = await findSession("MEMBER", bearerToken(req));
  const member = session && (await Member.findById(session.subject));
  if (!member) return res.status(401).json({ message: "Your session has expired. Please log in again." });
  req.member = member;
  req.sessionToken = bearerToken(req);
  next();
}

// Join pages: "X-Join-Token: <token>" given after the applicant verifies their email.
async function requireJoin(req, res, next) {
  const token = String(req.headers["x-join-token"] || "");
  const session = await findSession("JOIN", token);
  if (!session) {
    return res.status(401).json({ message: "Your email verification has expired. Please verify your email again.", code: "JOIN_EXPIRED" });
  }
  req.joinEmail = session.subject;
  next();
}

module.exports = {
  createSession,
  findSession,
  endSession,
  requireMember,
  requireJoin,
  MEMBER_SESSION_HOURS,
  JOIN_SESSION_HOURS,
};
