const Counter = require("./Counter");
const { ORG_CODE } = require("../config/membership");

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

// ORG-2026-000123: org code, year of joining, running number.
async function nextMembershipId(joinDate) {
  const seq = await nextSeq("membership");
  const year = (joinDate || new Date()).getUTCFullYear();
  return `${ORG_CODE}-${year}-${pad(seq)}`;
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

module.exports = { nextMembershipId, nextReceiptNo, nextOrderNo };
