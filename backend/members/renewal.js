const { MEMBERSHIP_TYPES, RENEWAL_WINDOW_DAYS } = require("../config/membership");
const { todayIST, addDays, computeExpiry, daysBetween } = require("../shared/dates");
const { effectiveStatus } = require("./serialize");

// The period a renewal pays for.
// Still valid: starts the day after the current expiry. Already expired: starts on `startIfExpired`.
function renewalPeriod(member, startIfExpired) {
  const months = MEMBERSHIP_TYPES[member.membershipType].validityMonths;
  const today = todayIST();
  const stillValid = member.expiryDate && member.expiryDate >= today;
  const periodFrom = stillValid ? addDays(member.expiryDate, 1) : startIfExpired;
  return { periodFrom, periodTo: computeExpiry(periodFrom, months) };
}

// Whether the member can renew online right now, and for how much.
function renewalInfo(member) {
  const type = MEMBERSHIP_TYPES[member.membershipType];
  if (!type || !type.validityMonths) return { canRenew: false, reason: "Life memberships never expire, so there is nothing to renew." };
  if (type.adminOnly) return { canRenew: false, reason: `${type.label}ship is extended by the Society. Please contact the membership office.` };

  const status = effectiveStatus(member);
  if (status === "INACTIVE") {
    return { canRenew: false, reason: "Your membership has been debarred. Please contact the membership office." };
  }

  const today = todayIST();
  const daysLeft = daysBetween(today, member.expiryDate);
  if (status === "ACTIVE" && daysLeft > RENEWAL_WINDOW_DAYS) {
    const opensOn = addDays(member.expiryDate, -RENEWAL_WINDOW_DAYS);
    return { canRenew: false, opensOn, reason: `Online renewal opens ${RENEWAL_WINDOW_DAYS} days before your membership expires.` };
  }

  const { periodFrom, periodTo } = renewalPeriod(member, today);
  return { canRenew: true, amount: type.fee, periodFrom, periodTo, daysLeft };
}

module.exports = { renewalPeriod, renewalInfo };
