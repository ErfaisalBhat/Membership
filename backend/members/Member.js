const crypto = require("crypto");
const mongoose = require("mongoose");
const { STATUSES } = require("../config/membership");
const { personFields } = require("./memberFields");

const paymentSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["NEW", "RENEWAL"], required: true },
    amount: { type: Number, required: true },
    mode: { type: String, required: true }, // UPI, Cash ... or "Online"
    reference: { type: String, default: "" },
    date: { type: Date, required: true },
    periodFrom: Date,
    periodTo: Date, // null for Life
    receiptNo: { type: String, default: "" }, // empty for ₹0 (waived) payments
    source: { type: String, enum: ["OFFLINE", "ONLINE"], default: "OFFLINE" },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentOrder", default: null },
  },
  { timestamps: true }
);

const memberSchema = new mongoose.Schema(
  {
    ...personFields,
    email: { ...personFields.email, unique: true },

    membershipId: { type: String, required: true, unique: true },
    status: { type: String, enum: STATUSES, default: "ACTIVE", index: true },
    statusReason: { type: String, default: "" },

    // ADMIN = registered by the admin; ONLINE = joined and paid on the website.
    source: { type: String, enum: ["ADMIN", "ONLINE"], default: "ADMIN" },

    joinDate: { type: Date, required: true },
    expiryDate: { type: Date, default: null, index: true }, // null = never expires
    payments: [paymentSchema],

    remarks: { type: String, default: "" },

    // Random token used in the ID card QR code, so the verify link can't be guessed.
    verifyToken: {
      type: String,
      unique: true,
      default: () => crypto.randomBytes(16).toString("hex"),
    },
    // Keys like "2027-03-31:30" so each reminder is sent once per expiry date.
    remindersSent: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Member", memberSchema);
