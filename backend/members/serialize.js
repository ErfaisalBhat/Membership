const { MEMBERSHIP_TYPES } = require("../config/membership");
const { todayIST } = require("../shared/dates");

// The nightly job flips ACTIVE -> EXPIRED; this covers the gap until it runs.
function effectiveStatus(member) {
  if (member.status === "ACTIVE" && member.expiryDate && new Date(member.expiryDate) < todayIST()) return "EXPIRED";
  return member.status;
}

function typeLabel(type) {
  return MEMBERSHIP_TYPES[type] ? MEMBERSHIP_TYPES[type].label : type;
}

// Document info without the on-disk file names.
function documentInfo(documents) {
  const docs = {};
  for (const [key, f] of Object.entries(documents || {})) {
    docs[key] = f && f.filename ? { originalName: f.originalName, mimeType: f.mimeType, size: f.size } : null;
  }
  return docs;
}

const toObject = (doc) => (typeof doc.toObject === "function" ? doc.toObject({ versionKey: false }) : { ...doc });

// Full record for the admin.
function serializeMember(member) {
  const o = toObject(member);
  delete o.remindersSent;
  o.documents = documentInfo(o.documents);
  o.status = effectiveStatus(o);
  o.typeLabel = typeLabel(o.membershipType);
  return o;
}

// What a member sees on their own account page. No internal remarks or tokens.
function serializeOwnMember(member) {
  const o = serializeMember(member);
  delete o.remarks;
  delete o.verifyToken;
  delete o.source;
  o.payments = (o.payments || []).map((p) => ({
    _id: p._id,
    kind: p.kind,
    amount: p.amount,
    mode: p.mode,
    reference: p.reference,
    date: p.date,
    periodFrom: p.periodFrom,
    periodTo: p.periodTo,
    receiptNo: p.receiptNo,
    refunded: p.refunded,
  }));
  return o;
}

// Row for the admin members table.
function serializeRow(m) {
  return {
    _id: m._id,
    membershipId: m.membershipId,
    name: m.name,
    email: m.email,
    whatsapp: m.whatsapp,
    membershipType: m.membershipType,
    typeLabel: typeLabel(m.membershipType),
    status: effectiveStatus(m),
    source: m.source || "ADMIN",
    joinDate: m.joinDate,
    expiryDate: m.expiryDate,
    showInPublicList: m.showInPublicList,
  };
}

// Row for the public members list — no contact details.
function serializePublicRow(m) {
  return {
    name: m.name,
    membershipId: m.membershipId,
    membershipType: m.membershipType,
    typeLabel: typeLabel(m.membershipType),
    status: effectiveStatus(m),
    joinDate: m.joinDate,
  };
}

// An online application, for the applicant or the admin.
function serializeApplication(a, { full = false } = {}) {
  const o = toObject(a);
  const type = MEMBERSHIP_TYPES[o.membershipType];
  const base = {
    _id: o._id,
    status: o.status,
    membershipType: o.membershipType,
    typeLabel: typeLabel(o.membershipType),
    amount: type ? type.fee : null,
    name: o.name,
    email: o.email,
    whatsapp: o.whatsapp,
    createdAt: o.createdAt,
    memberId: o.memberId,
    cancelReason: o.cancelReason || "",
    reviewedAt: o.reviewedAt || null,
    reviewNote: o.reviewNote || "",
    aadhaarVerified: !!(o.aadhaar && o.aadhaar.verified),
  };
  if (!full) return base;
  return { ...o, ...base, documents: documentInfo(o.documents) };
}

module.exports = {
  serializeMember,
  serializeOwnMember,
  serializeRow,
  serializePublicRow,
  serializeApplication,
  effectiveStatus,
  typeLabel,
};
