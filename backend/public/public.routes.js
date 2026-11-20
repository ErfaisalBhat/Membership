const express = require("express");
const Member = require("../members/Member");
const {
  MEMBERSHIP_TYPES,
  STATUSES,
  GENDERS,
  ID_PROOF_TYPES,
  PAYMENT_MODES,
  ORG_NAME,
  ORG_CODE,
  CONTACT,
  SOCIAL_LINKS,
  RENEWAL_WINDOW_DAYS,
  PENDING_APPLICATION_DAYS,
} = require("../config/membership");
const content = require("../config/content");
const { activeProvider, paymentsProblem } = require("../payments/provider");
const { buildMemberFilter, pagination } = require("../members/query");
const { serializePublicRow, effectiveStatus, typeLabel } = require("../members/serialize");
const { filePath } = require("../documents/upload");

const router = express.Router();

// GET /api/public/config — settings the frontend needs (types, fees, dropdowns, site text)
router.get("/config", (req, res) => {
  const provider = activeProvider();
  res.json({
    orgName: ORG_NAME,
    orgCode: ORG_CODE,
    membershipTypes: Object.entries(MEMBERSHIP_TYPES).map(([key, t]) => ({ key, ...t })),
    statuses: STATUSES,
    genders: GENDERS,
    idProofTypes: ID_PROOF_TYPES,
    paymentModes: PAYMENT_MODES,
    contact: CONTACT,
    socialLinks: SOCIAL_LINKS,
    content,
    renewalWindowDays: RENEWAL_WINDOW_DAYS,
    pendingApplicationDays: PENDING_APPLICATION_DAYS,
    onlinePayments: {
      enabled: !paymentsProblem(),
      provider: provider && !paymentsProblem() ? provider.name : "",
    },
  });
});

// GET /api/public/members?search=&type=&status=&page=
// Only members who consented are listed, and never with contact details.
router.get("/members", async (req, res) => {
  const filter = { ...buildMemberFilter(req.query, ["name", "membershipId"]), showInPublicList: true };
  const { page, limit, skip } = pagination(req.query, 50);
  const [items, total] = await Promise.all([
    Member.find(filter)
      .select("name membershipId membershipType status joinDate expiryDate")
      .sort({ membershipId: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Member.countDocuments(filter),
  ]);
  res.json({ items: items.map(serializePublicRow), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

const validToken = (t) => /^[a-f0-9]{32}$/.test(String(t || ""));

// GET /api/public/verify/:token — target of the QR code on the ID card
router.get("/verify/:token", async (req, res) => {
  if (!validToken(req.params.token)) return res.status(404).json({ message: "No membership found for this card." });
  const m = await Member.findOne({ verifyToken: req.params.token }).lean();
  if (!m) return res.status(404).json({ message: "No membership found for this card." });
  res.json({
    name: m.name,
    membershipId: m.membershipId,
    membershipType: m.membershipType,
    typeLabel: typeLabel(m.membershipType),
    status: effectiveStatus(m),
    joinDate: m.joinDate,
    expiryDate: m.expiryDate,
    hasPhoto: !!(m.documents && m.documents.photo && m.documents.photo.filename),
  });
});

// GET /api/public/verify/:token/photo — lets the person checking compare the face on the card
router.get("/verify/:token/photo", async (req, res) => {
  if (!validToken(req.params.token)) return res.status(404).end();
  const m = await Member.findOne({ verifyToken: req.params.token }).select("documents.photo").lean();
  const photo = m && m.documents && m.documents.photo;
  if (!photo || !photo.filename) return res.status(404).end();
  res.setHeader("Content-Type", photo.mimeType);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(filePath(photo.filename), (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

module.exports = router;
