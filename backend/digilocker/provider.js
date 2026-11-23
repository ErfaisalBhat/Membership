// Picks the DigiLocker (Aadhaar auto-fill) service from DIGILOCKER_PROVIDER in .env:
//
//   DIGILOCKER_PROVIDER=cashfree   Cashfree Secure ID — see providers/cashfree.js for its keys
//   DIGILOCKER_PROVIDER=test       fake DigiLocker for trying the form locally (refused in production)
//   (empty)                        switched off; everyone fills the form by hand
//
// Every provider exports:
//   name
//   problem()                                   null when ready, otherwise what is missing
//   createUrl({ verificationId, redirectUrl, purpose, companyName })  -> { url } to send the applicant to
//   fetchAadhaar(verificationId)                -> Cashfree's Aadhaar document (+ user_details), or throws DigilockerError
//   ping()                                      -> true when the service can be used right now

const providers = {
  cashfree: require("./providers/cashfree"),
  test: require("./providers/test"),
};

const NAME = (process.env.DIGILOCKER_PROVIDER || "").trim().toLowerCase();

function digilockerProvider() {
  return providers[NAME] || null;
}

function digilockerProblem() {
  if (!NAME) return "DigiLocker is not switched on.";
  const provider = digilockerProvider();
  if (!provider) return `Unknown DIGILOCKER_PROVIDER "${NAME}".`;
  return provider.problem();
}

module.exports = { digilockerProvider, digilockerProblem };
