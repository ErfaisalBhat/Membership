const PDFDocument = require("pdfkit");
const { MEMBERSHIP_TYPES, ORG_NAME, CONTACT } = require("../config/membership");
const { displayDate } = require("../shared/dates");

const NAVY = "#1f3a68";
const MUTED = "#5f6b7a";
const TEXT = "#1f2933";
const LINE = "#d9dee5";

// "Rs." is used for amounts because the built-in PDF fonts have no ₹ symbol.
const money = (n) => `Rs. ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A5 payment receipt for one entry of member.payments.
async function generateReceipt(member, payment) {
  const doc = new PDFDocument({
    size: "A5",
    margin: 40,
    info: { Title: `Receipt ${payment.receiptNo}`, Author: ORG_NAME },
  });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = 40;
  const width = doc.page.width - 80;

  // Letterhead
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(13).text(ORG_NAME, left, 40, { width, align: "center" });
  const contact = [CONTACT.address, [CONTACT.email, CONTACT.phone].filter(Boolean).join("  |  ")].filter(Boolean);
  if (contact.length) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(contact.join("\n"), { width, align: "center" });
  }
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).stroke(NAVY);
  doc.moveDown(0.8);
  doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(12).text("PAYMENT RECEIPT", left, doc.y, { width, align: "center", characterSpacing: 1 });
  doc.moveDown(1);

  // Receipt no + date
  const top = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Receipt No.", left, top);
  doc.font("Helvetica-Bold").fillColor(TEXT).text(payment.receiptNo, left, top + 12);
  doc.font("Helvetica").fillColor(MUTED).text("Date", left, top, { width, align: "right" });
  doc.font("Helvetica-Bold").fillColor(TEXT).text(displayDate(payment.date), left, top + 12, { width, align: "right" });
  doc.y = top + 36;

  // Details table
  const type = MEMBERSHIP_TYPES[member.membershipType];
  const period = payment.periodFrom
    ? `${displayDate(payment.periodFrom)} to ${payment.periodTo ? displayDate(payment.periodTo) : "Lifetime"}`
    : "";
  const rows = [
    ["Received from", member.name],
    ["Membership ID", member.membershipId],
    ["Towards", `${type ? type.label : member.membershipType} – ${payment.kind === "RENEWAL" ? "Renewal" : "New membership"}`],
    ["Membership period", period],
    ["Payment mode", payment.mode],
    ["Transaction reference", payment.reference],
  ].filter(([, v]) => v);

  for (const [label, value] of rows) {
    const y = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(label, left, y, { width: 130 });
    doc.font("Helvetica").fillColor(TEXT).text(value, left + 135, y, { width: width - 135 });
    doc.y = Math.max(doc.y, y + 12) + 6;
    doc.moveTo(left, doc.y - 3).lineTo(left + width, doc.y - 3).lineWidth(0.5).stroke(LINE);
  }

  // Amount box
  doc.moveDown(0.6);
  const boxY = doc.y;
  doc.rect(left, boxY, width, 34).fill("#eef2f8");
  doc.fillColor(MUTED).font("Helvetica").fontSize(9).text("Amount received", left + 12, boxY + 12);
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(14).text(money(payment.amount), left, boxY + 10, { width: width - 12, align: "right" });
  doc.y = boxY + 50;

  doc.fillColor(MUTED).font("Helvetica").fontSize(8)
    .text("This is a computer-generated receipt and does not require a signature.", left, doc.y, { width, align: "center" });

  doc.end();
  return done;
}

module.exports = { generateReceipt };
