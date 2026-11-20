const crypto = require("crypto");
const Admin = require("./Admin");

const SESSION_HOURS = 12;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

async function requireAdmin(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ message: "Please log in." });
  const admin = await Admin.findOne({
    sessionTokenHash: hashToken(token),
    sessionExpiresAt: { $gt: new Date() },
  });
  if (!admin) return res.status(401).json({ message: "Your session has expired. Please log in again." });
  req.admin = admin;
  next();
}

module.exports = { requireAdmin, hashToken, bearerToken, SESSION_HOURS };
