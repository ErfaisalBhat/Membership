import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api/client";
import { typeInfo, useConfig } from "../api/useConfig";
import { formatMoney, isoDate, todayISO } from "../shared/format";
import { emptyPerson, setIn } from "../shared/formState";
import { Alert, Field, PageHeader, Section, Spinner, buttonClass, inputClass } from "../ui/form";
import PersonFields from "./PersonFields";

const emptyForm = () => ({
  ...emptyPerson(),
  membershipId: "", // empty on add = the next number automatically
  remarks: "",
  joinDate: todayISO(),
  payment: { amount: "", mode: "", reference: "", date: todayISO() },
});

function fromMember(m) {
  const f = emptyForm();
  return {
    ...f,
    membershipType: m.membershipType,
    membershipId: m.membershipId || "",
    name: m.name || "",
    contactPerson: m.contactPerson || "",
    pan: m.pan?.number || "",
    email: m.email || "",
    whatsapp: m.whatsapp || "",
    motherName: m.motherName || "",
    fatherName: m.fatherName || "",
    gender: m.gender || "",
    dob: isoDate(m.dob),
    affiliated: m.affiliated ? "Yes" : "No",
    address: { ...f.address, ...m.address },
    affiliation: { ...f.affiliation, ...m.affiliation },
    idProofType: m.idProofType || "",
    aadhaarVerified: !!m.aadhaar?.verified, // joined through DigiLocker: no ID proof upload
    showInPublicList: !!m.showInPublicList,
    remarks: m.remarks || "",
  };
}

