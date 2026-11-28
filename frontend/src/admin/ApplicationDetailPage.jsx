import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, apiBlob } from "../api/client";
import FileViewer from "../ui/FileViewer";
import { useConfig } from "../api/useConfig";
import { formatBytes, formatDate, formatMoney, todayISO } from "../shared/format";
import StatusBadge from "../ui/StatusBadge";
import Icon from "../ui/icons";
import { Alert, Card, Field, Spinner, buttonClass, inputClass } from "../ui/form";

const DOC_LABELS = {
  photo: "Passport size photograph",
  signature: "Signature",
  idProof: "Valid ID card",
};

// Label / value rows in two aligned columns (stacked on phones). Empty values show "–".
function InfoRows({ rows }) {
  return (
    <dl className="divide-y divide-slate-50">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-1.5">
          <dt className="text-sm text-slate-500">{label}</dt>
          {/* min-w-0 + overflow-wrap:anywhere: long emails / addresses wrap inside the box */}
          <dd className="min-w-0 text-sm font-medium text-slate-900 [overflow-wrap:anywhere]">{value || "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

// The applicant's passport photo (a protected file), or their initials when there is none.
function Photo({ path, name, onOpen }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!path) return;
    let objectUrl = "";
    let alive = true;
    apiBlob(path, { auth: "admin" })
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  const initials = String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  const box = "h-20 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200";
  if (!url) return <div className={`${box} flex items-center justify-center bg-brand-50 text-xl font-semibold text-brand-700`}>{initials || "?"}</div>;
  return (
    <button type="button" onClick={onOpen} className={`${box} hover:ring-2 hover:ring-brand-500/40`} title="View photograph">
      <img src={url} alt={`Photograph of ${name}`} className="h-full w-full object-cover" />
    </button>
  );
}

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
          <input id="o-date" type="date" max={todayISO()} className={inputClass(errors["payment.date"])} value={form.date} onChange={set("date")} />
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
          ? `Already paid. On approval they become a member at once and get the welcome email with ID card and receipt.`
          : `Check the details and documents. When you approve, the applicant is emailed a link to pay. They become a member and get their ID card once the payment is confirmed.`}
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
        <textarea id="r-reason" rows={2} maxLength={500} className={inputClass()} value={reason} onChange={(e) => setReason(e.target.value)} />
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

  // The document shown in the pop-up viewer ({ path, title }), or null.
  const [viewing, setViewing] = useState(null);
  const closeViewer = useCallback(() => setViewing(null), []);

  if (error && !data) return <Alert>{error}</Alert>;
  if (!data || !config) return <Spinner />;

  const a = data.application;
  const addr = a.address || {};
  const af = a.affiliation || {};
  const isInstitution = a.membershipType === "INSTITUTIONAL";
  const docsGone = a.status === "CANCELLED" || a.status === "REJECTED";
  const openDoc = (key) =>
    setViewing({
      path: `/admin/applications/${id}/files/${key}`,
      title: `${DOC_LABELS[key]}${key === "idProof" && a.idProofType ? ` (${a.idProofType})` : ""}`,
    });

  // Payment, in one line for the header.
  const payment = a.paymentOrderId
    ? { ok: true, text: "Paid online" }
    : a.paidOnPage
    ? a.paymentVerified
      ? { ok: true, text: "Paid · confirmed by Zoho" }
      : { ok: false, text: "Paid · not confirmed yet" }
    : a.status === "PAID"
    ? { ok: true, text: "Paid" }
    : { ok: false, text: a.status === "APPROVED" ? "Awaiting payment" : "Not paid" };

  const sections = [
    {
      title: isInstitution ? "Institution" : "Personal",
      rows: isInstitution
        ? [
            ["Institution", a.name],
            ["Authorized contact person", a.contactPerson],
            ["PAN", a.pan?.number ? `${a.pan.number}${a.pan.panType ? ` · ${a.pan.panType}` : ""}` : "–"],
            ...(a.pan?.verified ? [["Registered name (PAN)", a.pan.registeredName || "–"]] : []),
          ]
        : [
            ["Full name", a.name],
            ["Father's name", a.fatherName],
            ["Mother's name", a.motherName],
            ["Gender", a.gender],
            ["Date of birth", formatDate(a.dob)],
            ...(a.aadhaar?.verified
              ? [["Aadhaar", `Ending ${a.aadhaar.last4 || "····"} · verified on ${formatDate(a.aadhaar.verifiedAt)} (details taken from Aadhaar)`]]
              : []),
          ],
    },
    {
      title: "Contact",
      // The email is shown in the header.
      rows: [
        ["Mobile number", a.whatsapp],
        ["Address", [addr.line1, addr.line2, addr.city, addr.state && `${addr.state} – ${addr.pincode}`].filter(Boolean).join(", ")],
      ],
    },
    {
      title: "Affiliation",
      rows: a.affiliated
        ? [
            ["Designation", af.designation],
            ["Department", af.department],
            ["Institution", af.institution],
            ["State", af.state],
          ]
        : [["Affiliation", "Not affiliated"]],
    },
    {
      title: "Application",
      // Type, fee and date applied are in the header.
      rows: [
        ["Terms accepted", formatDate(a.termsAcceptedAt)],
        ...(a.reviewedAt ? [["Reviewed on", formatDate(a.reviewedAt)]] : []),
        ...(a.status === "CANCELLED" && a.cancelReason ? [["Cancelled", a.cancelReason]] : []),
      ],
    },
  ];

  const open = ["UNPAID", "PENDING", "APPROVED"].includes(a.status);

  return (
    <div className="space-y-4">
      <FileViewer file={viewing} onClose={closeViewer} />

      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/admin/applications" className="hover:text-slate-800">
          Applications
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate text-slate-800">{a.name}</span>
      </nav>

      {error && <Alert onClose={() => setError("")}>{error}</Alert>}
      {flash && (
        <Alert kind="success" onClose={() => setFlash("")}>
          {flash}
        </Alert>
      )}

      {/* Header: photo, name, status, checks and the key facts */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Photo
            path={!docsGone && a.documents?.photo ? `/admin/applications/${id}/files/photo` : ""}
            name={a.name}
            onOpen={() => openDoc("photo")}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900">{a.name}</h1>
              <StatusBadge status={a.status} />
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {a.typeLabel} · Applied on {formatDate(a.createdAt)}
            </p>
            <a href={`mailto:${a.email}`} className="mt-1.5 inline-flex max-w-full items-center gap-1.5 text-sm text-slate-700 hover:text-brand-700">
              <Icon name="mail" className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{a.email}</span>
            </a>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-center">
            <div className="bg-slate-50 px-4 py-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Fee</dt>
              <dd className="text-base font-semibold leading-6 tabular-nums text-slate-900">{formatMoney(a.amount)}</dd>
            </div>
            <div className="bg-slate-50 px-4 py-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Payment</dt>
              <dd className={`text-sm font-semibold leading-6 ${payment.ok ? "text-green-700" : "text-amber-700"}`}>{payment.text}</dd>
            </div>
          </dl>
        </div>
      </section>

      {a.status === "UNPAID" && (
        <Alert kind="info">
          It comes up for review once paid. Unpaid applications are cancelled automatically after {config.pendingApplicationDays} days.
        </Alert>
      )}
      {a.status === "APPROVED" && (
        <Alert kind="info">
          The applicant becomes a member as soon as the payment is confirmed. Approved applications that are not paid within {config.pendingApplicationDays}{" "}
          days are cancelled automatically.
        </Alert>
      )}
      {a.status === "REJECTED" && (
        <Alert kind="warning" title="Reason">
          {a.reviewNote}
        </Alert>
      )}

      {a.status === "PAID" && a.memberId && (
        <Alert kind="success">
          Registered as a member.{" "}
          <Link className="font-medium underline" to={`/admin/members/${a.memberId}`}>
            Open the member
          </Link>
        </Alert>
      )}

      <div className={`grid items-start gap-4 ${open ? "lg:grid-cols-3" : ""}`}>
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {/* Personal | Contact, Affiliation | Application side by side */}
          <Card title={isInstitution ? "Institution details" : "Applicant details"} padded={false}>
            <div className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-y-0">
              {sections.map((s, i) => (
                <div key={s.title} className={`px-5 py-3 ${i >= 2 ? "md:border-t md:border-slate-100" : ""} ${i % 2 === 1 ? "md:border-l md:border-slate-100" : ""}`}>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-700">{s.title}</h3>
                  <InfoRows rows={s.rows} />
                </div>
              ))}
            </div>
          </Card>

          <div className="grid items-start gap-4 md:grid-cols-2">
            <Card title="Documents" padded={docsGone}>
              {docsGone ? (
                <p className="text-sm text-slate-500">Documents of cancelled and rejected applications are deleted.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {/* The photograph is shown at the top of the page (click it to enlarge). */}
                  {Object.keys(DOC_LABELS)
                    .filter((key) => key !== "photo")
                    .map((key) => {
                      const doc = a.documents?.[key];
                      if (!doc) return null;
                      return (
                        <li key={key} className="flex items-center gap-3 px-5 py-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                            <Icon name={key === "idProof" ? "id" : "document"} className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900">
                              {DOC_LABELS[key]}
                              {key === "idProof" && a.idProofType ? ` (${a.idProofType})` : ""}
                            </p>
                            <p className="truncate text-xs text-slate-500" title={doc.originalName}>
                              {doc.originalName} · {formatBytes(doc.size)}
                            </p>
                          </div>
                          <button type="button" className={buttonClass.ghost} onClick={() => openDoc(key)}>
                            <Icon name="eye" className="h-4 w-4" /> View
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </Card>

            <Card title="Payment history" padded={false}>
              {data.orders.length === 0 ? (
                <p className="px-5 py-3 text-sm text-slate-500">No online payment has been started.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.orders.map((o) => (
                    <li key={o._id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-slate-800">{o.orderNo}</p>
                        <p className="text-xs text-slate-500">{formatDate(o.createdAt)}</p>
                        {o.failureReason && <p className="mt-0.5 text-xs text-slate-500">{o.failureReason}</p>}
                      </div>
                      <StatusBadge status={o.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        {open && (
          <aside className="space-y-4 lg:sticky lg:top-4">
            <Card title="Decision" padded={false}>
              <div className="divide-y divide-slate-100">
                {a.status === "PENDING" && (
                  <div className="p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-green-700">Approve</h3>
                    <Approve application={a} onDone={updated} onRegistered={registered} />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-700">Reject</h3>
                  <Reject application={a} onDone={updated} />
                </div>
              </div>
            </Card>
            {!a.paymentOrderId && !a.paidOnPage && (
              <Card title="Paid offline?">
                <RecordPayment application={a} config={config} onDone={registered} />
              </Card>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
