// kind: why DigiLocker did not give us the Aadhaar details.
//   UNAVAILABLE  Cashfree / DigiLocker down, misconfigured or out of balance
//   DENIED       the applicant clicked "Deny" on the consent screen
//   EXPIRED      the 10-minute DigiLocker link ran out
//   PENDING      the applicant came back without finishing
//   NOT_LINKED   no Aadhaar in the applicant's DigiLocker
class DigilockerError extends Error {
  constructor(kind, detail) {
    super(detail || kind);
    this.kind = kind;
  }
}

// What the applicant is told. Only UNAVAILABLE (Cashfree down / out of credits) switches to the
// manual form, silently; for the others the applicant is asked to verify with DigiLocker again.
const MESSAGES = {
  UNAVAILABLE: "DigiLocker verification is not available right now.",
  DENIED: "You did not allow access to your Aadhaar in DigiLocker. Please try again and allow access.",
  EXPIRED: "The DigiLocker session expired before it was completed (it lasts 10 minutes). Please try again.",
  PENDING: "The DigiLocker verification was not completed. Please try again.",
  NOT_LINKED: "Your Aadhaar is not available in your DigiLocker account. Please add your Aadhaar in the DigiLocker app and try again.",
};

module.exports = { DigilockerError, MESSAGES };
