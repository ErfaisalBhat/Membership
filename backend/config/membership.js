// Membership settings. Change labels or validity here — the admin form,
// the public join page, ID cards, emails and the expiry job all read from this file.
//
// fee:          what the member pays (after the waiver in the membership form)
// regularFee:   the fee before the waiver, shown struck out on the plans
// validityMonths: null means the membership never expires (Life, Emeritus).
// adminOnly:    conferred by the Society, not applied for. Only the admin can add these members
//               (Add member); they are not on the website's plans, join form or Fees page, have
//               no fee and are not renewed online. The admin extends them with "Renew".
//
// The fees below are only the starting values: the admin changes them on the Fees page of the
// admin panel (saved in the database, see settings/fees.js), which then take their place.
// The ID card shows each plan's Hindi name from idcard/assets/plan-<KEY>.png.

// idPrefix:     start of the membership ID, followed by one running number shared by all plans:
//               HM00001, AM00002, LM00003 …
const MEMBERSHIP_TYPES = {
  ANNUAL: { label: "Annual Member", shortLabel: "Annual", idPrefix: "AM", fee: 2000, regularFee: 3000, validityMonths: 12 },
  LIFE: { label: "Life Member", shortLabel: "Life", idPrefix: "LM", fee: 4500, regularFee: 5000, validityMonths: null },
  INSTITUTIONAL: { label: "Institutional Member", shortLabel: "Institutional", idPrefix: "IM", fee: 7000, regularFee: 10000, validityMonths: 12 },
  // Temporary: for a fixed term, which the admin can extend.
  HONORARY: { label: "Honorary Member", shortLabel: "Honorary", idPrefix: "HM", fee: 0, regularFee: 0, validityMonths: 12, adminOnly: true },
  // Lifetime: never expires.
  EMERITUS: { label: "Emeritus Member", shortLabel: "Emeritus", idPrefix: "EM", fee: 0, regularFee: 0, validityMonths: null, adminOnly: true },
};

const STATUSES = ["ACTIVE", "EXPIRED", "INACTIVE"];

const GENDERS = ["Female", "Male", "Other"];

const ID_PROOF_TYPES = ["Aadhaar", "PAN", "Voter ID", "Driving License", "Employee ID Card"];

// Modes the admin can record by hand. Online payments are recorded as "Online".
const PAYMENT_MODES = ["UPI", "Bank Transfer", "Cash", "Cheque", "Card", "Waived"];

// Renewal reminder emails are sent this many days before expiry.
const REMINDER_DAYS = [30, 7];

// Members can renew online once their membership is this close to expiry (or already expired).
const RENEWAL_WINDOW_DAYS = 60;

// Approved online applications that are not paid within this many days of approval
// are cancelled (and their files deleted). Applications waiting for review are kept.
const PENDING_APPLICATION_DAYS = 30;

// Membership types that can fill the join form from Aadhaar through DigiLocker.
const DIGILOCKER_TYPES = ["ANNUAL", "LIFE"];

// Zoho Payments "payment pages": one page per plan, each with its fee fixed, e.g.
// ZOHO_PAYMENT_PAGE_ANNUAL=https://... Applicants pay there and enter the Zoho payment ID,
// which the webhook confirms. Used when the automatic gateway (PAYMENT_PROVIDER) is off.
// The first https:// link in the value, so the link alone, the <iframe> embed code or a piece
// of it (with quotes, style="..." etc.) all work.
function pageLink(value) {
  const m = String(value || "").match(/https:\/\/[^\s"'<>]+/i);
  return m ? m[0] : "";
}
const PAYMENT_PAGES = Object.fromEntries(
  Object.keys(MEMBERSHIP_TYPES)
    .filter((key) => !MEMBERSHIP_TYPES[key].adminOnly)
    .map((key) => [key, pageLink(process.env[`ZOHO_PAYMENT_PAGE_${key}`])])
    .filter(([, url]) => url)
);

const ORG_NAME = process.env.ORG_NAME || "Membership Portal";
const ORG_CODE = (process.env.ORG_CODE || "ORG").toUpperCase();
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5174").replace(/\/+$/, "");

// Contact details shown on the website, ID card and in emails. Empty values are left out.
const CONTACT = {
  email: process.env.CONTACT_EMAIL || "",
  phone: process.env.CONTACT_PHONE || "",
  address: process.env.CONTACT_ADDRESS || "",
  website: process.env.WEBSITE_URL || "",
};

// Who is told by email when a new application arrives for review (empty = nobody).
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || CONTACT.email;

// Links shown at the bottom of emails and the website. Empty values are left out.
const SOCIAL_LINKS = [
  ["Facebook", process.env.SOCIAL_FACEBOOK],
  ["X", process.env.SOCIAL_X],
  ["Instagram", process.env.SOCIAL_INSTAGRAM],
  ["LinkedIn", process.env.SOCIAL_LINKEDIN],
  ["YouTube", process.env.SOCIAL_YOUTUBE],
]
  .filter(([, url]) => url)
  .map(([label, url]) => ({ label, url }));

// True only for a real plan key. MEMBERSHIP_TYPES[key] alone is not enough for keys that come
// from a request: "constructor", "toString", "__proto__" … are inherited from Object.prototype
// and would pass such a check.
const isMembershipType = (key) => typeof key === "string" && Object.hasOwn(MEMBERSHIP_TYPES, key);

// Plans only the admin can give (Honorary, Emeritus): nobody can apply or pay for them online.
const isAdminOnlyType = (key) => isMembershipType(key) && !!MEMBERSHIP_TYPES[key].adminOnly;

module.exports = {
  MEMBERSHIP_TYPES,
  isMembershipType,
  isAdminOnlyType,
  STATUSES,
  GENDERS,
  ID_PROOF_TYPES,
  PAYMENT_MODES,
  REMINDER_DAYS,
  RENEWAL_WINDOW_DAYS,
  PENDING_APPLICATION_DAYS,
  DIGILOCKER_TYPES,
  PAYMENT_PAGES,
  ORG_NAME,
  ORG_CODE,
  FRONTEND_URL,
  CONTACT,
  ADMIN_NOTIFY_EMAIL,
  SOCIAL_LINKS,
};
