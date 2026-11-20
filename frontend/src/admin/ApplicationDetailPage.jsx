import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, openInNewTab } from "../api/client";
import { useConfig } from "../api/useConfig";
import { formatBytes, formatDate, formatMoney, todayISO } from "../shared/format";
import StatusBadge from "../ui/StatusBadge";
import { Alert, Card, Details, Field, Spinner, buttonClass, inputClass } from "../ui/form";

const DOC_LABELS = {
  photo: "Passport size photograph",
  signature: "Signature",
  idProof: "Valid ID card",
  studentId: "Student ID card",
};

function RecordPayment({ application, config, onDone }) {
  const [form, setForm] = useState({ amount: application.amount ?? "", mode: "", reference: "", date: todayISO() });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [`payment.${k}`]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api(`/admin/applications/${application._id}/record-payment`, { method: "POST", json: form });
      onDone(res);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.errors);
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <p className="text-sm text-slate-600">If the applicant paid by bank transfer, cash or cheque, record it here. They become a member and get the welcome email with ID card and receipt.</p>
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" htmlFor="o-amount" required error={errors["payment.amount"]}>
          <input id="o-amount" type="number" min="0" className={inputClass(errors["payment.amount"])} value={form.amount} onChange={set("amount")} />
        </Field>
        <Field label="Mode" htmlFor="o-mode" required error={errors["payment.mode"]}>
          <select id="o-mode" className={inputClass(errors["payment.mode"])} value={form.mode} onChange={set("mode")}>
            <option value="">Select…</option>
            {config.paymentModes.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Reference" htmlFor="o-ref" error={errors["payment.reference"]}>
          <input id="o-ref" className={inputClass(errors["payment.reference"])} value={form.reference} onChange={set("reference")} />
        </Field>
        <Field label="Payment date" htmlFor="o-date" required error={errors["payment.date"]}>
          <input id="o-date" type="date" className={inputClass(errors["payment.date"])} value={form.date} onChange={set("date")} />
        </Field>
      </div>
      <button type="submit" className={`${buttonClass.primary} w-full`} disabled={busy}>
        {busy ? "Registering…" : "Record payment and register"}
      </button>
    </form>
  );
}

function CancelApplication({ application, onDone }) {
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const res = await api(`/admin/applications/${application._id}/cancel`, { method: "POST", json: { reason } });
      onDone(res.application);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <Field label="Reason" htmlFor="c-reason" hint="For example: duplicate, refused by the Governing Body.">
        <textarea id="c-reason" rows={2} maxLength={300} className={inputClass()} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {confirming ? (
        <div className="flex gap-2">
          <button type="button" className={buttonClass.danger} disabled={busy} onClick={cancel}>
            {busy ? "Cancelling…" : "Yes, cancel and delete documents"}
          </button>
          <button type="button" className={buttonClass.secondary} onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      ) : (
        <button type="button" className={`${buttonClass.secondary} w-full`} onClick={() => setConfirming(true)}>
          Cancel application
        </button>
      )}
    </div>
  );
}

export default function ApplicationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { config } = useConfig();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/admin/applications/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  async function open(path) {
    setError("");
    try {
      await openInNewTab(path);
    } catch (e) {
      setError(e.message);
    }
  }

  if (error && !data) return <Alert>{error}</Alert>;
  if (!data || !config) return <Spinner />;

  const a = data.application;
  const addr = a.address || {};
  const af = a.affiliation || {};
  const isInstitution = a.membershipType === "INSTITUTIONAL";

  return (
    <div className="space-y-6">
      <Link to="/admin/applications" className="text-sm text-slate-500 hover:text-slate-800">
        ← Applications
      </Link>
      {error && <Alert onClose={() => setError("")}>{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{a.name}</h1>
        <StatusBadge status={a.status} large />
      </div>
      <p className="-mt-4 text-sm text-slate-600">
        {a.typeLabel} · {formatMoney(a.amount)} · applied {formatDate(a.createdAt)}
        {a.status === "CANCELLED" && a.cancelReason && ` · ${a.cancelReason}`}
      </p>

      {a.status === "PAID" && a.memberId && (
        <Alert kind="success">
          Paid and registered.{" "}
          <Link className="font-medium underline" to={`/admin/members/${a.memberId}`}>
            Open the member
          </Link>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Applicant">
            <Details
              rows={[
                ["Email (verified)", a.email],
                ["WhatsApp", a.whatsapp],
                ...(isInstitution
                  ? [["Authorized contact person", a.contactPerson]]
                  : [
                      ["Mother's name", a.motherName],
                      ["Father's name", a.fatherName],
                      ["Gender", a.gender],
                      ["Date of birth", formatDate(a.dob)],
                    ]),
                ["Address", [addr.line1, addr.line2, addr.city, addr.state && `${addr.state} – ${addr.pincode}`].filter(Boolean).join(", ")],
                ["Affiliation", a.affiliated ? [af.designation, af.course, af.semester && `Semester ${af.semester}`, af.department, af.institution, af.state].filter(Boolean).join(", ") : "Not affiliated"],
                ["Members directory", a.showInPublicList ? "Agreed to be listed" : "Not listed"],
                ["Terms accepted", formatDate(a.termsAcceptedAt)],
              ]}
            />
          </Card>

          <Card title="Documents" padded={false}>
            {a.status === "CANCELLED" ? (
              <p className="px-5 py-4 text-sm text-slate-500">Documents of cancelled applications are deleted.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {Object.keys(DOC_LABELS).map((key) => {
                  const doc = a.documents?.[key];
                  if (!doc) return null;
                  return (
                    <li key={key} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {DOC_LABELS[key]}
                          {key === "idProof" && a.idProofType ? ` (${a.idProofType})` : ""}
                        </p>
                        <p className="text-xs text-slate-500">
                          {doc.originalName} · {formatBytes(doc.size)}
                        </p>
                      </div>
                      <button type="button" className={buttonClass.ghost} onClick={() => open(`/admin/applications/${id}/files/${key}`)}>
                        View
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Payment attempts" padded={false}>
            {data.orders.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">The applicant has not started a payment.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.orders.map((o) => (
                  <li key={o._id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div>
                      <span className="font-mono text-xs">{o.orderNo}</span> · {formatDate(o.createdAt)}
                      {o.failureReason && <div className="text-xs text-slate-500">{o.failureReason}</div>}
                    </div>
                    <StatusBadge status={o.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {a.status === "PENDING" && (
          <div className="space-y-6">
            <Card title="Paid offline?">
              <RecordPayment
                application={a}
                config={config}
                onDone={(res) =>
                  navigate(`/admin/members/${res.memberId}`, {
                    state: { flash: `Registered with ID ${res.membershipId}.${res.email?.sent && !res.email.simulated ? " Welcome email sent." : ""}` },
                  })
                }
              />
            </Card>
            <Card title="Cancel">
              <CancelApplication application={a} onDone={(app) => setData((d) => ({ ...d, application: { ...d.application, ...app, documents: {} } }))} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
