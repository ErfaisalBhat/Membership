const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const {
  MEMBERSHIP_TYPES,
  ORG_NAME,
  ORG_CODE,
  FRONTEND_URL,
  CONTACT,
  ADMIN_NOTIFY_EMAIL,
  SOCIAL_LINKS,
  PENDING_APPLICATION_DAYS,
} = require("../config/membership");
const { dottedDate } = require("../shared/dates");
const { generateIdCard } = require("../idcard/idCard");
const { generateReceipt } = require("../idcard/receipt");

// Emails follow the Society's existing "Membership ID Card" email: header, title,
// "Dear …", a details table, signature from the Membership Section, links,
// the "Save Paper" line and the disclaimer.
//
// EMAIL_MODE=log (or an empty SMTP_HOST) only prints emails to the console.
// EMAIL_MODE=file also saves each email (and its attachments) in backend/email-previews,
// so you can open them in a browser to check how they look.

const LOG_ONLY = process.env.EMAIL_MODE === "log" || process.env.EMAIL_MODE === "file" || !process.env.SMTP_HOST;
const PREVIEW_DIR = process.env.EMAIL_MODE === "file" ? path.resolve(__dirname, "..", "email-previews") : "";

function savePreview({ to, subject, html, attachments }) {
  try {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = `${stamp}-${subject.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}`;
    fs.writeFileSync(path.join(PREVIEW_DIR, `${base}.html`), `<!-- To: ${esc(to)} | ${esc(subject)} -->\n${html}`);
    for (const a of attachments) fs.writeFileSync(path.join(PREVIEW_DIR, `${base}-${a.filename}`), a.content);
  } catch (err) {
    console.error("[EMAIL] Could not save preview:", err.message);
  }
}

const transporter = LOG_ONLY
  ? null
  : nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });

const FROM_NAME = process.env.MAIL_FROM_NAME || `${ORG_CODE} Membership`;
const HEADER_IMAGE = process.env.EMAIL_HEADER_IMAGE_URL || ""; // optional banner image (https URL)
const LOGO_IMAGE = process.env.EMAIL_LOGO_URL || ""; // optional logo above the signature (https URL)

const NAVY = "#1f3a68";
const TEXT = "#1f2933";
const MUTED = "#5f6b7a";
const LINE = "#d9dee5";

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- Blocks ----------
// Every email body is a list of blocks, rendered once as HTML and once as plain text.
const p = (text, html) => ({ type: "p", text, html: html || esc(text) });
const table = (rows) => ({ type: "table", rows: rows.filter(([, v]) => v) });
const list = (items) => ({ type: "list", items });
const button = (label, url) => ({ type: "button", label, url });
const code = (value) => ({ type: "code", value });

function blockHtml(b) {
  const P = `style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${TEXT};"`;
  switch (b.type) {
    case "table":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;font-size:14px;color:${TEXT};">${b.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 0;min-width:170px;color:${MUTED};">${esc(k)}</td><td style="padding:4px 12px;">:</td><td style="padding:4px 0;font-weight:bold;">${esc(v)}</td></tr>`
        )
        .join("")}</table>`;
    case "list":
      return `<ul style="margin:0 0 14px;padding-left:22px;font-size:14px;line-height:1.6;color:${TEXT};">${b.items
        .map((i) => `<li>${esc(i)}</li>`)
        .join("")}</ul>`;
    case "button":
      return `<p style="margin:6px 0 18px;"><a href="${esc(b.url)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 18px;border-radius:4px;">${esc(b.label)}</a></p>`;
    case "code":
      return `<p style="margin:4px 0 18px;font-size:28px;letter-spacing:8px;font-weight:bold;color:${NAVY};font-family:Consolas,'Courier New',monospace;">${esc(b.value)}</p>`;
    default:
      return `<p ${P}>${b.html}</p>`;
  }
}

function blockText(b) {
  switch (b.type) {
    case "table":
      return b.rows.map(([k, v]) => `${k.padEnd(22)}: ${v}`).join("\n");
    case "list":
      return b.items.map((i) => `- ${i}`).join("\n");
    case "button":
      return `${b.label}: ${b.url}`;
    case "code":
      return b.value;
    default:
      return b.text;
  }
}

function linksRow() {
  const links = [...(CONTACT.website ? [{ label: "Website", url: CONTACT.website }] : []), ...SOCIAL_LINKS];
  return links;
}

