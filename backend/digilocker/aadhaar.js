// Turns Cashfree's Aadhaar document into the fields of our membership form.
// Only what the form needs is kept: the full Aadhaar number, photo and XML are never stored.

const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

const key = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
const STATE_BY_KEY = Object.fromEntries(INDIAN_STATES.map((s) => [key(s), s]));
// Older or alternative names that appear on Aadhaar.
const STATE_ALIASES = {
  orissa: "Odisha",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
  nctofdelhi: "Delhi",
  newdelhi: "Delhi",
  andamanandnicobar: "Andaman and Nicobar Islands",
  dadraandnagarhaveli: "Dadra and Nagar Haveli and Daman and Diu",
  damananddiu: "Dadra and Nagar Haveli and Daman and Diu",
};

function matchState(value) {
  const k = key(value);
  return STATE_BY_KEY[k] || STATE_ALIASES[k] || "";
}

const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();

// "M" / "F" / "T" -> our gender options.
function mapGender(g) {
  return { M: "Male", F: "Female", T: "Other" }[clean(g).toUpperCase().charAt(0)] || "";
}

// "DD-MM-YYYY" -> "YYYY-MM-DD"
function mapDob(dob) {
  const m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(clean(dob));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// Father's name only when care_of is "S/O" or "D/O" (not W/O, C/O, H/O).
function fatherFromCareOf(careOf) {
  const m = /^(?:S|D)\s*\/?\s*O\b[\s:.,-]*(.+)$/i.exec(clean(careOf));
  return m ? clean(m[1]) : "";
}

// Fits the street part of the address into two lines of at most `max` characters each.
function splitLines(text, max = 30) {
  const lines = ["", ""];
  let i = 0;
  for (const raw of text.split(" ")) {
    const word = raw.slice(0, max);
    if (!word) continue;
    const next = lines[i] ? `${lines[i]} ${word}` : word;
    if (next.length <= max) lines[i] = next;
    else if (i === 0) {
      i = 1;
      lines[1] = word;
    } else break; // too long for two lines: the student can edit it
  }
  return lines;
}

function mapAddress(a = {}) {
  const city = clean(a.vtc) || clean(a.subdist) || clean(a.dist);
  const parts = [a.house, a.street, a.landmark, a.po]
    .map(clean)
    .filter(Boolean)
    .filter((p, idx, arr) => arr.indexOf(p) === idx && p.toLowerCase() !== city.toLowerCase());
  const [line1, line2] = splitLines(parts.join(", "));
  const pincode = clean(a.pincode).replace(/\D/g, "");
  return { line1, line2, city, state: matchState(a.state), pincode: /^[1-9]\d{5}$/.test(pincode) ? pincode : "" };
}

function mapAadhaar(doc) {
  const last4 = (clean(doc.uid).match(/(\d{4})$/) || [])[1] || "";
  return {
    name: clean(doc.name),
    dob: mapDob(doc.dob),
    gender: mapGender(doc.gender),
    fatherName: fatherFromCareOf(doc.care_of),
    address: mapAddress(doc.split_address),
    last4,
  };
}

module.exports = { mapAadhaar, matchState, splitLines, fatherFromCareOf };
