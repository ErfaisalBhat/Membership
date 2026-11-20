// All membership dates are stored as UTC midnight of the calendar date,
// and "today" is taken in Indian time so expiry flips at midnight IST.

const DAY_MS = 86400000;

function todayIST() {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${s}T00:00:00Z`);
}

// Parses "YYYY-MM-DD" (rejects impossible dates like 2026-02-31). Returns Date or null.
function parseDateOnly(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

function addDays(date, n) {
  return new Date(date.getTime() + n * DAY_MS);
}

// Adds months, clamping to the last day of the month (31 Jan + 1 month = 28/29 Feb).
function addMonths(date, n) {
  const day = date.getUTCDate();
  const r = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

// Membership valid from `start` for `months`, inclusive: 1 Apr 2026 + 12 months -> 31 Mar 2027.
function computeExpiry(start, months) {
  if (!months) return null;
  return addDays(addMonths(start, months), -1);
}

function ageOn(dob, on) {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function isoDate(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

// dd/mm/yyyy
function displayDate(d) {
  if (!d) return "";
  const [y, m, day] = isoDate(d).split("-");
  return `${day}/${m}/${y}`;
}

// dd.mm.yyyy — the style used in the Society's emails
function dottedDate(d) {
  return displayDate(d).replace(/\//g, ".");
}

module.exports = {
  dottedDate,
  todayIST,
  parseDateOnly,
  addDays,
  addMonths,
  computeExpiry,
  ageOn,
  daysBetween,
  isoDate,
  displayDate,
};
