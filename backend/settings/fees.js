const Setting = require("./Setting");
const { MEMBERSHIP_TYPES } = require("../config/membership");

// Plan fees the admin sets in the admin panel (Fees page). They are saved in the database and
// written into MEMBERSHIP_TYPES, so every part of the site (plans, join form, payments, renewals,
// emails) uses them at once. Without a saved value, the fees in config/membership.js apply.
//
// fee:        what the member pays
// regularFee: the price before the waiver, shown struck out on the plans (same as fee = no waiver)

const KEY = "fees";
const MAX_FEE = 1000000;

function apply(saved) {
  for (const [type, t] of Object.entries(MEMBERSHIP_TYPES)) {
    const v = saved && saved[type];
    if (!v) continue;
    if (Number.isInteger(v.fee)) t.fee = v.fee;
    if (Number.isInteger(v.regularFee)) t.regularFee = v.regularFee;
  }
}

// Called once at start-up, after the database is connected.
async function loadFees() {
  const doc = await Setting.findOne({ key: KEY }).lean();
  if (doc) apply(doc.value);
}

function currentFees() {
  return Object.entries(MEMBERSHIP_TYPES).map(([key, t]) => ({ key, label: t.label, fee: t.fee, regularFee: t.regularFee }));
}

const toAmount = (v) => (v === "" || v == null ? NaN : Number(v));

// input: { ANNUAL: { fee, regularFee }, ... } -> { errors } or { fees }
async function saveFees(input, adminEmail = "") {
  const errors = {};
  const value = {};
  for (const [type, t] of Object.entries(MEMBERSHIP_TYPES)) {
    const v = (input && input[type]) || {};
    const fee = toAmount(v.fee);
    // Empty "before waiver" price = no waiver.
    const regularFee = v.regularFee === "" || v.regularFee == null ? fee : toAmount(v.regularFee);
    if (!Number.isInteger(fee) || fee < 1 || fee > MAX_FEE) errors[`${type}.fee`] = `Enter the ${t.shortLabel} fee in whole rupees.`;
    else if (!Number.isInteger(regularFee) || regularFee < fee || regularFee > MAX_FEE) {
      errors[`${type}.regularFee`] = "The price before the waiver must be a whole number, at least the fee.";
    }
    value[type] = { fee, regularFee };
  }
  if (Object.keys(errors).length) return { errors };
  await Setting.findOneAndUpdate(
    { key: KEY },
    { $set: { value, updatedAt: new Date(), updatedBy: adminEmail } },
    { upsert: true }
  );
  apply(value);
  return { fees: currentFees() };
}

module.exports = { loadFees, saveFees, currentFees };
