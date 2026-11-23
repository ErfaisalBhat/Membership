// Turns Cashfree's Aadhaar document into the fields of our membership form.
// Only what the form needs is kept (the photo becomes the passport photograph):
// the full Aadhaar number and the XML are never stored.

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

// Trims a value; placeholders such as "-", "--" or "." (no letter or digit) count as empty,
// because Aadhaar uses them for parts of the address that don't exist.
const clean = (v) => {
  const s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  return /[\p{L}\p{N}]/u.test(s) ? s : "";
};
// Address parts may also say "NA" / "N.A." for "not applicable".
const addressPart = (v) => {
  const s = clean(v);
  return /^n\.?\s*a\.?$/i.test(s) ? "" : s;
};

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

// Address lines: 30 characters each for addresses typed by hand; an Aadhaar address is
// kept whole (it is locked on the form), so its lines may be up to AADHAAR_LINE_MAX.
const AADHAAR_LINE_MAX = 100;

// Fits the street part of the address into two lines of at most `max` characters each.
// Returns { lines, fits } — fits is false when something had to be left out.
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
    } else return { lines, fits: false };
  }
  return { lines, fits: true };
}

function mapAddress(a = {}) {
  const city = addressPart(a.vtc) || addressPart(a.subdist) || addressPart(a.dist);
  // Everything on the Aadhaar address except city, state, PIN and country (own fields).
  const parts = [a.house, a.street, a.landmark, a.loc, a.locality, a.po, a.subdist, a.dist]
    .map(addressPart)
    .filter(Boolean)
    .filter((p, idx, arr) => arr.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === idx && p.toLowerCase() !== city.toLowerCase());
  const text = parts.join(", ");
  // 30-character lines when it fits; otherwise the shortest lines that hold all of it, so
  // nothing is lost and the two lines stay balanced.
  let result = splitLines(text, 30);
  for (let max = 31; !result.fits && max <= AADHAAR_LINE_MAX; max++) result = splitLines(text, max);
  const [line1, line2] = result.lines.map((l) => l.replace(/,\s*$/, ""));
  const pincode = clean(a.pincode).replace(/\D/g, "");
  return { line1, line2, city, state: matchState(a.state), pincode: /^[1-9]\d{5}$/.test(pincode) ? pincode : "" };
}

// The Aadhaar-linked mobile number from DigiLocker's user details, as 10 digits.
function mapMobile(m) {
  let digits = clean(m).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? digits : "";
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

// Cashfree's photo_link: the Aadhaar photo as base64 (sometimes a data: URL or a link).
// Returns { data: Buffer, mimeType } or null when there is no usable JPG/PNG.
async function decodePhoto(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  let buf;
  try {
    if (/^https:\/\//i.test(v)) {
      const r = await fetch(v, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return null;
      buf = Buffer.from(await r.arrayBuffer());
    } else {
      buf = Buffer.from(v.replace(/^data:[^,]*,/, ""), "base64");
    }
  } catch {
    return null;
  }
  if (buf.length < 100 || buf.length > MAX_PHOTO_BYTES) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { data: buf, mimeType: "image/jpeg" };
  if (buf.subarray(0, 4).equals(PNG_MAGIC)) return { data: buf, mimeType: "image/png" };
  return null;
}

// doc: Cashfree's Aadhaar document, plus user_details from the DigiLocker status (mobile).
async function mapAadhaar(doc) {
  const last4 = (clean(doc.uid).match(/(\d{4})$/) || [])[1] || "";
  return {
    name: clean(doc.name),
    dob: mapDob(doc.dob),
    gender: mapGender(doc.gender),
    fatherName: fatherFromCareOf(doc.care_of),
    address: mapAddress(doc.split_address),
    mobile: mapMobile(doc.user_details && doc.user_details.mobile),
    photo: await decodePhoto(doc.photo_link),
    last4,
  };
}

// Form fields that came from Aadhaar and so are shown read-only (only those with a value;
// anything Aadhaar doesn't have is left for the applicant to fill in).
function lockedPaths(a = {}) {
  const paths = ["name", "dob", "gender", "fatherName"].filter((k) => a[k]);
  const ad = a.address || {};
  if (ad.line1) paths.push("address.line1", "address.line2");
  for (const k of ["city", "state", "pincode"]) if (ad[k]) paths.push(`address.${k}`);
  if (a.photo && a.photo.data && a.photo.data.length) paths.push("documents.photo");
  return paths;
}

module.exports = { mapAadhaar, lockedPaths, matchState, splitLines, fatherFromCareOf, AADHAAR_LINE_MAX };
