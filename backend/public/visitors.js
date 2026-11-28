const Counter = require("../members/Counter");
const { todayIST } = require("../shared/dates");

// "Online now" and "Visitors" shown at the bottom of the public website.
//
// Each browser sends a random id (kept in its localStorage) when a page opens and then every
// minute while the tab is open.
//   Online now: ids heard from in the last 2 minutes. Kept in memory, so it starts again at 0
//               after a restart (run one server process only, as for the rest of the app).
//   Visitors:   each id is counted once per day (IST), in the database counter "site-visitors".

const COUNTER = "site-visitors";
const ONLINE_MS = 2 * 60 * 1000;
const MAX_IDS = 20000; // memory cap if someone floods the endpoint

const lastSeen = new Map(); // id -> time last heard from
let countedDay = "";
const countedToday = new Set(); // ids already counted as a visitor today

const isVisitorId = (id) => typeof id === "string" && /^[a-f0-9]{32}$/.test(id);

async function ping(id) {
  const now = Date.now();
  for (const [key, t] of lastSeen) if (now - t > ONLINE_MS) lastSeen.delete(key);
  if (lastSeen.has(id) || lastSeen.size < MAX_IDS) lastSeen.set(id, now);

  const day = todayIST().toISOString().slice(0, 10);
  if (day !== countedDay) {
    countedDay = day;
    countedToday.clear();
  }

  let doc;
  if (!countedToday.has(id) && countedToday.size < MAX_IDS) {
    countedToday.add(id);
    doc = await Counter.findOneAndUpdate({ _id: COUNTER }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true }).lean();
  } else {
    doc = await Counter.findById(COUNTER).lean();
  }
  return { online: Math.max(1, lastSeen.size), visitors: doc ? doc.seq : 0 };
}

module.exports = { ping, isVisitorId };
