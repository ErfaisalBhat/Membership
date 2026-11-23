const mongoose = require("mongoose");
const { personFields } = require("../members/memberFields");

// An online sign-up. The applicant pays first (plan -> verify email -> pay), then fills
// in their details; the application then waits for the admin. Statuses:
//   PENDING   submitted (already paid, see paymentOrderId), waiting for the admin to review it
//   APPROVED  older flow only: approved by the admin, waiting for the applicant to pay
//   PAID      approved and registered; a Member was created from it (memberId)
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
    // The online payment made before the details were filled (pay-first flow).
    paymentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentOrder", default: null },
    cancelReason: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "" },
  },
  { timestamps: true }
);

const Application = mongoose.model("Application", applicationSchema);
Application.OPEN_STATUSES = OPEN_STATUSES;
module.exports = Application;
