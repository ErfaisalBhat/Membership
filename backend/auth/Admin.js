const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    // Only a SHA-256 hash of the session token is stored. One session at a time.
    sessionTokenHash: { type: String, default: null },
    sessionExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema);
