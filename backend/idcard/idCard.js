const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { MEMBERSHIP_TYPES, ORG_NAME, FRONTEND_URL, CONTACT } = require("../config/membership");
const { displayDate } = require("../shared/dates");
const { filePath } = require("../documents/upload");

// Standard ID card size (CR80): 85.6 x 54 mm. Page 1 = front, page 2 = back.
// Minimal professional style (like a professional-body card): white card, no boxes or bands,
// one slim teal stripe on the left edge, a short gold rule, photo on the right.
// Same design for Annual, Life and Institutional; the plan is printed under the name.
const W = 243;
const H = 153;
const TEAL = "#0f4c5c";
const GOLD = "#b08d57";
const TEXT = "#1c2427";
const MUTED = "#76858a";
const PAPER = "#eef2f3"; // shown only where there is no photo
const X = 20; // left edge of the content (after the stripe)
const R = W - 14; // right edge of the content

function verifyUrl(member) {
  return `${FRONTEND_URL}/verify/${member.verifyToken}`;
}

// fill: true (the photo) fills the whole area, cropping what sticks out, so its edges always
// match the layout whatever the shape of the uploaded image. Otherwise (the signature) the
// image is shrunk to fit inside the area.
function drawImage(doc, stored, x, y, w, h, { fill = false } = {}) {
  if (!stored || !stored.filename) return false;
  try {
    const buf = fs.readFileSync(filePath(stored.filename));
    if (fill) {
      doc.save();
      doc.rect(x, y, w, h).clip();
      doc.image(buf, x, y, { cover: [w, h], align: "center", valign: "center" });
      doc.restore();
    } else {
      doc.image(buf, x, y, { fit: [w, h], align: "center", valign: "center" });
    }
    return true;
  } catch (err) {
    console.error("[ID CARD] Could not draw image:", err.message);
    return false;
  }
}

// The slim stripe on the left edge, and the heading at the top left with a short gold rule.
// title2: the small spaced line under the heading.
function frame(doc, title, title2) {
  doc.rect(0, 0, 6, H).fill(TEAL);

  const width = R - X;
  let size = 7.4;
  doc.font("Helvetica-Bold");
  while (size > 5 && doc.fontSize(size).widthOfString(title) > width) size -= 0.2;
  doc.fillColor(TEAL).fontSize(size).text(title, X, 13, { width, lineBreak: false });
  if (title2) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(4.4).text(title2, X, 23, { width, lineBreak: false, characterSpacing: 1.6 });
  }
  doc.rect(X, title2 ? 31 : 24, 16, 0.9).fill(GOLD);
}

// One row of the details: grey label on the left, value on the right, on the same line.
// A value that is too long for the line gets a smaller font instead of being cut.
const LABEL_W = 40;
const LABEL_SIZE = 4.6;
const VALUE_SIZE = 6.4; // bold values
function row(doc, label, value, x, y, width, { color = TEXT, size = VALUE_SIZE } = {}) {
  doc.fillColor(MUTED).font("Helvetica").fontSize(LABEL_SIZE).text(label, x, y + (size - LABEL_SIZE) * 0.75, { width: LABEL_W, lineBreak: false });
  const vw = width - LABEL_W;
  const text = String(value);
  doc.font("Helvetica-Bold");
  let s = size;
  while (s > 5.4 && doc.fontSize(s).widthOfString(text) > vw) s -= 0.2;
  if (doc.fontSize(s).widthOfString(text) <= vw) {
    doc.fillColor(color).text(text, x + LABEL_W, y + (size - s) * 0.75, { width: vw, lineBreak: false });
    return;
  }
  // Still too long (e.g. a full institution name): two lines, centred on the row.
  // The font shrinks a little more if needed, so the whole name fits in the two lines.
  s = 5.4;
  while (s > 4.2 && doc.fontSize(s).heightOfString(text, { width: vw, lineGap: -0.8 }) > 2 * (doc.currentLineHeight(true) - 0.8) + 0.5) s -= 0.2;
  doc.fontSize(s);
  const lineH = doc.currentLineHeight(true) - 0.8;
  doc.fillColor(color).text(text, x + LABEL_W, y + size * 0.62 - lineH, { width: vw, lineGap: -0.8, height: 2 * lineH + 2, ellipsis: true });
}

