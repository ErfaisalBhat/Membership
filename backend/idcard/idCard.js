const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { MEMBERSHIP_TYPES, ORG_NAME, FRONTEND_URL } = require("../config/membership");
const { dottedDate, addMonths, addDays } = require("../shared/dates");
const { filePath } = require("../documents/upload");

// Standard ID card size (CR80): 85.6 x 54 mm. Page 1 = front, page 2 = back.
// Layout follows the Society's printed card: bilingual header with the logo, photo and details
// on the front with the member's and the Secretary's signatures; validity, address and the
// instructions on the back, with a QR code (opens the verify page) at the top left.
//
// The header (logo, Hindi and English names) and the Secretary's signature are images cut from
// the original design, and the Hindi plan names are pre-rendered images too, because PDFKit
// cannot lay out Devanagari text correctly. They live in ./assets.
const W = 243;
const H = 153;
const TEXT = "#000000";
const LINE = "#c8c8c8";
const PAPER = "#eeeeee"; // shown only where there is no photo
const REGULAR = "Times-Roman";
const BOLD = "Times-Bold";
// Text placed by its baseline near the bottom edge would otherwise make PDFKit start a new
// page; a text box with a height never does.
const NO_PAGE_BREAK = H;

const ASSETS = path.join(__dirname, "assets");
const asset = (name) => fs.readFileSync(path.join(ASSETS, name));
const HEADER = asset("header.png");
const SECRETARY_SIGNATURE = asset("secretary-signature.png");
const PLAN_HINDI = Object.fromEntries(Object.keys(MEMBERSHIP_TYPES).map((key) => [key, asset(`plan-${key}.png`)]));
// The Hindi plan images: Nirmala UI Bold at 200 px per em, baseline 216 px from the top.
const HINDI_EM = 200;
const HINDI_BASELINE = 216;
const HINDI_SCALE = 0.95; // a touch smaller than the English text beside it reads as the same size

const RETURN_ADDRESS = "Secretary, ASSSR, Flat No. 1 U/G House No. 677/16 Ashok Vatika Deoli New Delhi - 110080.";

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

// One line of text with its baseline at y. x is the left edge, or the right edge / centre for
// align "right" / "center". Text wider than `width` gets a smaller font (down to minSize), then
// is cut with an ellipsis.
function line(doc, text, x, y, { font = REGULAR, size, width, minSize = size * 0.75, align = "left" } = {}) {
  const t = String(text || "");
  doc.font(font);
  let s = size;
  if (width) while (s > minSize && doc.fontSize(s).widthOfString(t) > width) s -= 0.1;
  doc.fontSize(s).fillColor(TEXT);
  const w = width || doc.widthOfString(t) + 0.5;
  const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  doc.text(t, left, y, { width: w, align, baseline: "alphabetic", lineBreak: false, ellipsis: !!width, height: NO_PAGE_BREAK });
}

function cardBorder(doc) {
  doc.rect(0.25, 0.25, W - 0.5, H - 0.5).lineWidth(0.5).stroke(TEXT);
}

// "(वार्षिक सदस्य / ANNUAL MEMBER)", right-aligned at x with its baseline at y.
function planLabel(doc, key, x, y, size) {
  const img = PLAN_HINDI[key];
  const english = ` / ${(MEMBERSHIP_TYPES[key] ? MEMBERSHIP_TYPES[key].label : key).toUpperCase()})`;
  doc.font(BOLD).fontSize(size);
  const open = doc.widthOfString("(");
  const tail = doc.widthOfString(english);
  const scale = (size * HINDI_SCALE) / HINDI_EM;
  const { width: pw, height: ph } = doc.openImage(img);
  const imgW = pw * scale;
  let cx = x - (open + imgW + tail);
  line(doc, "(", cx, y, { font: BOLD, size });
  cx += open;
  doc.image(img, cx, y - HINDI_BASELINE * scale, { width: imgW, height: ph * scale });
  cx += imgW;
  line(doc, english, cx, y, { font: BOLD, size });
}

// "2025-26" for the current period of a membership that expires; empty for Life.
function periodLabel(member) {
  const type = MEMBERSHIP_TYPES[member.membershipType];
  if (!member.expiryDate || !type || !type.validityMonths) return "";
  const to = new Date(member.expiryDate);
  const from = addDays(addMonths(to, -type.validityMonths), 1);
  const a = from.getUTCFullYear();
  const b = to.getUTCFullYear();
  return a === b ? String(a) : `${a}-${String(b).slice(-2)}`;
}

function addressText(member) {
  const a = member.address || {};
  return [a.line1, a.line2, a.city, a.state, a.pincode, "India"].map((s) => String(s || "").trim()).filter(Boolean).join(", ");
}

