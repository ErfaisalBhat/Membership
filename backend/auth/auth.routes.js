const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const Admin = require("./Admin");
const { requireAdmin, hashToken, SESSION_HOURS } = require("./requireAdmin");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
});

const MAX_FAILED_LOGINS = 5; // wrong passwords in a row before the account is locked
const LOCK_MINUTES = 15;

// Used to make "unknown user" take as long as "wrong password".
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  const username = String((req.body && req.body.username) || "").trim().toLowerCase();
  const password = String((req.body && req.body.password) || "");
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required." });
  }

  const admin = await Admin.findOne({ username });
  if (admin && admin.lockedUntil && admin.lockedUntil > new Date()) {
    return res.status(429).json({ message: "Too many failed login attempts. Please try again in 15 minutes." });
  }
  const ok = await bcrypt.compare(password, admin ? admin.passwordHash : DUMMY_HASH);
  if (admin && !ok) {
    admin.failedLogins = (admin.failedLogins || 0) + 1;
    if (admin.failedLogins >= MAX_FAILED_LOGINS) {
      admin.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      admin.failedLogins = 0;
      console.warn(`[AUTH] Admin "${admin.username}" locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED_LOGINS} failed logins.`);
    }
    await admin.save();
  }
  if (!admin || !ok) return res.status(401).json({ message: "Invalid username or password." });

  // New login replaces any previous session.
  admin.failedLogins = 0;
  admin.lockedUntil = null;
  const token = crypto.randomBytes(32).toString("hex");
  admin.sessionTokenHash = hashToken(token);
  admin.sessionExpiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await admin.save();

  res.json({ token, username: admin.username, expiresAt: admin.sessionExpiresAt });
});

// GET /api/auth/me
router.get("/me", requireAdmin, (req, res) => {
  res.json({ username: req.admin.username, expiresAt: req.admin.sessionExpiresAt });
});

// POST /api/auth/logout
router.post("/logout", requireAdmin, async (req, res) => {
  req.admin.sessionTokenHash = null;
  req.admin.sessionExpiresAt = null;
  await req.admin.save();
  res.json({ message: "Logged out." });
});

// POST /api/auth/change-password
router.post("/change-password", requireAdmin, async (req, res) => {
  const currentPassword = String((req.body && req.body.currentPassword) || "");
  const newPassword = String((req.body && req.body.newPassword) || "");
  if (!(await bcrypt.compare(currentPassword, req.admin.passwordHash))) {
    return res.status(400).json({ message: "Current password is incorrect." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: "New password must be at least 8 characters." });
  }
  req.admin.passwordHash = await bcrypt.hash(newPassword, 12);
  await req.admin.save();
  res.json({ message: "Password changed." });
});

module.exports = router;
