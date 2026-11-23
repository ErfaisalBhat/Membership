// Helpers for nested form state like { address: { city } }.

export const getIn = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

// Returns a copy with one nested value changed (React needs copies, not edits in place).
export function setIn(obj, path, value) {
  const [head, ...rest] = path.split(".");
  return { ...obj, [head]: rest.length ? setIn(obj[head] || {}, rest.join("."), value) : value };
}

export const emptyPerson = () => ({
  membershipType: "",
  name: "",
  contactPerson: "",
  email: "",
  whatsapp: "",
  motherName: "",
  fatherName: "",
  gender: "",
  dob: "",
  affiliated: "No",
  address: { line1: "", line2: "", city: "", state: "", pincode: "" },
  affiliation: { institution: "", department: "", designation: "", state: "" },
  idProofType: "",
  showInPublicList: false,
});
