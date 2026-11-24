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

// emailNote: what to tell the admin about the email that went to the applicant.
const emailNote = (email) =>
  !email?.sent ? " The email to the applicant could not be sent." : email.simulated ? " (Email is in log mode, so nothing was actually sent.)" : " The applicant has been emailed.";

// onRegistered(res): the applicant had paid online, so approving registered them.
function Approve({ application, onDone, onRegistered }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const paid = !!application.paymentOrderId || !!application.paidOnPage;
  const unverifiedPage = !!application.paidOnPage && !application.paymentVerified;

  async function approve() {
    setBusy(true);
    setError("");
    try {
      const res = await api(`/admin/applications/${application._id}/approve`, { method: "POST" });
      if (res.memberId) onRegistered(res);
      else onDone(res.application, `Application approved.${emailNote(res.email)}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {unverifiedPage
          ? `Zoho has not confirmed this payment yet. Check it in your Zoho Payments dashboard (search for the applicant's email) before approving. When you approve, the applicant becomes a member at once and gets the welcome email with ID card and receipt.`
          : paid
          ? `Check the details and documents. The applicant has already paid ${formatMoney(application.amount)} online. When you approve, they become a member at once and get the welcome email with ID card and receipt.`
          : `Check the details and documents. When you approve, the applicant is emailed a link to pay ${formatMoney(application.amount)}. They become a member and get their ID card once the payment is confirmed.`}
      </p>
      {error && <Alert>{error}</Alert>}
      {confirming ? (
        <div className="flex gap-2">
          <button type="button" className={buttonClass.primary} disabled={busy} onClick={approve}>
            {busy ? "Approving…" : paid ? "Yes, approve and register" : "Yes, approve"}
          </button>
          <button type="button" className={buttonClass.secondary} onClick={() => setConfirming(false)}>
            Back
          </button>
        </div>
      ) : (
        <button type="button" className={`${buttonClass.primary} w-full`} onClick={() => setConfirming(true)}>
          Approve application
        </button>
      )}
    </div>
  );
}

function Reject({ application, onDone }) {
  const [reason, setReason] = useState("");
  const [paymentNotFound, setPaymentNotFound] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function reject() {
    setBusy(true);
    setError("");
    try {
      const res = await api(`/admin/applications/${application._id}/reject`, { method: "POST", json: { reason, paymentNotFound } });
      onDone(res.application, `Application rejected.${emailNote(res.email)}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <Field label="Reason" htmlFor="r-reason" required hint="Sent to the applicant. For example: the ID proof is not readable.">
        <textarea id="r-reason" rows={3} maxLength={500} className={inputClass()} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {application.paidOnPage && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={paymentNotFound} onChange={(e) => setPaymentNotFound(e.target.checked)} />
          <span>The payment was not found in Zoho (the applicant must pay again to reapply).</span>
        </label>
      )}
      {confirming ? (
        <div className="flex gap-2">
          <button type="button" className={buttonClass.danger} disabled={busy} onClick={reject}>
            {busy ? "Rejecting…" : "Yes, reject and delete documents"}
          </button>
          <button type="button" className={buttonClass.secondary} onClick={() => setConfirming(false)}>
            Back
          </button>
        </div>
      ) : (
        <button type="button" className={`${buttonClass.secondary} w-full`} disabled={!reason.trim()} onClick={() => setConfirming(true)}>
          Reject application
        </button>
      )}
    </div>
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
      <p className="text-sm text-slate-600">For duplicates or test entries. No email is sent. To refuse an applicant, use Reject instead.</p>
      <Field label="Reason" htmlFor="c-reason" hint="For your records only. For example: duplicate.">
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
  const [flash, setFlash] = useState("");

  // After approve / reject / cancel: show the new status (documents are gone if it was closed).
  function updated(app, message = "") {
    setData((d) => ({ ...d, application: { ...d.application, ...app, ...(app.status === "APPROVED" ? {} : { documents: {} }) } }));
    setFlash(message);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Registered as a member (approved after paying online, or paid offline): open the member.
  const registered = (res) =>
    navigate(`/admin/members/${res.memberId}`, {
      state: { flash: `Registered with ID ${res.membershipId}.${res.email?.sent && !res.email.simulated ? " Welcome email sent." : ""}` },
    });

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
      {flash && (
        <Alert kind="success" onClose={() => setFlash("")}>
          {flash}
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{a.name}</h1>
        <StatusBadge status={a.status} large />
        {a.aadhaar?.verified ? (
          <StatusBadge status="ACTIVE" large label="Aadhaar verified (DigiLocker)" />
        ) : (
          <StatusBadge status="INACTIVE" large label="Filled manually" />
        )}
      </div>
      <p className="-mt-4 text-sm text-slate-600">
        {a.typeLabel} · {formatMoney(a.amount)} · applied {formatDate(a.createdAt)}
        {a.status === "CANCELLED" && a.cancelReason && ` · ${a.cancelReason}`}
        {a.reviewedAt && ` · reviewed ${formatDate(a.reviewedAt)}`}
      </p>

      {a.status === "PENDING" && a.paymentOrderId && (
        <Alert kind="info">Paid online. Approving registers the member straight away. If you reject it, the payment is kept for the applicant's next application.</Alert>
      )}
      {a.paidOnPage && ["PENDING", "APPROVED"].includes(a.status) && (
        <Alert
          kind={a.paymentVerified ? "success" : "warning"}
          title={a.paymentVerified ? `Paid on Zoho · Payment ID ${a.paymentReference}` : "Payment not confirmed by Zoho yet"}
        >
          {a.paymentVerified
            ? `${a.paymentNote} Approving registers the member straight away.`
            : `${a.paymentNote || "Not confirmed by Zoho yet."} The applicant says they paid on the Zoho payment page${
                a.paymentReportedAt ? ` (${formatDate(a.paymentReportedAt)})` : ""
              }. Check it in your Zoho Payments dashboard before approving.`}
        </Alert>
      )}
      {a.status === "UNPAID" && (
        <Alert kind="info">
          The applicant has filled in the details but has not paid yet. It comes up for review once paid. Unpaid applications are cancelled automatically
          after {config.pendingApplicationDays} days.
        </Alert>
      )}
      {a.status === "APPROVED" && (
        <Alert kind="info">
          Approved. The applicant has been asked to pay; they become a member as soon as the payment is confirmed. Approved applications that are not paid
          within {config.pendingApplicationDays} days are cancelled automatically.
        </Alert>
      )}
      {a.status === "REJECTED" && (
        <Alert kind="warning" title="Rejected">
          {a.reviewNote}
        </Alert>
      )}

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
                [
                  "Aadhaar (DigiLocker)",
                  a.aadhaar?.verified
                    ? `Verified on ${formatDate(a.aadhaar.verifiedAt)} · Aadhaar ending ${a.aadhaar.last4 || "····"} · name, date of birth, gender and father's name taken from Aadhaar`
                    : "Not verified: details were entered manually. Check them against the uploaded ID card.",
                ],
                ["Email (verified)", a.email],
                ["Number", a.whatsapp],
                ...(isInstitution
                  ? [
                      ["Authorized contact person", a.contactPerson],
                      [
                        "PAN",
                        a.pan?.number
                          ? `${a.pan.number}${a.pan.panType ? ` · ${a.pan.panType}` : ""}${a.pan.verified ? ` · Verified (registered name: ${a.pan.registeredName || "–"})` : " · Not verified"}`
                          : "–",
                      ],
                    ]
                  : [
                      ["Mother's name", a.motherName],
                      ["Father's name", a.fatherName],
                      ["Gender", a.gender],
                      ["Date of birth", formatDate(a.dob)],
                    ]),
                ["Address", [addr.line1, addr.line2, addr.city, addr.state && `${addr.state} – ${addr.pincode}`].filter(Boolean).join(", ")],
                ["Affiliation", a.affiliated ? [af.designation, af.department, af.institution, af.state].filter(Boolean).join(", ") : "Not affiliated"],
                ["Members directory", a.showInPublicList ? "Agreed to be listed" : "Not listed"],
                ["Terms accepted", formatDate(a.termsAcceptedAt)],
              ]}
            />
          </Card>

          <Card title="Documents" padded={false}>
            {a.status === "CANCELLED" || a.status === "REJECTED" ? (
              <p className="px-5 py-4 text-sm text-slate-500">Documents of cancelled and rejected applications are deleted.</p>
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

        {["UNPAID", "PENDING", "APPROVED"].includes(a.status) && (
          <div className="space-y-6">
            {a.status === "PENDING" && (
              <Card title="Review">
                <Approve application={a} onDone={updated} onRegistered={registered} />
              </Card>
            )}
            <Card title="Reject">
              <Reject application={a} onDone={updated} />
            </Card>
            {!a.paymentOrderId && !a.paidOnPage && (
              <Card title="Paid offline?">
                <RecordPayment application={a} config={config} onDone={registered} />
              </Card>
            )}
            <Card title="Cancel">
              <CancelApplication application={a} onDone={(app) => updated(app, "Application cancelled.")} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