function drawFront(doc, member) {
  frame(doc, ORG_NAME, "MEMBERSHIP CARD");

  // Photo and signature on the left, without frames.
  const pw = 46;
  const ph = 58;
  const px = X;
  const py = 44;
  if (!drawImage(doc, member.documents && member.documents.photo, px, py, pw, ph, { fill: true })) doc.rect(px, py, pw, ph).fill(PAPER);
  const sy = py + ph + 4; // signature under the photo
  drawImage(doc, member.documents && member.documents.signature, px, sy, pw, 13);
  doc.moveTo(px + 4, sy + 15).lineTo(px + pw - 4, sy + 15).lineWidth(0.3).stroke(MUTED);
  doc.fillColor(MUTED).font("Helvetica").fontSize(3.8)
    .text(member.membershipType === "INSTITUTIONAL" ? "Authorized signature" : "Signature", px, sy + 17.5, { width: pw, align: "center", lineBreak: false });

  // Details to the right of the photo as rows (label | value), spread evenly from the top of
  // the photo to its bottom.
  const tx = px + pw + 14;
  const width = R - tx;
  const type = MEMBERSHIP_TYPES[member.membershipType];
  const rows = [
    ["Membership No.", member.membershipId],
    [member.membershipType === "INSTITUTIONAL" ? "Institution" : "Name", member.name],
    ["Membership", type ? type.label : member.membershipType, { color: TEAL }],
    ["Member since", displayDate(member.joinDate)],
    ["Valid until", member.expiryDate ? displayDate(member.expiryDate) : "Lifetime"],
  ];
  // Parallel with the photo: the tops of the first row's capitals line up with the top of
  // the photo, and the last row's baseline with its bottom (a value's baseline sits 0.718 of
  // its font size below the row's y in Helvetica).
  const BASELINE = VALUE_SIZE * 0.718;
  const step = (ph - BASELINE) / (rows.length - 1);
  rows.forEach(([label, value, opts], i) => row(doc, label, value, tx, py + i * step, width, opts));
}

async function drawBack(doc, member) {
  frame(doc, "Membership verification", "");

  // QR code, unframed
  const qr = await QRCode.toBuffer(verifyUrl(member), { margin: 0, width: 320, errorCorrectionLevel: "M", color: { dark: "#0f2f37", light: "#ffffff" } });
  const size = 70;
  doc.image(qr, X, 35, { width: size, height: size });
  doc.fillColor(MUTED).font("Helvetica").fontSize(4.3)
    .text("Scan to check whether the membership is active today", X - 3, 109, { width: size + 6, align: "center" });

  const x = X + size + 16;
  const width = R - x;
  doc.fillColor(TEXT).font("Helvetica").fontSize(6.2);
  doc.text("This card is the property of the Society and is valid only while the membership is current.", x, 37, { width, lineGap: 0.8 });
  doc.text("If found, please return it to the Society.", x, doc.y + 5, { width, lineGap: 0.8 });

  const contact = [CONTACT.address, CONTACT.email, CONTACT.phone ? `Phone: ${CONTACT.phone}` : "", CONTACT.website ? CONTACT.website.replace(/^https?:\/\//, "") : ""].filter(Boolean);
  if (contact.length) {
    const y = doc.y + 8;
    doc.fillColor(MUTED).font("Helvetica").fontSize(4.5).text("CONTACT", x, y, { width, characterSpacing: 0.8 });
    doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(6).text(contact.join("\n"), x, y + 6.5, { width, height: H - 12 - (y + 6.5), ellipsis: true, lineGap: 0.8 });
  }
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
