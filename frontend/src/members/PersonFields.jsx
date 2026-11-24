import INDIAN_STATES from "../shared/indianStates";
import { getIn } from "../shared/formState";
import { formatBytes } from "../shared/format";
import { Field, Section, buttonClass, inputClass } from "../ui/form";

// The applicant's details, in the order of the membership form:
// basic credentials, current address, institution of affiliation, document uploads.
// Used by the admin add/edit form and the public join form.

const DOCS = {
  photo: { label: "Passport size photograph", accept: "image/jpeg,image/png", hint: "JPG or PNG, up to 5 MB. Printed on the ID card." },
  signature: { label: "Signature", accept: "image/jpeg,image/png", hint: "JPG or PNG, up to 5 MB. Printed on the ID card." },
  idProof: { label: "Valid ID card", accept: "image/jpeg,image/png,application/pdf", hint: "JPG, PNG or PDF, up to 5 MB." },
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
  locked = [], // join form: fields filled from Aadhaar (DigiLocker), shown read-only
  aadhaarVerified = false, // join form: identity verified through DigiLocker, no ID proof upload
  aadhaarPhoto = "", // join form: the photo from Aadhaar (data: URL), used as the photograph
  documentsNote = "Documents are stored privately and are only visible to the membership office.",
  // join form, Institutional: checks the PAN with the Income Tax records (null = no Verify button)
  onVerifyPan = null,
  panBusy = false,
  panInfo = null, // { pan, name, panType } once verified
}) {
  const isLocked = (path) => locked.includes(path);
  // On the join form the alert above the form already says the greyed-out fields come from
  // Aadhaar, so the fields themselves carry no hint.
  const lockedHint = aadhaarVerified ? "" : "From your Aadhaar (DigiLocker).";
  // Joined through DigiLocker (join form, or the admin editing such a member): no ID proof
  // upload, and the Aadhaar address may have lines longer than the usual 30 characters.
  const viaAadhaar = aadhaarVerified || !!form.aadhaarVerified;
  const lineMax = viaAadhaar ? 100 : 30;
  const type = form.membershipType;
  const isInstitution = type === "INSTITUTIONAL";
  const affiliated = form.affiliated === "Yes";

  // Called as functions (not components) so inputs keep focus while typing.
  const text = (path, label, { required = true, type: inputType = "text", hint, lockedAs, maxLength, placeholder, autoComplete, className, inputMode } = {}) => {
    const value = getIn(form, path) ?? "";
    const counter = maxLength ? `${String(value).length}/${maxLength} characters` : null;
    return (
      <Field label={label} htmlFor={path} required={required} error={errors[path]} hint={isLocked(path) ? lockedAs || lockedHint : hint || counter} className={className}>
        <input
          id={path}
          type={inputType}
          className={inputClass(errors[path])}
          disabled={isLocked(path)}
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
    <Field label={label} htmlFor={path} required={required} error={errors[path]} hint={isLocked(path) ? lockedHint : undefined} className={className}>
      <select
        id={path}
        className={inputClass(errors[path])}
        disabled={isLocked(path)}
        value={getIn(form, path) ?? ""}
        onChange={(e) => set(path, e.target.value)}
      >
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
    if (key === "photo" && aadhaarPhoto && isLocked(errKey)) {
      return (
        <Field key={key} label={doc.label} htmlFor={errKey} hint="Printed on the ID card.">
          <img id={errKey} src={aadhaarPhoto} alt="Photograph from Aadhaar" className="h-36 w-28 rounded-md border border-slate-300 object-cover" />
        </Field>
      );
    }
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
        {text("whatsapp", "Number", { type: "tel", inputMode: "numeric", placeholder: "10-digit mobile number" })}
        {isInstitution && (
          <Field
            label="PAN of the institution"
            htmlFor="pan"
            required
            error={errors.pan}
            className="sm:col-span-2"
            hint={
              panInfo
                ? `Verified with the Income Tax records${panInfo.panType ? ` · ${panInfo.panType}` : ""}.`
                : "The organisation's PAN, not a personal PAN." + (onVerifyPan ? " The institution name is filled in from the Income Tax records." : "")
            }
          >
            <div className="flex gap-2">
              <input
                id="pan"
                className={`${inputClass(errors.pan)} uppercase`}
                disabled={isLocked("pan")}
                value={form.pan ?? ""}
                maxLength={10}
                placeholder="e.g. AAABA1234B"
                autoComplete="off"
                onChange={(e) => set("pan", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
              {onVerifyPan && !panInfo && (
                <button type="button" className={`${buttonClass.secondary} shrink-0`} disabled={panBusy} onClick={onVerifyPan}>
                  {panBusy ? "Verifying…" : "Verify PAN"}
                </button>
              )}
            </div>
          </Field>
        )}
        {text("name", isInstitution ? "Institution name" : "Name", {
          className: "sm:col-span-2",
          hint: isInstitution ? undefined : "As it should appear on the ID card.",
          lockedAs: isInstitution ? "As registered with the Income Tax Department (from the PAN)." : undefined,
        })}
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
        {text("address.line1", "Address line 1", { maxLength: lineMax, className: "sm:col-span-2" })}
        {text("address.line2", "Address line 2", { maxLength: lineMax, required: false, className: "sm:col-span-2" })}
        {text("address.city", "City")}
        {select("address.state", "State", INDIAN_STATES)}
        {text("address.pincode", "PIN code", { inputMode: "numeric", maxLength: 6 })}
      </Section>

      <Section title="Institution of affiliation">
        <Field label="Are you affiliated to any institute?" htmlFor="affiliated" required>
          <select id="affiliated" className={inputClass()} value={affiliated ? "Yes" : "No"} onChange={(e) => set("affiliated", e.target.value)}>
            <option value="No">No</option>
            <option value="Yes">Yes</option>
          </select>
        </Field>
        {affiliated && (
          <>
            {text("affiliation.designation", "Designation")}
            {text("affiliation.department", "Department")}
            {text("affiliation.institution", "University / Institution / Organization", { className: "sm:col-span-2" })}
            {select("affiliation.state", "State", INDIAN_STATES)}
          </>
        )}
      </Section>

      <Section title="Document uploads" description={documentsNote}>
        {fileField("photo")}
        {fileField("signature")}
        {viaAadhaar ? (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 sm:col-span-2">
            ID proof: not needed, your Aadhaar is verified.
          </p>
        ) : (
          <>
            {select("idProofType", "Type of ID card", config.idProofTypes)}
            {fileField("idProof")}
          </>
        )}
      </Section>
    </>
  );
}
