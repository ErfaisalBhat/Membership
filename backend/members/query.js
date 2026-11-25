const { isMembershipType, STATUSES } = require("../config/membership");
const { todayIST, addDays } = require("../shared/dates");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const one = (v) => (Array.isArray(v) ? v[0] : v);

// Builds a MongoDB filter from ?search=&type=&status=&expiring=
// `searchFields` differs between the admin list and the public list.
function buildMemberFilter(query, searchFields) {
  const filter = {};
  const type = String(one(query.type) || "");
  const status = String(one(query.status) || "");
  const search = String(one(query.search) || "").trim().slice(0, 100);

  if (isMembershipType(type)) filter.membershipType = type;

  const today = todayIST();
  if (status === "EXPIRED") {
    // Includes members whose date has passed but the nightly job hasn't run yet.
    filter.$and = [{ $or: [{ status: "EXPIRED" }, { status: "ACTIVE", expiryDate: { $ne: null, $lt: today } }] }];
  } else if (status === "ACTIVE") {
    filter.status = "ACTIVE";
    filter.$and = [{ $or: [{ expiryDate: null }, { expiryDate: { $gte: today } }] }];
  } else if (STATUSES.includes(status)) {
    filter.status = status;
  }

  if (String(one(query.expiring) || "") === "30") {
    filter.status = "ACTIVE";
    filter.expiryDate = { $gte: today, $lte: addDays(today, 30) };
  }

  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$and = [...(filter.$and || []), { $or: searchFields.map((f) => ({ [f]: rx })) }];
  }
  return filter;
}

function pagination(query, maxLimit = 100) {
  const page = Math.max(1, parseInt(one(query.page), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(one(query.limit), 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

module.exports = { buildMemberFilter, pagination };
