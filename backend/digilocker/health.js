const { digilockerProvider, digilockerProblem } = require("./provider");

// Is DigiLocker usable right now? The join page asks before showing the DigiLocker screen,
// so when Cashfree is down (or out of balance, or the keys/IP are refused) applicants go
// straight to the manual form instead of clicking a button that cannot work.
//
// The answer is cached so Cashfree is asked at most once a minute, and a failed
// DigiLocker start marks it down for a few minutes.

const OK_CACHE_MS = 60 * 1000;
const DOWN_CACHE_MS = 5 * 60 * 1000;

let cached = null; // { available, until }
let checking = null;

function markDown(reason) {
  cached = { available: false, until: Date.now() + DOWN_CACHE_MS };
  console.warn(`[DIGILOCKER] marked unavailable for 5 minutes: ${reason}`);
}

async function check() {
  if (digilockerProblem()) return false;
  const provider = digilockerProvider();
  if (!provider.ping) return true;
  try {
    return await provider.ping();
  } catch {
    return false;
  }
}

async function isAvailable() {
  if (digilockerProblem()) return false;
  if (cached && cached.until > Date.now()) return cached.available;
  if (!checking) {
    checking = check()
      .then((available) => {
        cached = { available, until: Date.now() + (available ? OK_CACHE_MS : DOWN_CACHE_MS) };
        if (!available) console.warn("[DIGILOCKER] Cashfree not reachable — applicants get the manual form.");
        return available;
      })
      .finally(() => {
        checking = null;
      });
  }
  return checking;
}

module.exports = { isAvailable, markDown };
