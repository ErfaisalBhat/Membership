const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const UPLOAD_DIR = path.resolve(__dirname, "..", process.env.UPLOAD_DIR || "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const IMAGE = ["image/jpeg", "image/png"];
const IMAGE_OR_PDF = [...IMAGE, "application/pdf"];

const DOCUMENT_FIELDS = {
  photo: { label: "Passport size photograph", types: IMAGE },
  signature: { label: "Signature", types: IMAGE },
  idProof: { label: "Valid ID card", types: IMAGE_OR_PDF },
  studentId: { label: "Student ID card", types: IMAGE_OR_PDF },
};

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf" };
const MAX_FILE_MB = 5;

class UploadError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + (EXT[file.mimetype] || "")),
  }),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 4, fields: 5 },
  fileFilter: (req, file, cb) => {
    const field = DOCUMENT_FIELDS[file.fieldname];
    if (!field) return cb(new UploadError(`Unexpected file field "${file.fieldname}".`));
    if (!field.types.includes(file.mimetype)) {
      const allowed = field.types.includes("application/pdf") ? "a JPG, PNG or PDF file" : "a JPG or PNG image";
      return cb(new UploadError(`${field.label} must be ${allowed}.`));
    }
    cb(null, true);
  },
});

const memberUpload = upload.fields(Object.keys(DOCUMENT_FIELDS).map((name) => ({ name, maxCount: 1 })));

// { photo: [file] } -> { photo: file }
function pickFiles(reqFiles) {
  const out = {};
  for (const key of Object.keys(DOCUMENT_FIELDS)) {
    if (reqFiles && reqFiles[key] && reqFiles[key][0]) out[key] = reqFiles[key][0];
  }
  return out;
}

// The browser-supplied type can lie, so check the first bytes of each file.
const MAGIC = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "application/pdf": [0x25, 0x50, 0x44, 0x46],
};

async function checkFileContents(files) {
  const errors = {};
  for (const [key, file] of Object.entries(files)) {
    const expected = MAGIC[file.mimetype];
    const fh = await fs.promises.open(file.path, "r");
    try {
      const buf = Buffer.alloc(4);
      await fh.read(buf, 0, 4, 0);
      if (!expected || !expected.every((b, i) => buf[i] === b)) {
        errors[`documents.${key}`] = `${DOCUMENT_FIELDS[key].label} is not a valid ${file.mimetype.split("/")[1].toUpperCase()} file.`;
      }
    } finally {
      await fh.close();
    }
  }
  return errors;
}

function toStoredFile(file) {
  return { filename: file.filename, originalName: file.originalname, mimeType: file.mimetype, size: file.size };
}

function filePath(filename) {
  // Stored names are random hex + extension; basename() guards against traversal anyway.
  return path.join(UPLOAD_DIR, path.basename(filename));
}

async function removeStoredFiles(filenames) {
  await Promise.all(
    filenames.filter(Boolean).map((f) => fs.promises.unlink(filePath(f)).catch(() => {}))
  );
}

async function removeUploaded(files) {
  await removeStoredFiles(Object.values(files).map((f) => f.filename));
}

module.exports = {
  memberUpload,
  pickFiles,
  checkFileContents,
  toStoredFile,
  filePath,
  removeStoredFiles,
  removeUploaded,
  DOCUMENT_FIELDS,
  MAX_FILE_MB,
};
