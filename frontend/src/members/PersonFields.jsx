import INDIAN_STATES from "../shared/indianStates";
import { getIn } from "../shared/formState";
import { formatBytes } from "../shared/format";
import { Field, Section, inputClass } from "../ui/form";

// The applicant's details, in the order of the membership form:
// basic credentials, current address, institution of affiliation, document uploads.
// Used by the admin add/edit form and the public join form.

const DOCS = {
  photo: { label: "Passport size photograph", accept: "image/jpeg,image/png", hint: "JPG or PNG, up to 5 MB. Printed on the ID card." },
  signature: { label: "Signature", accept: "image/jpeg,image/png", hint: "JPG or PNG, up to 5 MB. Printed on the ID card." },
  idProof: { label: "Valid ID card", accept: "image/jpeg,image/png,application/pdf", hint: "JPG, PNG or PDF, up to 5 MB." },
  studentId: { label: "Student ID card", accept: "image/jpeg,image/png,application/pdf", hint: "JPG, PNG or PDF, up to 5 MB." },
};

export default function PersonFields({
  form,
  set,
  errors,
  config,
  files,
  pickFile,
  existingDocs = {},
  lockedEmail = "", // join form: the verified email, shown read-only
  documentsNote = "Documents are stored privately and are only visible to the membership office.",
}) {
  const type = form.membershipType;
  const isStudent = type === "STUDENT";
  const isInstitution = type === "INSTITUTIONAL";
  const affiliated = isStudent || form.affiliated === "Yes";

  // Called as functions (not components) so inputs keep focus while typing.
  const text = (path, label, { required = true, type: inputType = "text", hint, maxLength, placeholder, autoComplete, className, inputMode } = {}) => {
    const value = getIn(form, path) ?? "";
    const counter = maxLength ? `${String(value).length}/${maxLength} characters` : null;
    return (
      <Field label={label} htmlFor={path} required={required} error={errors[path]} hint={hint || counter} className={className}>
        <input
          id={path}
          type={inputType}
          className={inputClass(errors[path])}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete={autoComplete || "off"}
          inputMode={inputMode}
          onChange={(e) => set(path, e.target.value)}
        />
      </Field>
    );
  };

  const select = (path, label, options, { required = true, className } = {}) => (
    <Field label={label} htmlFor={path} required={required} error={errors[path]} className={className}>
      <select id={path} className={inputClass(errors[path])} value={getIn(form, path) ?? ""} onChange={(e) => set(path, e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );

  const fileField = (key) => {
    const doc = DOCS[key];
    const existing = existingDocs[key];
    const errKey = `documents.${key}`;
    return (
      <Field
        key={key}
        label={doc.label}
        htmlFor={errKey}
        required={!existing}
        error={errors[errKey]}
        hint={existing && !files[key] ? `Uploaded: ${existing.originalName}. Choose a file only to replace it.` : doc.hint}
      >
        <input
          id={errKey}
          type="file"
          accept={doc.accept}
          onChange={(e) => pickFile(key, e.target.files[0])}
          className={`block w-full rounded-md border bg-white text-sm text-slate-700 file:mr-3 file:border-0 file:border-r file:border-slate-200 file:bg-slate-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-50 ${
            errors[errKey] ? "border-red-400" : "border-slate-300"
          }`}
        />
        {files[key] && (
          <p className="mt-1 text-xs text-slate-600">
            Selected: {files[key].name} ({formatBytes(files[key].size)})
          </p>
        )}
      </Field>
    );
  };

  return (
    <>
      <Section title="Basic credentials">
        {lockedEmail ? (
          <Field label="Email" htmlFor="email" hint="Verified. Your ID card will be sent to this address.">
            <input id="email" className={inputClass()} value={lockedEmail} disabled />
          </Field>
        ) : (
          text("email", "Email", { type: "email" })
        )}
        {text("whatsapp", "WhatsApp number", { type: "tel", inputMode: "numeric", placeholder: "10-digit mobile number" })}
        {text("name", isInstitution ? "Institution name" : "Name", { className: "sm:col-span-2", hint: isInstitution ? undefined : "As it should appear on the ID card." })}
        {isInstitution ? (
          text("contactPerson", "Authorized contact person")
        ) : (
          <>
            {text("motherName", "Mother's name")}
            {text("fatherName", "Father's name")}
            {select("gender", "Gender", config.genders)}
            {text("dob", "Date of birth", { type: "date", hint: "Must be 18 or older." })}
          </>
        )}
      </Section>

      <Section title="Current address">
        {text("address.line1", "Address line 1", { maxLength: 30, className: "sm:col-span-2" })}
        {text("address.line2", "Address line 2", { maxLength: 30, required: false, className: "sm:col-span-2" })}
        {text("address.city", "City")}
        {select("address.state", "State", INDIAN_STATES)}
        {text("address.pincode", "PIN code", { inputMode: "numeric", maxLength: 6 })}
      </Section>

      <Section title="Institution of affiliation">
        <Field label="Are you affiliated to any institute?" htmlFor="affiliated" required hint={isStudent ? "Student members must be affiliated." : undefined}>
          <select id="affiliated" className={inputClass()} value={affiliated ? "Yes" : "No"} disabled={isStudent} onChange={(e) => set("affiliated", e.target.value)}>
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </Field>
        {affiliated && (
          <>
            {isStudent ? (
              <>
                {text("affiliation.course", "Course")}
                {text("affiliation.semester", "Semester")}
              </>
            ) : (
              text("affiliation.designation", "Designation")
            )}
            {text("affiliation.department", "Department")}
            {text("affiliation.institution", "University / Institution / Organization", { className: "sm:col-span-2" })}
            {select("affiliation.state", "State", INDIAN_STATES)}
          </>
        )}
      </Section>

      <Section title="Document uploads" description={documentsNote}>
        {fileField("photo")}
        {fileField("signature")}
        {select("idProofType", "Type of ID card", config.idProofTypes)}
        {fileField("idProof")}
        {isStudent && fileField("studentId")}
        {form.idProofType === "Aadhaar" && (
          <p className="text-xs text-amber-700 sm:col-span-2">
            For Aadhaar, please upload a masked copy (only the last 4 digits visible), as UIDAI recommends.
          </p>
        )}
      </Section>
    </>
  );
}
