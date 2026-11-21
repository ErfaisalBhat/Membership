// Fake DigiLocker for trying the join form on your own computer.
// "Continue with DigiLocker" comes straight back as if the student had given consent,
// with the sample Aadhaar details below. Refused in production.
//
// DIGILOCKER_TEST_FAIL=1 makes it behave as if Cashfree were down, to try the manual fallback.

const { DigilockerError } = require("../errors");

const SAMPLE = {
  status: "SUCCESS",
  uid: "xxxxxxxx1234",
  name: "Test Student",
  dob: "15-08-2002",
  gender: "F",
  care_of: "D/O: Ramesh Kumar",
  split_address: {
    country: "India",
    house: "H No 12",
    street: "Gandhi Nagar Main Road",
    landmark: "Near Post Office",
    po: "Gandhi Nagar",
    vtc: "Lucknow",
    subdist: "Lucknow",
    dist: "Lucknow",
    state: "Uttar Pradesh",
    pincode: "226001",
  },
};

const failing = () => process.env.DIGILOCKER_TEST_FAIL === "1";

module.exports = {
  name: "test",

  problem() {
    if (process.env.NODE_ENV === "production") {
      return "Test DigiLocker cannot be used when NODE_ENV=production. Set DIGILOCKER_PROVIDER=cashfree.";
    }
    return null;
  },

  async ping() {
    return !failing();
  },

  async createUrl({ redirectUrl }) {
    if (failing()) throw new DigilockerError("UNAVAILABLE", "Test: DIGILOCKER_TEST_FAIL=1");
    return { url: redirectUrl };
  },

  async fetchAadhaar() {
    if (failing()) throw new DigilockerError("UNAVAILABLE", "Test: DIGILOCKER_TEST_FAIL=1");
    return SAMPLE;
  },
};
