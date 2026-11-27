// Text shown on the public website. Edit freely — no code changes needed elsewhere.
// Source: "Membership of the Society.docx".

module.exports = {
  // Introduction at the top of the home page.
  about:
    "Membership of the Asiatic Society for Social Science Research and its components are governed by the latest Memorandum of Association and the Rules and Regulations of the Society. As per the norms, membership is open to any person of repute and good conduct who has attained the age of majority and fulfils the terms and conditions of the Society, subject to the approval of the Governing Body.",

  // "Rights and Facilities of Members" on the home page.
  benefits: [
    "Attendance at the academic sessions of the Society, and access to its journal facilities and other services.",
    "Participation in the activities of the Deccan History Congress and other conferences / seminars.",
  ],

  // Text above the categories table on the home page.
  feesNote:
    "Fees are prescribed as per the norms and may be revised by the Governing Body from time to time. All amounts are in Indian Rupees and are payable together with applicable taxes. A one-time admission charge of ₹100 plus applicable taxes is also levied on every incoming member.",

  // Who can join each plan (the "Eligibility" column).
  eligibility: {
    ANNUAL: "Any individual, on payment of the prescribed fee",
    LIFE: "Any individual, on payment of the prescribed fee",
    INSTITUTIONAL: "Any institution, organisation or professional body holding a valid Certificate of Registration or GST",
  },

  // Terms and conditions: shown on the home page and accepted on the join form.
  // `items` (optional) are shown as a lettered list under the text.
  terms: [
    { title: "Admission", text: "Admission to membership is subject to the approval of the Governing Body. Where an application is refused, the reasons for refusal shall be communicated to the applicant." },
    { title: "Induction and debarment", text: "Members are inducted or debarred by decision of the Governing Body, unless the decision is revoked by the Founding Member. Any dispute about the induction or debarment of a member shall be settled by majority decision of the Founding Member, and that decision shall be final." },
    { title: "Scope of membership", text: "Membership is limited to the Society. It confers no rights over the Components of the Society, except the Deccan History Congress." },
    { title: "Voting rights", text: "Annual Members have no voting rights, may not contest elections to the Governing Body, and have no rights in the decision-making of the Society. Life Members and Institutional Members may vote but may not contest elections to the Governing Body." },
    {
      title: "Termination",
      text: "The Governing Body may terminate membership upon:",
      items: [
        "the death or insanity of the member;",
        "non-payment of the subscription from the due date;",
        "the written resignation of the member; or",
        "absence from five consecutive meetings of the General Body without intimation.",
      ],
    },
    { title: "Appeals", text: "All appeals shall be referred to the Governing Body, whose decision shall be final." },
    { title: "Re-admission", text: "A member whose membership has been terminated may be re-admitted upon payment of all dues to the Society, at the final discretion of the Governing Body." },
    { title: "Declaration", text: "By submitting an application, the applicant declares that all information and documents furnished are true and valid, and agrees to be bound by the Memorandum of Association and the Rules and Regulations of the Society, as amended from time to time." },
  ],

  // "Components of the Society" on the home page.
  componentsIntro: "Under the Clauses of the Memorandum of Association and Rule, the following are Components of the Society.",
  components: [
    { short: "ASSSR", name: "Asiatic Society for Social Science Research", text: "The parent body, constituted under the Societies Registration Act, 1860, with an all-India area of operation. Its object is to promote and coordinate research in the social sciences." },
    { short: "VMI", name: "Varāhamihira Multidisciplinary Institute", text: "A Component of the Society, set up to carry out the Society's objects in multidisciplinary teaching, research and training." },
    { short: "DHC", name: "Deccan History Congress", text: "A Component of the Society, serving as a forum for academic exchange through annual sessions, conferences and seminars." },
    { short: "JASSSR", name: "Journal of Asiatic Society for Social Science Research", text: "A Component of the Society that provides a publishing platform for original research in the social sciences." },
  ],
};