function renderHtml({ title, greeting, blocks }) {
  const header = HEADER_IMAGE
    ? `<img src="${esc(HEADER_IMAGE)}" alt="${esc(ORG_NAME)}" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0;">`
    : `<div style="background:${NAVY};padding:22px 24px;text-align:center;color:#ffffff;">
         <div style="font-size:12px;letter-spacing:3px;opacity:.8;">${esc(ORG_CODE)}</div>
         <div style="font-size:19px;font-weight:bold;margin-top:4px;">${esc(ORG_NAME)}</div>
       </div>`;
  const links = linksRow()
    .map((l) => `<a href="${esc(l.url)}" style="color:${NAVY};text-decoration:none;">${esc(l.label)}</a>`)
    .join(" &nbsp;|&nbsp; ");
  const contactLines = [
    CONTACT.email ? `<a href="mailto:${esc(CONTACT.email)}" style="color:${NAVY};text-decoration:none;">${esc(CONTACT.email)}</a>` : "",
    CONTACT.phone ? `Contact: ${esc(CONTACT.phone)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");
  const disclaimerContact = CONTACT.email ? ` at ${esc(CONTACT.email)}` : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#eef1f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid ${LINE};">
  <tr><td>${header}</td></tr>
  <tr><td style="padding:14px 24px;border-bottom:1px solid ${LINE};text-align:center;font-size:16px;font-weight:bold;color:${NAVY};letter-spacing:.5px;">${esc(title)}</td></tr>
  <tr><td style="padding:24px 24px 8px;">
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${TEXT};">Dear ${esc(greeting)},</p>
    ${blocks.map(blockHtml).join("\n")}
  </td></tr>
  <tr><td style="padding:8px 24px 22px;font-size:14px;line-height:1.6;color:${TEXT};">
    ${LOGO_IMAGE ? `<img src="${esc(LOGO_IMAGE)}" alt="${esc(ORG_CODE)} logo" height="56" style="display:block;height:56px;margin:0 0 10px;border:0;">` : ""}
    With kind regards<br>
    <strong>O/o Membership Section</strong><br>
    ${esc(ORG_NAME)}${contactLines ? `<br>${contactLines}` : ""}
    ${links ? `<div style="margin-top:10px;font-size:13px;">${links}</div>` : ""}
  </td></tr>
  <tr><td style="padding:14px 24px;border-top:1px solid ${LINE};background:#f7f9fb;">
    <p style="margin:0 0 8px;font-size:12px;color:#2f7d4f;font-style:italic;">"Print this mail only if absolutely necessary. Save Paper!! Save Trees!!"</p>
    <p style="margin:0;font-size:11px;line-height:1.5;color:${MUTED};">Disclaimer: This e-mail may contain confidential and/or legally privileged information and is meant for the intended recipient only. If you have received this e-mail in error and are not the intended recipient, kindly notify us${disclaimerContact} and then delete this e-mail immediately from your system. You are also hereby notified that any use, any form of reproduction, dissemination, copying, disclosure, modification, distribution and/or publication of this e-mail, its contents or its attachment/s other than by its intended recipient is strictly prohibited and may be unlawful.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function renderText({ title, greeting, blocks }) {
  const sig = ["With kind regards", "O/o Membership Section", ORG_NAME, CONTACT.email, CONTACT.phone ? `Contact: ${CONTACT.phone}` : ""]
    .filter(Boolean)
    .join("\n");
  const links = linksRow()
    .map((l) => `${l.label}: ${l.url}`)
    .join("\n");
  return [
    title.toUpperCase(),
    `Dear ${greeting},`,
    ...blocks.map(blockText),
    sig,
    links,
    '"Print this mail only if absolutely necessary. Save Paper!! Save Trees!!"',
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function send({ to, subject, title, greeting, blocks, attachments = [], devNote = "" }) {
  if (!transporter) {
    const names = attachments.map((a) => a.filename).join(", ") || "none";
    console.log(`[EMAIL - not sent, email is in log mode] To: ${to} | ${subject} | Attachments: ${names}${devNote ? ` | ${devNote}` : ""}`);
    if (PREVIEW_DIR) savePreview({ to, subject, html: renderHtml({ title, greeting, blocks }), attachments });
    return { simulated: true };
  }
  const info = await transporter.sendMail({
    from: `${FROM_NAME} <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject,
    html: renderHtml({ title, greeting, blocks }),
    text: renderText({ title, greeting, blocks }),
    attachments,
  });
  return { simulated: false, messageId: info.messageId };
}

// ---------- Helpers ----------
function greetingFor(person) {
  return person.membershipType === "INSTITUTIONAL" && person.contactPerson ? person.contactPerson : person.name;
}

function detailsRows(member) {
  const type = MEMBERSHIP_TYPES[member.membershipType];
  const validTill = member.expiryDate ? dottedDate(member.expiryDate) : "Lifetime";
  return [
    ["Membership ID", member.membershipId],
    ["Membership Type", type ? type.shortLabel : member.membershipType],
    ["Date of Registration", dottedDate(member.joinDate)],
    ["Valid Till", validTill],
    ["Renewal Date", member.expiryDate ? dottedDate(member.expiryDate) : ""],
  ];
}

