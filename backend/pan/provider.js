const crypto = require("crypto");
const fs = require("fs");

// PAN verification for the Institutional join form, picked by PAN_PROVIDER in .env:
//
//   PAN_PROVIDER=cashfree   Cashfree Secure ID "Verify PAN" — same keys as DigiLocker
//                           (CASHFREE_VERIFY_CLIENT_ID / _SECRET / _ENV / _PUBLIC_KEY_PATH)
//   PAN_PROVIDER=test       fake PAN check for trying the form locally (refused in production)
//   (empty)                 switched off: the PAN is typed by hand and checked by the office
//
// Every provider exports name, problem() and verify(pan) ->
//   { valid, registeredName, panType, status, message }   or throws PanServiceError.

class PanServiceError extends Error {}

const TIMEOUT_MS = 15000;
const baseUrl = () =>
  (process.env.CASHFREE_VERIFY_ENV || "sandbox").trim().toLowerCase() === "production"
    ? "https://api.cashfree.com/verification"
    : "https://sandbox.cashfree.com/verification";

function signature() {
  const keyPath = process.env.CASHFREE_VERIFY_PUBLIC_KEY_PATH;
  if (!keyPath) return null;
  const key = fs.readFileSync(keyPath, "utf8");
  const plain = `${process.env.CASHFREE_VERIFY_CLIENT_ID}.${Math.floor(Date.now() / 1000)}`;
  return crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(plain)).toString("base64");
}

const cashfree = {
  name: "cashfree",
  problem() {
    if (!process.env.CASHFREE_VERIFY_CLIENT_ID || !process.env.CASHFREE_VERIFY_CLIENT_SECRET) {
      return "Cashfree keys are not set (CASHFREE_VERIFY_CLIENT_ID / CASHFREE_VERIFY_CLIENT_SECRET).";
    }
    return null;
  },
  // https://www.cashfree.com/docs/api-reference/vrs/v2/pan/verify-pan-sync
  async verify(pan) {
    const headers = {
      "Content-Type": "application/json",
      "x-client-id": process.env.CASHFREE_VERIFY_CLIENT_ID,
      "x-client-secret": process.env.CASHFREE_VERIFY_CLIENT_SECRET,
    };
    const sig = signature();
    if (sig) headers["x-cf-signature"] = sig;
    let res;
    let data = {};
    try {
      res = await fetch(baseUrl() + "/pan", { method: "POST", headers, body: JSON.stringify({ pan }), signal: AbortSignal.timeout(TIMEOUT_MS) });
      data = (await res.json().catch(() => null)) || {};
    } catch (err) {
      throw new PanServiceError(`Cashfree not reachable: ${err.message}`);
    }
    if (res.status !== 200) throw new PanServiceError(`Verify PAN: HTTP ${res.status} ${data.code || ""} ${data.message || ""}`.trim());
    return {
      valid: data.valid === true,
      registeredName: String(data.registered_name || data.name_pan_card || "").trim(),
      panType: String(data.type || "").trim(),
      status: String(data.pan_status || "").trim(),
      message: String(data.message || "").trim(),
    };
  },
};

const test = {
  name: "test",
  problem() {
    return process.env.NODE_ENV === "production" ? "Test PAN check cannot be used when NODE_ENV=production." : null;
  },
  // Any well-formed PAN is valid; the name is made up from it.
  async verify(pan) {
    if (process.env.PAN_TEST_FAIL === "1") throw new PanServiceError("Test: PAN_TEST_FAIL=1");
    return { valid: true, registeredName: `TEST INSTITUTION ${pan.slice(0, 5)}`, panType: "", status: "VALID", message: "PAN verified successfully" };
  },
};

const providers = { cashfree, test };
const NAME = (process.env.PAN_PROVIDER || "").trim().toLowerCase();

const panProvider = () => providers[NAME] || null;

function panProviderProblem() {
  if (!NAME) return "PAN verification is not switched on.";
  if (!panProvider()) return `Unknown PAN_PROVIDER "${NAME}".`;
  return panProvider().problem();
}

module.exports = { panProvider, panProviderProblem, PanServiceError };
