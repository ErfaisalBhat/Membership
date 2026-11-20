// Dates come from the API as UTC midnight ("2026-11-01T00:00:00.000Z").

export function formatDate(value) {
  if (!value) return "";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function isoDate(value) {
  return value ? String(value).slice(0, 10) : "";
}

// Today's date in India as YYYY-MM-DD.
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export function formatBytes(n) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