const contactLine = () =>
  CONTACT.email
    ? p(`If you have any questions or require assistance, please contact us at ${CONTACT.email}.`)
    : p("If you have any questions or require assistance, please contact the membership office.");

const accountUrl = () => `${FRONTEND_URL}/account`;

// ---------- Emails ----------

// kind: "welcome" (new member), "renewal" or "resend".
// payment: the payment entry whose receipt should be attached (welcome / renewal).
async function sendCardEmail(member, kind = "welcome", { payment = null } = {}) {
  const intros = {
    welcome: {
      subject: `Your ${ORG_CODE} Membership ID Card`,
      text: `Thank you for becoming a member of ${ORG_NAME}. Please find your membership ID card attached to this email.`,
    },
    renewal: {
      subject: `Your ${ORG_CODE} Membership has been renewed`,
      text: `Thank you for renewing your membership of ${ORG_NAME}. Please find your updated membership ID card attached to this email.`,
    },
    resend: {
      subject: `Your ${ORG_CODE} Membership ID Card`,
      text: "Please find your membership ID card attached to this email.",
    },
  };
  const intro = intros[kind] || intros.resend;

  const attachments = [
    { filename: `${ORG_CODE}-ID-Card-${member.membershipId}.pdf`, content: await generateIdCard(member), contentType: "application/pdf" },
  ];
  if (payment && payment.receiptNo) {
    attachments.push({
      filename: `Receipt-${payment.receiptNo.replace(/\//g, "-")}.pdf`,
      content: await generateReceipt(member, payment),
      contentType: "application/pdf",
    });
  }

  const blocks = [
    p(intro.text),
    table(detailsRows(member)),
    p("The attachment contains the front and back of your ID card. For the best viewing experience, we recommend:"),
    list([
      "Downloading the attachment to your device",
      "Opening it with a PDF viewer to ensure the highest quality",
      "Printing the card on photo paper, if needed",
    ]),
    ...(payment && payment.receiptNo ? [p(`The receipt for your payment (No. ${payment.receiptNo}) is also attached.`)] : []),
    p(
      "Please keep your ID card safe and carry it with you when attending organizational programmes. You may save it digitally on your mobile device or print it for physical use."
    ),
    p("You can download your ID card and receipts, update your contact details and renew your membership from your member account:"),
    button("Go to my member account", accountUrl()),
    contactLine(),
  ];

  return send({ to: member.email, subject: intro.subject, title: "Membership ID Card", greeting: greetingFor(member), blocks, attachments });
}

async function sendReminderEmail(member, daysLeft) {
  const when = daysLeft <= 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
  const expiry = dottedDate(member.expiryDate);
  return send({
    to: member.email,
    subject: `${ORG_CODE} Membership renewal reminder – expires on ${expiry}`,
    title: "Membership Renewal Reminder",
    greeting: greetingFor(member),
    blocks: [
      p(`This is a reminder that your membership of ${ORG_NAME} expires ${when}, on ${expiry}.`),
      table(detailsRows(member)),
      p("You can renew online from your member account. Log in with your registered email address; we will send you a one-time code."),
      button("Renew my membership", accountUrl()),
      contactLine(),
    ],
  });
}

// One-time code for joining (purpose JOIN) or logging in (purpose LOGIN).
async function sendCodeEmail(email, codeValue, purpose, minutes) {
  const joining = purpose === "JOIN";
  return send({
    to: email,
    subject: joining ? `${codeValue} is your ${ORG_CODE} email verification code` : `${codeValue} is your ${ORG_CODE} member login code`,
    title: joining ? "Email Verification" : "Member Login",
    greeting: joining ? "Applicant" : "Member",
    blocks: [
      p(joining ? `Use this code to verify your email address for your ${ORG_NAME} membership application:` : "Use this code to log in to your member account:"),
      code(codeValue),
      p(`The code is valid for ${minutes} minutes. Do not share it with anyone. If you did not request it, you can ignore this email.`),
    ],
    devNote: `code ${codeValue}`,
  });
}

async function sendPaymentIncompleteEmail(application) {
  const type = MEMBERSHIP_TYPES[application.membershipType];
  return send({
    to: application.email,
    subject: `Your ${ORG_CODE} membership payment was not completed`,
    title: "Membership Payment Not Completed",
    greeting: greetingFor(application),
    blocks: [
      p(`Your application for ${type ? type.label : "membership"} was approved, but the payment was not completed. No membership has been issued yet.`),
      p(
        `Your approved application is kept for ${PENDING_APPLICATION_DAYS} days from the date of approval. To complete your membership, open the link below, verify your email address and continue to payment. You will not need to fill the form again.`
      ),
      button("Complete my payment", `${FRONTEND_URL}/join?continue=1`),
      p("If money was deducted from your account, please do not pay again. Contact us with the transaction details and we will check it for you."),
      contactLine(),
    ],
  });
}

