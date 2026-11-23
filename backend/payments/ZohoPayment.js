const mongoose = require("mongoose");

// A payment Zoho reported through the webhook (payments made on the Zoho payment page).
// Used to check the payment ID an applicant enters on the join page.
const zohoPaymentSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true },
    status: { type: String, default: "" }, // succeeded, failed ...
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    email: { type: String, default: "", lowercase: true, trim: true },
    name: { type: String, default: "" },
    method: { type: String, default: "" },
    liveMode: { type: Boolean, default: true },
    paidAt: { type: Date, default: null },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    raw: { type: Object, default: {} }, // the payment object as Zoho sent it
  },
  { timestamps: true }
);

module.exports = mongoose.model("ZohoPayment", zohoPaymentSchema);
