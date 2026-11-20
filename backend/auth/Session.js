const mongoose = require("mongoose");

// Logins for members (kind MEMBER, subject = member id) and verified applicants
// (kind JOIN, subject = verified email). The admin login is stored on the Admin record instead.
// Only a SHA-256 hash of the token is stored. MongoDB deletes expired sessions.
const sessionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["MEMBER", "JOIN"], required: true },
    subject: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Session", sessionSchema);
