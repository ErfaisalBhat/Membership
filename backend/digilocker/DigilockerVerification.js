const mongoose = require("mongoose");

// One DigiLocker attempt by an applicant. A successful one is reused whenever the same
// email fills the join form again (refresh, closed tab, new application), so the student
// is never asked twice. Records are deleted after 30 days.
const verificationSchema = new mongoose.Schema(
  {
    verificationId: { type: String, required: true, unique: true },
    email: { type: String, required: true, index: true },
    provider: { type: String, required: true },
    status: { type: String, enum: ["STARTED", "VERIFIED", "FAILED"], default: "STARTED" },
    failureKind: { type: String, default: "" },
    failureDetail: { type: String, default: "" },
    verifiedAt: { type: Date, default: null },
    aadhaar: {
      name: String,
      dob: String, // YYYY-MM-DD
      gender: String,
      fatherName: String,
      address: { line1: String, line2: String, city: String, state: String, pincode: String },
      last4: String,
    },
    createdAt: { type: Date, default: Date.now, expires: 30 * 24 * 3600 },
  },
  { versionKey: false }
);

module.exports = mongoose.model("DigilockerVerification", verificationSchema);
