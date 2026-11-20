const cron = require("node-cron");
const Member = require("../members/Member");
const Application = require("../join/Application");
const PaymentOrder = require("../payments/PaymentOrder");
const { REMINDER_DAYS, PENDING_APPLICATION_DAYS } = require("../config/membership");
const { todayIST, addDays, daysBetween, isoDate } = require("../shared/dates");
const { sendReminderEmail, trySend } = require("../mail/mailer");
const { removeStoredFiles } = require("../documents/upload");

// Runs every night:
// 1. Marks memberships whose expiry date has passed as EXPIRED.
// 2. Emails a renewal reminder 30 and 7 days before expiry (once each).
//    If the server was down on the exact day, the reminder still goes out on the next run.
// 3. Closes online payments that were started but never finished (after 1 day).
// 4. Cancels approved online applications not paid within PENDING_APPLICATION_DAYS of approval
//    and deletes their documents.
async function runExpiryJob() {
  const today = todayIST();

  const expired = await Member.updateMany(
    { status: "ACTIVE", expiryDate: { $ne: null, $lt: today } },
    { $set: { status: "EXPIRED", statusReason: "Membership period ended" } }
  );

  const maxDays = Math.max(...REMINDER_DAYS);
  const dueSoon = await Member.find({
    status: "ACTIVE",
    expiryDate: { $gte: today, $lte: addDays(today, maxDays) },
  });

  let reminders = 0;
  for (const member of dueSoon) {
    const daysLeft = daysBetween(today, member.expiryDate);
    const applicable = REMINDER_DAYS.filter((d) => daysLeft <= d);
    const keys = applicable.map((d) => `${isoDate(member.expiryDate)}:${d}`);
    // Send only one email even if several thresholds were crossed at once.
    if (keys.every((k) => member.remindersSent.includes(k))) continue;

    const result = await trySend(() => sendReminderEmail(member, daysLeft));
    if (result.sent) {
      member.remindersSent = [...new Set([...member.remindersSent, ...keys])];
      await member.save();
      reminders++;
    }
  }

  const abandoned = await PaymentOrder.updateMany(
    { status: "CREATED", failureReason: "", createdAt: { $lt: new Date(Date.now() - 24 * 3600 * 1000) } },
    { $set: { status: "FAILED", failureReason: "Abandoned: no payment was received." } }
  );

  // Only approved-but-unpaid applications expire; ones waiting for review stay until the admin acts.
  const stale = await Application.find({
    status: "APPROVED",
    reviewedAt: { $lt: new Date(Date.now() - PENDING_APPLICATION_DAYS * 24 * 3600 * 1000) },
  });
  for (const application of stale) {
    application.status = "CANCELLED";
    application.cancelReason = `Not paid within ${PENDING_APPLICATION_DAYS} days of approval.`;
    await application.save();
    const docs = application.documents ? application.documents.toObject() : {};
    await removeStoredFiles(Object.values(docs).map((f) => f && f.filename));
  }

  console.log(
    `[NIGHTLY JOB] ${isoDate(today)}: ${expired.modifiedCount} marked expired, ${reminders} reminder(s) sent, ` +
      `${abandoned.modifiedCount} abandoned payment(s) closed, ${stale.length} old application(s) cancelled.`
  );
  return { expired: expired.modifiedCount, reminders, abandoned: abandoned.modifiedCount, cancelled: stale.length };
}

function startExpiryJob() {
  // Every day at 00:05 Indian time.
  cron.schedule("5 0 * * *", () => runExpiryJob().catch((e) => console.error("[NIGHTLY JOB] Failed:", e)), {
    timezone: "Asia/Kolkata",
  });
  // Also run once at startup, in case the server was off at midnight.
  runExpiryJob().catch((e) => console.error("[NIGHTLY JOB] Failed:", e));
}

module.exports = { startExpiryJob, runExpiryJob };
