const crypto = require("crypto");
const fs = require("fs");
const { DigilockerError } = require("../errors");

// Cashfree Secure ID — DigiLocker (Aadhaar). Docs:
// https://www.cashfree.com/docs/api-reference/vrs/v2/digilocker/digilocker-integration
//
// .env:
//   CASHFREE_VERIFY_CLIENT_ID       from the Cashfree Secure ID (Verification) dashboard
//   CASHFREE_VERIFY_CLIENT_SECRET
//   CASHFREE_VERIFY_ENV             sandbox (default) or production
//   CASHFREE_VERIFY_PUBLIC_KEY_PATH optional: only if 2FA is set to "Public Key" in the dashboard.
//                                   Otherwise whitelist the server's IP address in the dashboard.

const TIMEOUT_MS = 15000;

const env = () => ((process.env.CASHFREE_VERIFY_ENV || "sandbox").trim().toLowerCase() === "production" ? "production" : "sandbox");
const baseUrl = () => (env() === "production" ? "https://api.cashfree.com/verification" : "https://sandbox.cashfree.com/verification");

function signature() {
  const keyPath = process.env.CASHFREE_VERIFY_PUBLIC_KEY_PATH;
  if (!keyPath) return null;
  // RSA-OAEP encryption of "<clientId>.<unix timestamp>" with the public key from the dashboard.
  const key = fs.readFileSync(keyPath, "utf8");
  const plain = `${process.env.CASHFREE_VERIFY_CLIENT_ID}.${Math.floor(Date.now() / 1000)}`;
  return crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(plain)).toString("base64");
}

// Any network error, timeout or unexpected reply from Cashfree is "UNAVAILABLE":
// the applicant then fills the form by hand.
async function call(method, path, body) {
  const headers = {
    "x-client-id": process.env.CASHFREE_VERIFY_CLIENT_ID,
    "x-client-secret": process.env.CASHFREE_VERIFY_CLIENT_SECRET,
  };
  const sig = signature();
  if (sig) headers["x-cf-signature"] = sig;
  if (body) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(baseUrl() + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new DigilockerError("UNAVAILABLE", `Cashfree not reachable: ${err.message}`);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status, data: data || {} };
}

function fail(what, r) {
  const detail = `${what}: HTTP ${r.status} ${r.data.code || ""} ${r.data.message || ""}`.trim();
  // These mean the session is over rather than Cashfree being down.
  if (r.data.code === "url_expired" || r.data.code === "session_expired") return new DigilockerError("EXPIRED", detail);
  if (r.data.code === "consent_not_granted") return new DigilockerError("DENIED", detail);
  return new DigilockerError("UNAVAILABLE", detail);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  name: "cashfree",

  problem() {
    if (!process.env.CASHFREE_VERIFY_CLIENT_ID || !process.env.CASHFREE_VERIFY_CLIENT_SECRET) {
      return "Cashfree DigiLocker keys are not set (CASHFREE_VERIFY_CLIENT_ID / CASHFREE_VERIFY_CLIENT_SECRET).";
    }
    if (!/^https:\/\//.test(process.env.FRONTEND_URL || "")) {
      return "DigiLocker needs the website on https (FRONTEND_URL must start with https://).";
    }
    return null;
  },

  async createUrl({ verificationId, redirectUrl, purpose, companyName }) {
    const r = await call("POST", "/digilocker", {
      verification_id: verificationId,
      document_requested: ["AADHAAR"],
      redirect_url: redirectUrl,
      purpose,
      company_name: companyName,
    });
    if (r.status !== 200 || !r.data.url) throw fail("Create URL", r);
    return { url: r.data.url };
  },

  // Returns the raw Aadhaar document from Cashfree, or throws a DigilockerError.
  async fetchAadhaar(verificationId) {
    const q = `verification_id=${encodeURIComponent(verificationId)}`;
    const s = await call("GET", `/digilocker?${q}`);
    if (s.status !== 200) throw fail("Get status", s);
    const status = s.data.status;
    if (status === "CONSENT_DENIED") throw new DigilockerError("DENIED", "Consent denied");
    if (status === "EXPIRED") throw new DigilockerError("EXPIRED", "URL expired");
    if (status !== "AUTHENTICATED") throw new DigilockerError("PENDING", `Status ${status}`);
    if (s.data.user_details && s.data.user_details.eaadhaar === "N") throw new DigilockerError("NOT_LINKED", "e-Aadhaar not in DigiLocker");

    // 202 = Cashfree is still fetching the document; try a few times.
    for (let attempt = 0; attempt < 4; attempt++) {
      const d = await call("GET", `/digilocker/document/AADHAAR?${q}`);
      if (d.status === 202) {
        await sleep(2000);
        continue;
      }
      if (d.status !== 200) throw fail("Get document", d);
      if (d.data.status === "AADHAAR_NOT_LINKED") throw new DigilockerError("NOT_LINKED", "Aadhaar not linked");
      if (d.data.status !== "SUCCESS") throw new DigilockerError("UNAVAILABLE", `Document status ${d.data.status}`);
      return d.data;
    }
    throw new DigilockerError("UNAVAILABLE", "Document still processing after several tries");
  },
};
