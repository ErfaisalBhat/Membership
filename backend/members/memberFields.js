const mongoose = require("mongoose");
const { MEMBERSHIP_TYPES } = require("../config/membership");

// The applicant's details, shared by Member (registered members) and
// Application (online sign-ups waiting for payment), so one can be copied into the other.

const fileSchema = new mongoose.Schema(
  {
    filename: String, // random name on disk
    originalName: String,
    mimeType: String,
    size: Number,
  },
  { _id: false }
);

const personFields = {
  membershipType: { type: String, enum: Object.keys(MEMBERSHIP_TYPES), required: true },

  // Basic credentials
  name: { type: String, required: true, trim: true }, // institution name for Institutional
  contactPerson: { type: String, default: "" }, // Institutional only
  email: { type: String, required: true, lowercase: true, trim: true },
  whatsapp: { type: String, required: true },
  motherName: { type: String, default: "" },
  fatherName: { type: String, default: "" },
  gender: { type: String, default: "" },
  dob: { type: Date, default: null },

  address: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
  },

  affiliated: { type: Boolean, default: false },
  affiliation: {
    institution: String,
    department: String,
    designation: String,
    state: String,
  },

  idProofType: { type: String, default: "" },
  documents: {
    photo: fileSchema,
    signature: fileSchema,
    idProof: fileSchema,
  },

  showInPublicList: { type: Boolean, default: false },

  // Identity checked against Aadhaar through DigiLocker on the join form.
  // Only the last 4 digits of the Aadhaar number are ever stored.
  aadhaar: {
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    last4: { type: String, default: "" },
    verificationId: { type: String, default: "" },
    provider: { type: String, default: "" },
  },
};

// Field names copied from an Application to a new Member.
const PERSON_KEYS = Object.keys(personFields);

module.exports = { personFields, PERSON_KEYS, fileSchema };
