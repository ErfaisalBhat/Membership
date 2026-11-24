const mongoose = require("mongoose");

// Settings the admin can change from the admin panel, one document per key
// (e.g. "fees"). Values not saved here fall back to backend/config/membership.js.
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: String, default: "" },
  },
  { versionKey: false, minimize: false }
);

module.exports = mongoose.model("Setting", settingSchema);
