require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const { FRONTEND_URL } = require("./config/membership");
const authRoutes = require("./auth/auth.routes");
const memberRoutes = require("./members/members.routes");
const publicRoutes = require("./public/public.routes");
const joinRoutes = require("./join/join.routes");
const accountRoutes = require("./account/account.routes");
const adminRoutes = require("./admin/admin.routes");
const webhookRoutes = require("./payments/webhook.routes");
const { paymentsProblem } = require("./payments/provider");
const { digilockerProblem } = require("./digilocker/provider");
const { EMAIL_LOG_ONLY } = require("./mail/mailer");
const { startExpiryJob } = require("./expiry/expiry.job");
const { loadFees } = require("./settings/fees");

const app = express();
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // Zoho Payments checkout widget: its script, payment window (frame) and API calls.
        "script-src": ["'self'", "https://static.zohocdn.com", "https://*.zohocdn.com"],
        "img-src": ["'self'", "data:", "blob:", "https://*.zohocdn.com", "https://*.zoho.in"],
        "frame-src": ["'self'", "blob:", "https://*.zoho.in", "https://*.zohocdn.com"],
        "connect-src": ["'self'", "https://*.zoho.in", "https://*.zohocdn.com"],
        // On when the site is served over HTTPS (FRONTEND_URL starts with https://), off locally.
        "upgrade-insecure-requests": FRONTEND_URL.startsWith("https://") ? [] : null,
      },
    },
  })
);
app.use(cors({ origin: FRONTEND_URL }));

// Webhooks need the raw body for signature checks, so they come before express.json.
app.use("/api/payments/webhook", webhookRoutes);

app.use(express.json({ limit: "100kb" }));

app.use(
  "/api/public",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }),
  publicRoutes
);
app.use("/api/join", joinRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", (req, res) => res.status(404).json({ message: "Not found." }));

// In production, serve the built React app from the same server.
const dist = path.resolve(__dirname, "../frontend/dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

// Error handler (Express 5 forwards errors from async routes here).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "Each file must be 5 MB or smaller." : `Upload error: ${err.message}`;
    return res.status(400).json({ message });
  }
  // Errors meant for the user (wrong code, payments switched off ...).
  if (err.expose && err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err.status === 400 || err.type === "entity.parse.failed") {
    return res.status(400).json({ message: err.message || "Bad request." });
  }
  console.error(err);
  res.status(500).json({ message: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 5002;
// Set HOST=127.0.0.1 on a server behind nginx so the port is not reachable from outside.
const HOST = process.env.HOST || undefined;

connectDB()
  .then(loadFees) // fees set by the admin replace the ones in config/membership.js
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`Membership API running on http://localhost:${PORT}`);
      console.log(`Online payments: ${paymentsProblem() || `on (${process.env.PAYMENT_PROVIDER})`}`);
      console.log(`DigiLocker: ${digilockerProblem() || `on (${process.env.DIGILOCKER_PROVIDER}, ${process.env.CASHFREE_VERIFY_ENV || "sandbox"})`}`);
      console.log(`Website address: ${FRONTEND_URL}`);
      if (EMAIL_LOG_ONLY) console.log("Emails: log mode — emails are printed here, not sent.");
    });
    startExpiryJob();
  })
  .catch((err) => {
    console.error("Could not start:", err.message);
    process.exit(1);
  });
