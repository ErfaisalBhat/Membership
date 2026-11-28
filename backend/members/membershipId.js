const Counter = require("./Counter");
const Member = require("./Member");
const { ORG_CODE, MEMBERSHIP_TYPES } = require("../config/membership");

// Atomic +1 on a named counter. Two saves at the same moment can never get the same number.
async function nextSeq(name) {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true }
  );
  return counter.seq;
}

const pad = (n) => String(n).padStart(6, "0");

// The plan's prefix (config/membership.js) and one running number shared by all plans
// (counter "member-no"), so no two members have the same number: HM00001, AM00002, LM00003 …
// Members registered before this kept their old ID (ORG-2026-000123).
// The admin can also type an ID by hand; a number already taken that way is skipped.
async function nextMembershipId(membershipType) {
  const type = MEMBERSHIP_TYPES[membershipType];
  if (!type || !type.idPrefix) throw new Error(`No ID prefix for membership type ${membershipType}`);
  for (;;) {
    const id = `${type.idPrefix}${String(await nextSeq("member-no")).padStart(5, "0")}`;
    if (!(await Member.exists({ membershipId: id }))) return id;
  }
}

// An ID the admin types: spaces dropped, capital letters. Letters, digits, "-" and "/" only.
const MEMBERSHIP_ID_RE = /^[A-Z0-9][A-Z0-9/-]{0,29}$/;
function normalizeMembershipId(v) {
  return String(v == null ? "" : v).replace(/\s+/g, "").toUpperCase();
}
function membershipIdProblem(id) {
  return MEMBERSHIP_ID_RE.test(id) ? "" : 'Use letters, numbers, "-" or "/" only (at most 30).';
}

// ORG/R/2026/000045 — printed on payment receipts.
async function nextReceiptNo(date) {
  const seq = await nextSeq("receipt");
  const year = (date || new Date()).getUTCFullYear();
  return `${ORG_CODE}/R/${year}/${pad(seq)}`;
}

// ORG-ORD-000123 — sent to the payment gateway as the invoice/reference number.
async function nextOrderNo() {
  return `${ORG_CODE}-ORD-${pad(await nextSeq("order"))}`;
}

module.exports = { nextMembershipId, normalizeMembershipId, membershipIdProblem, nextReceiptNo, nextOrderNo };
