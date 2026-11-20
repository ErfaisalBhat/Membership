const mongoose = require("mongoose");

// One-time codes emailed to applicants (JOIN) and members (LOGIN).
// Only a hash of the code is stored. MongoDB deletes the record after `deleteAt`.
const emailCodeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: ["JOIN", "LOGIN"], required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false },
    deleteAt: { type: Date, required: true },
  },
  { timestamps: true }
);

emailCodeSchema.index({ email: 1, purpose: 1, createdAt: -1 });
emailCodeSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("EmailCode", emailCodeSchema);
