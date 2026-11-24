const mongoose = require("mongoose");

// One attempt to collect money online (a new membership or a renewal).
//
//   CREATED   -> checkout started, waiting for the payment gateway
//   PAID      -> gateway confirmed the payment; membership activated / extended
//   FAILED    -> gateway said the payment failed, or it was abandoned
const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true, unique: true }, // e.g. ASSSR-ORD-000042
    purpose: { type: String, enum: ["NEW", "RENEWAL"], required: true },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null, index: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", default: null, index: true },

    // Copied at creation so the payments list reads well without joins.
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    membershipType: { type: String, default: "" },

    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["CREATED", "PAID", "FAILED"], default: "CREATED", index: true },

    provider: { type: String, default: "" }, // "zoho", "test" ...
    providerSessionId: { type: String, default: "", index: true },
    providerPaymentId: { type: String, default: "", index: true },
    paymentMethod: { type: String, default: "" }, // upi, card ... if the gateway says
    failureReason: { type: String, default: "" },
    paidAt: { type: Date, default: null },
    receiptNo: { type: String, default: "" },

    // Filled when the payment is applied.
    periodFrom: Date,
    periodTo: Date,
    previousExpiry: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentOrder", orderSchema);
