// Creates the admin account, or resets its password if it already exists.
// Usage: npm run create-admin -- <username> <password>
require("dotenv").config({ quiet: true });
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Admin = require("./Admin");

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error("Usage: npm run create-admin -- <username> <password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  await connectDB();
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await Admin.findOne({ username: username.toLowerCase() });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.sessionTokenHash = null;
    existing.sessionExpiresAt = null;
    await existing.save();
    console.log(`Password reset for admin "${existing.username}".`);
  } else {
    await Admin.create({ username, passwordHash });
    console.log(`Admin "${username.toLowerCase()}" created.`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
