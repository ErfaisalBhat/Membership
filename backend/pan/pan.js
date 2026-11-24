// PAN rules for Institutional members: the PAN must belong to an organisation, never a person.
//
// The 4th character of a PAN tells who holds it:
//   P Individual (personal)   H Hindu Undivided Family    -> refused
//   C Company   F Firm / LLP   A Association of Persons   B Body of Individuals
//   T Trust     L Local Authority   J Artificial Juridical Person   G Government   -> accepted

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const HOLDER_TYPES = {
  C: "Company",
  F: "Firm / LLP",
  A: "Association of Persons (AOP)",
  B: "Body of Individuals (BOI)",
  T: "Trust",
  L: "Local Authority",
  J: "Artificial Juridical Person",
  G: "Government",
  P: "Individual",
  H: "Hindu Undivided Family (HUF)",
};
const PERSONAL = ["P", "H"];

const normalizePan = (v) => String(v == null ? "" : v).toUpperCase().replace(/\s+/g, "");

// Returns an error message, or "" when the PAN is a well-formed organisational PAN.
function panProblem(pan) {
  if (!pan) return "PAN of the institution is required.";
  if (!PAN_RE.test(pan)) return "Enter a valid 10-character PAN, e.g. AAABA1234B.";
  if (PERSONAL.includes(pan[3])) {
    return "This is a personal PAN. Please enter the PAN of the institution or organisation, not of a person.";
  }
  if (!HOLDER_TYPES[pan[3]]) return "This PAN is not an organisation's PAN.";
  return "";
}

const holderType = (pan) => HOLDER_TYPES[pan[3]] || "";

module.exports = { normalizePan, panProblem, holderType, PAN_RE };
