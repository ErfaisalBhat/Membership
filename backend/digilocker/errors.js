// kind: why DigiLocker did not give us the Aadhaar details.
//   UNAVAILABLE  Cashfree / DigiLocker down, misconfigured or out of balance
//   DENIED       the student clicked "Deny" on the consent screen
//   EXPIRED      the 10-minute DigiLocker link ran out
//   PENDING      the student came back without finishing
//   NOT_LINKED   no Aadhaar in the student's DigiLocker
class DigilockerError extends Error {
  constructor(kind, detail) {
    super(detail || kind);
    this.kind = kind;
  }
}

// What the student is told. In every case they can still fill the form by hand.
const MESSAGES = {
  UNAVAILABLE: "DigiLocker verification is not available right now.",
  DENIED: "You did not allow access to your Aadhaar in DigiLocker.",
  EXPIRED: "The DigiLocker session expired before it was completed (it lasts 10 minutes).",
  PENDING: "The DigiLocker verification was not completed.",
  NOT_LINKED: "Your Aadhaar is not available in your DigiLocker account.",
};

module.exports = { DigilockerError, MESSAGES };
