const { MEMBERSHIP_TYPES, GENDERS, ID_PROOF_TYPES, PAYMENT_MODES } = require("../config/membership");
const { parseDateOnly, todayIST, ageOn } = require("../shared/dates");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PINCODE_RE = /^[1-9]\d{5}$/;
const MIN_AGE = 18;

const s = (v) => (v == null ? "" : String(v)).trim();
const yes = (v) => v === true || v === "true" || v === "Yes";

// Accepts 98765 43210, +91 9876543210, 09876543210 ... and returns the 10-digit number.
function normalizeMobile(v) {
  let digits = s(v).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function normalizeEmail(v) {
  return s(v).toLowerCase();
}

function isValidEmail(email) {
  return EMAIL_RE.test(email) && email.length <= 150;
}

function required(errors, key, value, message, max = 100) {
  if (!value) errors[key] = message;
  else if (value.length > max) errors[key] = `Must be at most ${max} characters.`;
}

function validatePayment(input, errors, { defaultDate, prefix = "payment" }) {
  const amount = Number(s(input.amount));
  if (s(input.amount) === "" || !Number.isFinite(amount) || amount < 0) {
    errors[`${prefix}.amount`] = "Enter the amount received.";
  }
  const mode = s(input.mode);
  if (!PAYMENT_MODES.includes(mode)) errors[`${prefix}.mode`] = "Select the payment mode.";
  const reference = s(input.reference);
  if (reference.length > 100) errors[`${prefix}.reference`] = "Must be at most 100 characters.";

  let date = defaultDate;
  if (s(input.date)) {
    date = parseDateOnly(input.date);
    if (!date) errors[`${prefix}.date`] = "Enter a valid date.";
    else if (date > todayIST()) errors[`${prefix}.date`] = "Payment date cannot be in the future.";
  }
  return { amount, mode, reference, date };
}

function validateWhatsapp(input, errors, data) {
  data.whatsapp = normalizeMobile(input.whatsapp);
  if (!/^[6-9]\d{9}$/.test(data.whatsapp)) errors.whatsapp = "Enter a valid 10-digit Indian mobile number.";
}

function validateAddress(input, errors, data) {
  const a = input.address || {};
  data.address = {
    line1: s(a.line1),
    line2: s(a.line2),
    city: s(a.city),
    state: s(a.state),
    pincode: s(a.pincode),
  };
  required(errors, "address.line1", data.address.line1, "Address line 1 is required.", 30);
  if (data.address.line2.length > 30) errors["address.line2"] = "Must be at most 30 characters.";
  required(errors, "address.city", data.address.city, "City is required.", 60);
  required(errors, "address.state", data.address.state, "Select state.", 60);
  if (!PINCODE_RE.test(data.address.pincode)) errors["address.pincode"] = "Enter a valid 6-digit PIN code.";
}

// Students are always affiliated. Course/semester for students, designation for others.
function validateAffiliation(input, type, errors, data) {
  const isStudent = type === "STUDENT";
  data.affiliated = isStudent || yes(input.affiliated);
  const af = input.affiliation || {};
  data.affiliation = { institution: "", department: "", designation: "", course: "", semester: "", state: "" };
  if (!data.affiliated) return;

  data.affiliation.institution = s(af.institution);
  required(errors, "affiliation.institution", data.affiliation.institution, "University / institution / organization is required.", 150);
  data.affiliation.department = s(af.department);
  required(errors, "affiliation.department", data.affiliation.department, "Department is required.");
  data.affiliation.state = s(af.state);
  required(errors, "affiliation.state", data.affiliation.state, "Select state.", 60);
  if (isStudent) {
    data.affiliation.course = s(af.course);
    required(errors, "affiliation.course", data.affiliation.course, "Course is required.");
    data.affiliation.semester = s(af.semester);
    required(errors, "affiliation.semester", data.affiliation.semester, "Semester is required.", 20);
  } else {
    data.affiliation.designation = s(af.designation);
    required(errors, "affiliation.designation", data.affiliation.designation, "Designation is required.");
  }
}

/**
 * Validates the full member form.
 *
 * mode "admin":  the admin's add/edit form (joining date and first payment on add).
 * mode "public": the website join form (joining date = today, no payment, terms must be accepted).
 *
 * files: newly uploaded files keyed by field; existing: the saved record when editing
 * (the membership type can't change on edit). Returns { data, errors } — errors is keyed
 * by field path, e.g. "address.pincode".
 */
function validateMember(input, { files = {}, existing = null, mode = "admin" } = {}) {
  const errors = {};
  const data = {};
  const isNew = !existing;

  const type = isNew ? s(input.membershipType) : existing.membershipType;
  if (!MEMBERSHIP_TYPES[type]) errors.membershipType = "Select a membership type.";
  data.membershipType = type;
  const isInstitution = type === "INSTITUTIONAL";
  const isStudent = type === "STUDENT";

  // Basic credentials
  data.name = s(input.name);
  required(errors, "name", data.name, isInstitution ? "Institution name is required." : "Name is required.", 120);

  data.email = normalizeEmail(input.email);
  if (!isValidEmail(data.email)) errors.email = "Enter a valid email address.";

  validateWhatsapp(input, errors, data);

  if (isInstitution) {
    data.contactPerson = s(input.contactPerson);
    required(errors, "contactPerson", data.contactPerson, "Name of the authorized contact person is required.");
    Object.assign(data, { motherName: "", fatherName: "", gender: "", dob: null });
  } else {
    data.contactPerson = "";
    data.motherName = s(input.motherName);
    required(errors, "motherName", data.motherName, "Mother's name is required.");
    data.fatherName = s(input.fatherName);
    required(errors, "fatherName", data.fatherName, "Father's name is required.");
    data.gender = s(input.gender);
    if (!GENDERS.includes(data.gender)) errors.gender = "Select gender.";
    data.dob = parseDateOnly(input.dob);
    if (!data.dob) errors.dob = "Enter a valid date of birth.";
    else if (ageOn(data.dob, todayIST()) < MIN_AGE) errors.dob = `Member must be at least ${MIN_AGE} years old.`;
  }

  validateAddress(input, errors, data);
  validateAffiliation(input, type, errors, data);

  // Documents
  data.idProofType = s(input.idProofType);
  if (!ID_PROOF_TYPES.includes(data.idProofType)) errors.idProofType = "Select the type of ID card.";

  const needed = ["photo", "signature", "idProof", ...(isStudent ? ["studentId"] : [])];
  for (const key of needed) {
    const hasExisting = existing && existing.documents && existing.documents[key] && existing.documents[key].filename;
    if (!files[key] && !hasExisting) errors[`documents.${key}`] = "This document is required.";
  }

  data.showInPublicList = yes(input.showInPublicList);

  if (mode === "public") {
    if (!yes(input.acceptTerms)) errors.acceptTerms = "Please read and accept the terms to continue.";
    return { data, errors };
  }

  data.remarks = s(input.remarks);
  if (data.remarks.length > 500) errors.remarks = "Must be at most 500 characters.";

  // Joining date and first payment are only set when the admin creates the member.
  if (isNew) {
    data.joinDate = todayIST();
    if (s(input.joinDate)) {
      data.joinDate = parseDateOnly(input.joinDate);
      if (!data.joinDate) errors.joinDate = "Enter a valid date.";
      else if (data.joinDate > todayIST()) errors.joinDate = "Date of joining cannot be in the future.";
    }
    data.payment = validatePayment(input.payment || {}, errors, { defaultDate: data.joinDate });
  }

  return { data, errors };
}

// What a member may change themselves from their account page.
// Name, email, date of birth, photo and documents can only be changed by the office.
function validateSelfUpdate(input, member) {
  const errors = {};
  const data = {};
  validateWhatsapp(input, errors, data);
  validateAddress(input, errors, data);
  validateAffiliation(input, member.membershipType, errors, data);
  data.showInPublicList = yes(input.showInPublicList);
  return { data, errors };
}

module.exports = {
  validateMember,
  validatePayment,
  validateSelfUpdate,
  normalizeEmail,
  isValidEmail,
};
