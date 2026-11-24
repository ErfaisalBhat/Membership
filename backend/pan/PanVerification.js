const mongoose = require("mongoose");

// One successful PAN check by an Institutional applicant. The join form sends back its
// verificationId; the PAN and institution name are then taken from here, never from the
// browser. Records are deleted after 30 days.
const panVerificationSchema = new mongoose.Schema(
  {
    verificationId: { type: String, required: true, unique: true },
    email: { type: String, required: true, index: true },
    provider: { type: String, required: true },
    pan: { type: String, required: true },
    registeredName: { type: String, default: "" },
    panType: { type: String, default: "" }, // as reported, e.g. "Body of Individuals (BOI)"
    panStatus: { type: String, default: "" }, // e.g. VALID
    verifiedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now, expires: 30 * 24 * 3600 },
  },
  { versionKey: false }
);

module.exports = mongoose.model("PanVerification", panVerificationSchema);