// ---------- Application review ----------

function applicationRows(application) {
  const type = MEMBERSHIP_TYPES[application.membershipType];
  return [
    ["Applicant", application.name],
    ["Membership Type", type ? type.label : application.membershipType],
    ["Fee", type ? `Rs. ${type.fee}` : ""],
    ["Date of Application", dottedDate(application.createdAt || new Date())],
  ];
}

// To the applicant, right after they submit the form.
// paid: the fee was paid online before the form (pay-first flow).
async function sendApplicationReceivedEmail(application, { paid = false } = {}) {
  return send({
    to: application.email,
    subject: `Your ${ORG_CODE} membership application has been received`,
    title: "Membership Application Received",
    greeting: greetingFor(application),
    blocks: [
      p(`Thank you for applying for membership of ${ORG_NAME}. We have received your ${paid ? "payment, " : ""}application and documents.`),
      table(applicationRows(application)),
      p(
        paid
          ? "Your application will now be reviewed by the Membership Section. Once it is approved, your membership number, ID card and payment receipt will be emailed to you. If it is not approved, we will contact you about a refund."
          : "Your application will now be reviewed by the Membership Section. You do not need to pay anything yet. We will email you once it has been reviewed; if it is approved, the email will have a link to pay the membership fee online."
      ),
      contactLine(),
    ],
  });
}

// To the membership office: a new application is waiting for review.
async function sendNewApplicationAdminEmail(application) {
  if (!ADMIN_NOTIFY_EMAIL) return { simulated: true };
  return send({
    to: ADMIN_NOTIFY_EMAIL,
    subject: `New membership application: ${application.name}`,
    title: "New Membership Application",
    greeting: "Membership Section",
    blocks: [
      p("A new membership application has been submitted and is waiting for your review."),
      table([...applicationRows(application), ["Email", application.email], ["WhatsApp", application.whatsapp]]),
      button("Review the application", `${FRONTEND_URL}/admin/applications/${application._id}`),
    ],
  });
}

// To the applicant: approved, please pay.
async function sendApplicationApprovedEmail(application) {
  return send({
    to: application.email,
    subject: `Your ${ORG_CODE} membership application has been approved`,
    title: "Membership Application Approved",
    greeting: greetingFor(application),
    blocks: [
      p(`We are pleased to inform you that your application for membership of ${ORG_NAME} has been approved.`),
      table(applicationRows(application)),
      p(
        `To complete your membership, please pay the membership fee within ${PENDING_APPLICATION_DAYS} days. Open the link below, verify your email address with the one-time code we send you, and continue to payment. Your membership number and ID card will be emailed to you as soon as the payment is confirmed.`
      ),
      button("Pay the membership fee", `${FRONTEND_URL}/join?continue=1`),
      contactLine(),
    ],
  });
}

// To the applicant: not approved, with the reason given by the admin.
// paid: the applicant paid online before applying; their payment is refunded unless they reapply.
async function sendApplicationRejectedEmail(application, reason, { paid = false } = {}) {
  return send({
    to: application.email,
    subject: `Your ${ORG_CODE} membership application`,
    title: "Membership Application",
    greeting: greetingFor(application),
    blocks: [
      p(`Thank you for your interest in ${ORG_NAME}. After review, we are unable to approve your membership application at this time.`),
      ...(reason ? [table([["Reason", reason]])] : []),
      p(
        paid
          ? "Your uploaded documents have been deleted from our records. Your membership fee payment is kept for now."
          : "No payment has been taken. Your uploaded documents have been deleted from our records."
      ),
      p(
        paid
          ? `If you can provide the correct information, open ${FRONTEND_URL}/join, verify your email address and submit a new application. You will not need to pay again. Otherwise, please contact us and we will refund your payment.`
          : "If you believe this is a mistake, or you can provide the missing information, you are welcome to submit a new application."
      ),
      contactLine(),
    ],
  });
}

// Wraps an email call so a mail failure never fails the main action.
async function trySend(fn) {
  try {
    const r = await fn();
    return { sent: true, simulated: !!r.simulated };
  } catch (err) {
    console.error("[EMAIL] Failed:", err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = {
  sendCardEmail,
  sendReminderEmail,
  sendCodeEmail,
  sendPaymentIncompleteEmail,
  sendApplicationReceivedEmail,
  sendNewApplicationAdminEmail,
  sendApplicationApprovedEmail,
  sendApplicationRejectedEmail,
  trySend,
  EMAIL_LOG_ONLY: LOG_ONLY,
};
