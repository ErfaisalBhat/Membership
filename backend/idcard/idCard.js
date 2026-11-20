const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { MEMBERSHIP_TYPES, ORG_NAME, ORG_CODE, FRONTEND_URL, CONTACT } = require("../config/membership");
const { displayDate } = require("../shared/dates");
const { filePath } = require("../documents/upload");

// Standard ID card size (CR80): 85.6 x 54 mm. Page 1 = front, page 2 = back.
const W = 243;
const H = 153;
const NAVY = "#1f3a68";
const MUTED = "#5f6b7a";
const TEXT = "#1f2933";
const LINE = "#c9d1dc";

function verifyUrl(member) {
  return `${FRONTEND_URL}/verify/${member.verifyToken}`;
}

function drawImage(doc, stored, x, y, w, h) {
  if (!stored || !stored.filename) return false;
  try {
    const buf = fs.readFileSync(filePath(stored.filename));
    doc.image(buf, x, y, { fit: [w, h], align: "center", valign: "center" });
    return true;
  } catch (err) {
    console.error("[ID CARD] Could not draw image:", err.message);
    return false;
  }
}

function header(doc, subtitle) {
  doc.rect(0, 0, W, 30).fill(NAVY);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.2)
    .text(ORG_NAME.toUpperCase(), 8, 7, { width: W - 16, align: "center", lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(5.4)
    .text(subtitle, 8, 18, { width: W - 16, align: "center", characterSpacing: 1.4, lineBreak: false });
}

function footer(doc, text) {
  doc.rect(0, H - 12, W, 12).fill(NAVY);
  doc.fillColor("#ffffff").font("Helvetica").fontSize(4.8)
    .text(text, 8, H - 8.5, { width: W - 16, align: "center", lineBreak: false, ellipsis: true });
}

function drawFront(doc, member) {
  header(doc, "MEMBERSHIP CARD");

  // Photo
  const photo = { x: 10, y: 38, w: 50, h: 62 };
  doc.rect(photo.x, photo.y, photo.w, photo.h).fill("#eef1f5");
  drawImage(doc, member.documents && member.documents.photo, photo.x, photo.y, photo.w, photo.h);
  doc.rect(photo.x, photo.y, photo.w, photo.h).lineWidth(0.5).stroke(LINE);

  // Signature
  drawImage(doc, member.documents && member.documents.signature, 10, 104, 50, 16);
  doc.moveTo(10, 122).lineTo(60, 122).lineWidth(0.4).stroke("#9aa5b1");
  doc.fillColor(MUTED).font("Helvetica").fontSize(4.4)
    .text(member.membershipType === "INSTITUTIONAL" ? "Authorized signature" : "Member's signature", 10, 124.5, { width: 50, align: "center", lineBreak: false });

  // Details
  const x = 70;
  const width = W - x - 10;
  doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(9)
    .text(member.name, x, 39, { width, height: 22, ellipsis: true });

  const type = MEMBERSHIP_TYPES[member.membershipType];
  const rows = [
    ["MEMBERSHIP ID", member.membershipId],
    ["MEMBERSHIP TYPE", type ? type.label : member.membershipType],
    ["MEMBER SINCE", displayDate(member.joinDate)],
    ["VALID TILL", member.expiryDate ? displayDate(member.expiryDate) : "Lifetime"],
  ];
  let y = 62;
  for (const [label, value] of rows) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(4.6).text(label, x, y, { width, lineBreak: false, characterSpacing: 0.4 });
    doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(7).text(value, x, y + 5.6, { width, lineBreak: false, ellipsis: true });
    y += 15;
  }

  footer(doc, CONTACT.website ? CONTACT.website.replace(/^https?:\/\//, "") : `${ORG_CODE} membership`);
}

async function drawBack(doc, member) {
  header(doc, "VERIFY THIS CARD");

  const qr = await QRCode.toBuffer(verifyUrl(member), { margin: 0, width: 320, errorCorrectionLevel: "M" });
  doc.image(qr, 12, 40, { width: 64, height: 64 });
  doc.fillColor(MUTED).font("Helvetica").fontSize(4.6)
    .text("Scan to check the current status", 8, 108, { width: 72, align: "center" });

  const x = 90;
  const width = W - x - 10;
  const lines = [
    `This card is the property of ${ORG_NAME} and is valid only with a current membership.`,
    "Scan the QR code to see whether the membership is active today.",
    "If found, please return it to the address below.",
  ];
  doc.fillColor(TEXT).font("Helvetica").fontSize(5.6);
  let y = 40;
  for (const line of lines) {
    doc.text(line, x, y, { width, lineGap: 0.6 });
    y = doc.y + 3.5;
  }

  const contact = [CONTACT.address, CONTACT.email, CONTACT.phone ? `Phone: ${CONTACT.phone}` : ""].filter(Boolean);
  if (contact.length) {
    doc.moveTo(x, y + 1).lineTo(W - 10, y + 1).lineWidth(0.4).stroke(LINE);
    doc.fillColor(MUTED).font("Helvetica").fontSize(5);
    doc.text(contact.join("\n"), x, y + 5, { width, height: H - 16 - (y + 5), ellipsis: true });
  }

  footer(doc, `Membership ID: ${member.membershipId}`);
}

async function generateIdCard(member) {
  const doc = new PDFDocument({
    size: [W, H],
    margin: 0,
    autoFirstPage: true,
    info: { Title: `Membership Card ${member.membershipId}`, Author: ORG_NAME },
  });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawFront(doc, member);
  doc.addPage({ size: [W, H], margin: 0 });
  await drawBack(doc, member);

  doc.end();
  return done;
}

module.exports = { generateIdCard, verifyUrl };