function drawFront(doc, member) {
  const institutional = member.membershipType === "INSTITUTIONAL";
  cardBorder(doc);

  // Header (logo + names) and the rule under it
  doc.image(HEADER, 7.8, 5.8, { width: 196.7 });
  doc.moveTo(6, 40.8).lineTo(W - 4.5, 40.8).lineWidth(0.3).stroke(TEXT);

  // Plan and period, top right
  planLabel(doc, member.membershipType, 235.8, 53.4, 4.7);
  const period = periodLabel(member);
  if (period) line(doc, period, 235.8, 60.4, { font: BOLD, size: 4.7, align: "right" });

  // Photo
  const px = 9;
  const py = 56;
  const pw = 45;
  const ph = 55;
  if (!drawImage(doc, member.documents && member.documents.photo, px, py, pw, ph, { fill: true })) doc.rect(px, py, pw, ph).fill(PAPER);
  doc.rect(px, py, pw, ph).lineWidth(0.3).stroke(LINE);

  // Details beside the photo
  const rows = institutional
    ? [
        ["Institution", member.name],
        ["Contact Person", member.contactPerson],
        ["Membership ID", member.membershipId],
      ]
    : [
        ["Name", member.name],
        ["Father's Name", member.fatherName],
        ["Date of Birth", member.dob ? dottedDate(member.dob) : ""],
        ["Membership ID", member.membershipId],
      ];
  const LX = 62.1;
  const VX = 106.9;
  rows
    .filter(([, value]) => value)
    .forEach(([label, value], i) => {
      const y = 69.5 + i * 10.15;
      line(doc, label, LX, y, { font: BOLD, size: 5.6 });
      line(doc, value, VX, y, { size: 5.6, width: W - 8 - VX, minSize: 4.4 });
    });

  // Member's signature between two light rules, bottom left
  doc.moveTo(px, 123.4).lineTo(px + pw, 123.4).lineWidth(0.3).stroke(LINE);
  doc.moveTo(px, 133.4).lineTo(px + pw, 133.4).lineWidth(0.3).stroke(LINE);
  drawImage(doc, member.documents && member.documents.signature, px + 2, 124.2, pw - 4, 8.4);
  const signLabel = institutional ? "Authorized Signature" : "Member's Signature";
  line(doc, signLabel, px + pw / 2, 143.8, { font: BOLD, size: 5.2, width: 52, align: "center" });

  // Secretary's signature, bottom right
  doc.image(SECRETARY_SIGNATURE, 206.5, 121.5, { fit: [26, 14], align: "center", valign: "center" });
  line(doc, "Secretary", 219.5, 143.4, { font: BOLD, size: 5.2, width: 40, align: "center" });
  line(doc, "Issuing Authority", 219.5, 149.3, { font: BOLD, size: 5.2, width: 40, align: "center" });
}

async function drawBack(doc, member) {
  cardBorder(doc);

  // QR code where the printed design has its barcode: opens the verify page
  const qr = await QRCode.toBuffer(verifyUrl(member), { margin: 0, width: 400, errorCorrectionLevel: "L", color: { dark: "#000000", light: "#ffffff" } });
  doc.image(qr, 6.3, 5, { width: 25, height: 25 });

  // Valid till, top right
  line(doc, `Valid Till: ${member.expiryDate ? dottedDate(member.expiryDate) : "Lifetime"}`, 238.5, 15.2, { font: BOLD, size: 5.6, align: "right" });

  const LX = 6.3;
  const VX = 87.6;
  const SIZE = 5.6;
  const row = (label, y) => line(doc, label, LX, y, { font: BOLD, size: SIZE });

  row("Date of Membership", 38.8);
  line(doc, dottedDate(member.joinDate), VX, 38.8, { size: SIZE });
  row("Membership ID", 48.3);
  line(doc, member.membershipId, VX, 48.3, { size: SIZE });

  // Address: up to 3 lines; the font shrinks if it needs more.
  const address = addressText(member);
  const AW = 112;
  const ADDR_GAP = -0.1;
  row("Address", 59.7);
  let s = SIZE;
  doc.font(REGULAR);
  const lines = () => Math.round(doc.fontSize(s).heightOfString(address || " ", { width: AW, lineGap: ADDR_GAP }) / (doc.currentLineHeight(true) + ADDR_GAP));
  while (s > 4.4 && lines() > 3) s -= 0.1;
  const n = Math.min(3, Math.max(1, lines()));
  const step = doc.fontSize(s).currentLineHeight(true) + ADDR_GAP;
  doc.fillColor(TEXT).text(address, VX, 59.7, { width: AW, lineGap: ADDR_GAP, baseline: "alphabetic", height: 3 * step + 2, ellipsis: true });

  const mobileY = 59.7 + (n - 1) * step + 9.6;
  row("Mobile Number", mobileY);
  line(doc, member.whatsapp, VX, mobileY, { size: SIZE });

  // Instructions
  line(doc, "INSTRUCTIONS", LX, 93.4, { font: BOLD, size: 6 });
  const items = [
    "1. This card is issued only for identification and must be produced on demand.",
    "2. Loss of this card should be reported immediately in writing to the issuing authority and the police.",
    "3. This card must be surrendered on cessation of membership.",
    "4. Disciplinary action will be taken in case of misuse of this card.",
    `5. If found please return this to the ${RETURN_ADDRESS}`,
  ];
  const IX = 7.5;
  const IW = W - 5 - IX;
  // One font size for all items: the largest at which items 1–4 each fit on one line.
  doc.font(REGULAR);
  let is = 5.6;
  while (is > 4.2 && items.slice(0, 4).some((t) => doc.fontSize(is).widthOfString(t) > IW)) is -= 0.1;
  items.forEach((t, i) => {
    doc.font(REGULAR).fontSize(is).fillColor(TEXT).text(t, IX, 103.6 + i * 9.1, { width: IW, lineGap: 0.6, baseline: "alphabetic", height: NO_PAGE_BREAK });
  });
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
