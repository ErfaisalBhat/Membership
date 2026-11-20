// Membership settings. Change fees, labels or validity here — the admin form,
// the public join page, ID cards, emails and the expiry job all read from this file.
//
// fee:          what the member pays (after the waiver in the membership form)
// regularFee:   the fee before the waiver, shown struck out on the plans
// validityMonths: null means the membership never expires (Life).

const MEMBERSHIP_TYPES = {
  STUDENT: { label: "Student Member", shortLabel: "Student", fee: 1000, regularFee: 2000, validityMonths: 12 },
  ANNUAL: { label: "Annual Member", shortLabel: "Annual", fee: 2000, regularFee: 3000, validityMonths: 12 },
  LIFE: { label: "Life Member", shortLabel: "Life", fee: 4000, regularFee: 5000, validityMonths: null },
  INSTITUTIONAL: { label: "Institutional Member", shortLabel: "Institutional", fee: 9000, regularFee: 10000, validityMonths: 12 },
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

// Unpaid online applications are cancelled (and their files deleted) after this many days.
const PENDING_APPLICATION_DAYS = 30;

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

module.exports = {
  MEMBERSHIP_TYPES,
  STATUSES,
  GENDERS,
  ID_PROOF_TYPES,
  PAYMENT_MODES,
  REMINDER_DAYS,
  RENEWAL_WINDOW_DAYS,
  PENDING_APPLICATION_DAYS,
  ORG_NAME,
  ORG_CODE,
  FRONTEND_URL,
  CONTACT,
  SOCIAL_LINKS,
};
