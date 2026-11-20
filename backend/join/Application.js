const mongoose = require("mongoose");
const { personFields } = require("../members/memberFields");

// An online sign-up. Statuses:
//   PENDING   submitted, waiting for the admin to review it
//   APPROVED  approved by the admin, waiting for the applicant to pay
//   PAID      paid; a Member was created from it (memberId)
//   REJECTED  refused by the admin (reviewNote holds the reason sent to the applicant)
//   CANCELLED withdrawn, replaced by a new application, or never paid
// Only one open (PENDING or APPROVED) application per email.
const OPEN_STATUSES = ["PENDING", "APPROVED"];

const applicationSchema = new mongoose.Schema(
  {
    ...personFields,
    email: { ...personFields.email, index: true },
    status: { type: String, enum: ["PENDING", "APPROVED", "PAID", "REJECTED", "CANCELLED"], default: "PENDING", index: true },
    termsAcceptedAt: { type: Date, required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", default: null },
    cancelReason: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "" },
  },
  { timestamps: true }
);

const Application = mongoose.model("Application", applicationSchema);
Application.OPEN_STATUSES = OPEN_STATUSES;
module.exports = Application;
