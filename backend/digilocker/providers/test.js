// Fake DigiLocker for trying the join form on your own computer.
// "Continue with DigiLocker" comes straight back as if the student had given consent,
// with the sample Aadhaar details below. Refused in production.
//
// DIGILOCKER_TEST_FAIL=1 makes it behave as if Cashfree were down, to try the manual fallback.

const zlib = require("zlib");
const { DigilockerError } = require("../errors");

// A plain grey 120x150 PNG standing in for the Aadhaar photo.
function samplePhoto(w = 120, h = 150) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0xb0)]);
  const pixels = zlib.deflateSync(Buffer.concat(Array(h).fill(row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", pixels),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

const SAMPLE = {
  status: "SUCCESS",
  uid: "xxxxxxxx1234",
  name: "Test Student",
  dob: "15-08-2002",
  gender: "F",
  care_of: "D/O: Ramesh Kumar",
  photo_link: samplePhoto(),
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
  user_details: { mobile: "9876543210" },
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
