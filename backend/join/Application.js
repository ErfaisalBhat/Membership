const mongoose = require("mongoose");
const { personFields } = require("../members/memberFields");

// An online sign-up. It stays PENDING until the payment is confirmed; then a Member
// is created from it and it becomes PAID. Only one PENDING application per email.
const applicationSchema = new mongoose.Schema(
  {
    ...personFields,
    email: { ...personFields.email, index: true },
    status: { type: String, enum: ["PENDING", "PAID", "CANCELLED"], default: "PENDING", index: true },
    termsAcceptedAt: { type: Date, required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", default: null },
    cancelReason: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", applicationSchema);