// Admin: add a member (records the first payment) or edit one.
// /admin/members/new?from=<member id>: another plan for that member. Their details, documents
// and membership ID are filled in (all can be changed); the plans they already have are blocked.
export default function MemberFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const [searchParams] = useSearchParams();
  const fromId = isEdit ? "" : searchParams.get("from") || "";
  const navigate = useNavigate();
  const { config, error: configError } = useConfig();
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState({});
  const [existingDocs, setExistingDocs] = useState({});
  const [membershipId, setMembershipId] = useState("");
  const [source, setSource] = useState(null); // { member, heldTypes } when adding another plan
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [loading, setLoading] = useState(isEdit || !!fromId);
  const [saving, setSaving] = useState(false);
  const topRef = useRef(null);

  useEffect(() => {
    if (!isEdit && !fromId) return;
    api(`/members/${isEdit ? id : fromId}`)
      .then(({ member, otherPlans = [] }) => {
        setExistingDocs(member.documents || {});
        if (isEdit) {
          setForm(fromMember(member));
          setMembershipId(member.membershipId);
          return;
        }
        // A new plan: the person's details, a fresh joining date / payment, no plan chosen yet.
        const f = emptyForm();
        // Membership ID empty: the new plan gets its own number with its own prefix, unless the
        // admin types one (e.g. the member's current ID, shown in the hint).
        setForm({ ...fromMember(member), membershipType: "", membershipId: "", remarks: "", joinDate: f.joinDate, payment: f.payment, copyFrom: member._id });
        setSource({ member, heldTypes: [member.membershipType, ...otherPlans.map((p) => p.membershipType)] });
      })
      .catch((e) => setBanner(e.message))
      .finally(() => setLoading(false));
  }, [id, isEdit, fromId]);

  const type = form.membershipType;

  function clearError(path) {
    setErrors((e) => {
      if (!e[path]) return e;
      const next = { ...e };
      delete next[path];
      return next;
    });
  }

  function set(path, value) {
    setForm((f) => setIn(f, path, value));
    clearError(path);
  }

  function changeType(newType) {
    setForm((f) => {
      let next = { ...f, membershipType: newType };
      const oldFee = typeInfo(config, f.membershipType)?.fee;
      const newFee = typeInfo(config, newType)?.fee;
      // Fill in the fee unless the admin already typed a different amount.
      if (f.payment.amount === "" || Number(f.payment.amount) === oldFee) {
        next = setIn(next, "payment.amount", newFee ?? "");
      }
      // Honorary / Emeritus are conferred free: nothing is paid.
      if (typeInfo(config, newType)?.adminOnly) {
        next = setIn(next, "payment.amount", 0);
        next = setIn(next, "payment.mode", "Waived");
      } else if (typeInfo(config, f.membershipType)?.adminOnly && f.payment.mode === "Waived") {
        next = setIn(next, "payment.mode", "");
      }
      return next;
    });
    clearError("membershipType");
  }

  function pickFile(key, file) {
    setFiles((f) => ({ ...f, [key]: file || undefined }));
    clearError(`documents.${key}`);
  }

  async function submit(e) {
    e.preventDefault();
    setBanner("");
    setSaving(true);
    const data = { ...form, affiliated: form.affiliated === "Yes" ? "Yes" : "No" };
    const fd = new FormData();
    fd.append("data", JSON.stringify(data));
    for (const [key, file] of Object.entries(files)) if (file) fd.append(key, file);

    try {
      const res = await api(isEdit ? `/members/${id}` : "/members", { method: isEdit ? "PUT" : "POST", form: fd });
      let flash = isEdit ? "Member details saved." : `Member registered with ID ${res.member.membershipId}.`;
      if (!isEdit && res.email) {
        if (res.email.sent && !res.email.simulated) flash += ` The ID card and receipt were emailed to ${res.member.email}.`;
        else if (res.email.simulated) flash += " (Email is in log mode on the server, so no email was sent.)";
        else flash += ` The welcome email could not be sent: ${res.email.error}`;
      }
      navigate(`/admin/members/${res.member._id}`, { state: { flash } });
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError && Object.keys(err.errors).length) setErrors(err.errors);
      setBanner(err.message);
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  if (loading || (!config && !configError)) return <Spinner />;
  if (configError) return <Alert>{configError.message}</Alert>;

  const showRest = isEdit || !!type;
  const cancelTo = isEdit ? `/admin/members/${id}` : source ? `/admin/members/${source.member._id}` : "/admin/members";
  const held = source?.heldTypes || [];
  const allHeld = !!source && config.membershipTypes.every((t) => held.includes(t.key));
  // Another plan: the Aadhaar (DigiLocker) check carries over only while the email is the same person's.
  const personForm =
    source && form.email.trim().toLowerCase() !== source.member.email ? { ...form, aadhaarVerified: false } : form;

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-3xl">
      <div ref={topRef}>
        <PageHeader
          title={isEdit ? "Edit member" : source ? "Add another plan" : "Add member"}
          subtitle={
            isEdit
              ? membershipId
              : source
                ? `${source.member.name} · ${source.member.membershipId} (${source.member.typeLabel})`
                : "Register a member who applied on paper or paid at the office."
          }
          back={
            <Link to={cancelTo} className="text-sm text-slate-500 hover:text-slate-800">
              ← {isEdit || source ? "Back to member" : "Members"}
            </Link>
          }
        />
      </div>

      <div className="space-y-6">
        {banner && <Alert onClose={() => setBanner("")}>{banner}</Alert>}
        {allHeld && <Alert kind="info">This member already has every plan.</Alert>}

        <Section title="Membership">
          <Field
            label="Membership type"
            htmlFor="membershipType"
            required
            error={errors.membershipType}
            hint={isEdit ? "The type can't be changed after registration." : source ? "Plans this member already has can't be chosen." : undefined}
          >
            <select id="membershipType" className={inputClass(errors.membershipType)} value={type} disabled={isEdit} onChange={(e) => changeType(e.target.value)}>
              <option value="">Select…</option>
              {config.membershipTypes.map((t) => (
                <option key={t.key} value={t.key} disabled={held.includes(t.key)}>
                  {t.label}
                  {!t.adminOnly && ` — ${formatMoney(t.fee)}${t.validityMonths ? ` / ${t.validityMonths} months` : " / lifetime"}`}
                  {held.includes(t.key) && " (already has)"}
                </option>
              ))}
            </select>
          </Field>
          {showRest && (
            <Field
              label="Membership ID"
              htmlFor="membershipId"
              required={isEdit}
              error={errors.membershipId}
              hint={
                isEdit
                  ? "Changing it means the member's printed ID card no longer matches. Must not be used by another member."
                  : source
                    ? `Leave empty to give the next number automatically (${typeInfo(config, type)?.idPrefix || ""}00001 style). Current ID: ${source.member.membershipId} — type it to use the same ID for this plan.`
                    : `Leave empty to give the next number automatically (${typeInfo(config, type)?.idPrefix || ""}00001 style). Must not be used by another member.`
              }
            >
              <input
                id="membershipId"
                className={`${inputClass(errors.membershipId)} uppercase`}
                maxLength={30}
                placeholder={isEdit ? "" : "Automatic"}
                value={form.membershipId}
                onChange={(e) => set("membershipId", e.target.value.toUpperCase())}
              />
            </Field>
          )}
          {!isEdit && showRest && (
            <Field label="Date of joining" htmlFor="joinDate" required error={errors.joinDate} hint="Validity is counted from this date.">
              <input id="joinDate" type="date" max={todayISO()} className={inputClass(errors.joinDate)} value={form.joinDate} onChange={(e) => set("joinDate", e.target.value)} />
            </Field>
          )}
        </Section>

        {showRest && (
          <>
            <PersonFields form={personForm} set={set} errors={errors} config={config} files={files} pickFile={pickFile} existingDocs={existingDocs} />

            {/* Honorary / Emeritus have no fee, so there is no payment to record. */}
            {!isEdit && !typeInfo(config, type)?.adminOnly && (
              <Section title="Payment received">
                <Field label="Amount (₹)" htmlFor="payment.amount" required error={errors["payment.amount"]}>
                  <input id="payment.amount" type="number" min="0" inputMode="numeric" className={inputClass(errors["payment.amount"])} value={form.payment.amount} onChange={(e) => set("payment.amount", e.target.value)} />
                </Field>
                <Field label="Payment mode" htmlFor="payment.mode" required error={errors["payment.mode"]}>
                  <select id="payment.mode" className={inputClass(errors["payment.mode"])} value={form.payment.mode} onChange={(e) => set("payment.mode", e.target.value)}>
                    <option value="">Select…</option>
                    {config.paymentModes.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Transaction / receipt reference" htmlFor="payment.reference" error={errors["payment.reference"]} hint="UTR, UPI reference, cheque or receipt number.">
                  <input id="payment.reference" className={inputClass(errors["payment.reference"])} value={form.payment.reference} onChange={(e) => set("payment.reference", e.target.value)} />
                </Field>
                <Field label="Payment date" htmlFor="payment.date" required error={errors["payment.date"]}>
                  <input id="payment.date" type="date" max={todayISO()} className={inputClass(errors["payment.date"])} value={form.payment.date} onChange={(e) => set("payment.date", e.target.value)} />
                </Field>
              </Section>
            )}

            <Section title="Consent and remarks">
              <label className="flex items-start gap-3 sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700"
                  checked={form.showInPublicList}
                  onChange={(e) => set("showInPublicList", e.target.checked)}
                />
                <span className="text-sm text-slate-700">
                  The member agrees to be listed in the public members directory (name, membership ID, type, status and date of joining only).
                </span>
              </label>
              <Field label="Remarks (internal)" htmlFor="remarks" error={errors.remarks} className="sm:col-span-2">
                <textarea id="remarks" rows={3} maxLength={500} className={inputClass(errors.remarks)} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
              </Field>
            </Section>

            <div className="flex justify-end gap-3">
              <Link to={cancelTo} className={buttonClass.secondary}>
                Cancel
              </Link>
              <button type="submit" className={buttonClass.primary} disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save changes" : "Register member"}
              </button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
