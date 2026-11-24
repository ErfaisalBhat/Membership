import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, apiBlob, openInNewTab } from "../api/client";
import { useConfig } from "../api/useConfig";
import { formatDate, formatMoney } from "../shared/format";
import { setIn } from "../shared/formState";
import INDIAN_STATES from "../shared/indianStates";
import Checkout from "../payments/Checkout";
import CodeForm from "../ui/CodeForm";
import StatusBadge from "../ui/StatusBadge";
import Icon from "../ui/icons";
import { Alert, Card, Details, Field, Spinner, buttonClass, inputClass } from "../ui/form";
import { useMemberAuth } from "./MemberAuthContext";

function LoginView() {
  const { requestCode, verifyCode } = useMemberAuth();
  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <div className="mb-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md bg-brand-50 text-brand-700">
          <Icon name="id" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Member login</h1>
        <p className="mt-1 text-sm text-slate-500">Download your ID card and receipts, update your details and renew online.</p>
      </div>
      <Card>
        <CodeForm
          requestCode={requestCode}
          verifyCode={verifyCode}
          emailLabel="Registered email address"
          submitLabel="Send login code"
          intro={<p className="text-sm text-slate-600">No password needed. We will email you a one-time code.</p>}
        />
      </Card>
      <p className="mt-6 text-center text-sm text-slate-500">
        Not a member yet?{" "}
        <Link to="/join" className="font-medium text-brand-700 hover:underline">
          Become a member
        </Link>
      </p>
    </div>
  );
}

function RenewCard({ account, onUpdated }) {
  const { member, renewal, onlinePayments } = account;
  const [checkout, setCheckout] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function start() {
    setMessage(null);
    setBusy(true);
    try {
      const res = await api("/account/renew/checkout", { method: "POST", auth: "member" });
      setCheckout(res.checkout);
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const onResult = useCallback(
    async (result) => {
      const order = checkout;
      setCheckout(null);
      setBusy(true);
      try {
        const res = await api(`/account/orders/${order.orderId}/confirm`, { method: "POST", json: { result }, auth: "member" });
        onUpdated({ member: res.member, renewal: res.renewal, onlinePayments: res.onlinePayments });
        if (res.order.status === "PAID") {
          setMessage({ kind: "success", text: `Renewed. Your membership is now valid till ${formatDate(res.member.expiryDate)}. The updated ID card and receipt have been emailed to you.` });
        } else if (res.order.status === "FAILED") {
          setMessage({ kind: "error", text: "The payment was not completed. You can try again." });
        } else {
          setMessage({ kind: "warning", text: "We are waiting for the payment gateway to confirm your payment. Please do not pay again; you will receive an email once it is confirmed." });
        }
      } catch (err) {
        setMessage({ kind: "error", text: err.message });
      } finally {
        setBusy(false);
      }
    },
    [checkout, onUpdated]
  );
  const onCancel = useCallback(() => setCheckout(null), []);

  if (member.expiryDate === null) {
    return (
      <Card title="Renewal">
        <p className="text-sm text-slate-600">Life membership never expires — there is nothing to renew.</p>
      </Card>
    );
  }

  return (
    <Card title="Renewal">
      <div className="space-y-4">
        {message && <Alert kind={message.kind}>{message.text}</Alert>}
        {renewal.canRenew ? (
          <>
            <p className="text-sm text-slate-600">
              {member.status === "EXPIRED" ? "Your membership has expired." : `Your membership expires on ${formatDate(member.expiryDate)}.`} Renewing now extends it to{" "}
              <strong className="text-slate-900">{formatDate(renewal.periodTo)}</strong>.
            </p>
            <div className="flex items-baseline justify-between rounded-md bg-slate-50 px-4 py-3">
              <span className="text-sm text-slate-600">Renewal fee</span>
              <span className="text-xl font-semibold tabular-nums">{formatMoney(renewal.amount)}</span>
            </div>
            {!onlinePayments ? (
              <Alert kind="warning">Online payment is not available yet. Please contact the membership office to renew.</Alert>
            ) : checkout ? (
              <Checkout checkout={checkout} onResult={onResult} onCancel={onCancel} />
            ) : (
              <button type="button" className={`${buttonClass.primary} w-full`} disabled={busy} onClick={start}>
                {busy ? "Please wait…" : `Renew for ${formatMoney(renewal.amount)}`}
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-600">
            {renewal.reason}
            {renewal.opensOn && ` You can renew from ${formatDate(renewal.opensOn)}.`}
          </p>
        )}
      </div>
    </Card>
  );
}

function EditDetails({ member, onSaved, onCancel }) {
  const [form, setForm] = useState({
    whatsapp: member.whatsapp || "",
    address: { line1: "", line2: "", city: "", state: "", pincode: "", ...member.address },
    affiliated: member.affiliated ? "Yes" : "No",
    affiliation: { institution: "", department: "", designation: "", state: "", ...member.affiliation },
    showInPublicList: !!member.showInPublicList,
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const affiliated = form.affiliated === "Yes";

  const set = (path, value) => {
    setForm((f) => setIn(f, path, value));
    setErrors((e) => ({ ...e, [path]: undefined }));
  };
  const input = (path, label, opts = {}) => {
    const value = path.split(".").reduce((o, k) => o?.[k], form) ?? "";
    return (
      <Field label={label} htmlFor={`me-${path}`} error={errors[path]} required={opts.required !== false} className={opts.className}>
        <input id={`me-${path}`} className={inputClass(errors[path])} value={value} maxLength={opts.maxLength} inputMode={opts.inputMode} onChange={(e) => set(path, e.target.value)} />
      </Field>
    );
  };
  const stateSelect = (path) => (
    <Field label="State" htmlFor={`me-${path}`} error={errors[path]} required>
      <select id={`me-${path}`} className={inputClass(errors[path])} value={path.split(".").reduce((o, k) => o?.[k], form) || ""} onChange={(e) => set(path, e.target.value)}>
        <option value="">Select…</option>
        {INDIAN_STATES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </Field>
  );

  async function save(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api("/account/me", { method: "PUT", json: { ...form, affiliated: affiliated ? "Yes" : "No" }, auth: "member" });
      onSaved(res);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.errors);
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        {input("whatsapp", "Number", { inputMode: "numeric" })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {input("address.line1", "Address line 1", { maxLength: 30, className: "sm:col-span-2" })}
        {input("address.line2", "Address line 2", { maxLength: 30, required: false, className: "sm:col-span-2" })}
        {input("address.city", "City")}
        {stateSelect("address.state")}
        {input("address.pincode", "PIN code", { maxLength: 6, inputMode: "numeric" })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Affiliated to an institute?" htmlFor="me-affiliated">
          <select id="me-affiliated" className={inputClass()} value={affiliated ? "Yes" : "No"} onChange={(e) => set("affiliated", e.target.value)}>
            <option>No</option>
            <option>Yes</option>
          </select>
        </Field>
        {affiliated && (
          <>
            {input("affiliation.designation", "Designation")}
            {input("affiliation.department", "Department")}
            {input("affiliation.institution", "University / Institution / Organization", { className: "sm:col-span-2" })}
            {stateSelect("affiliation.state")}
          </>
        )}
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700" checked={form.showInPublicList} onChange={(e) => set("showInPublicList", e.target.checked)} />
        <span className="text-sm text-slate-700">List me in the public members directory.</span>
      </label>
      <div className="flex gap-2">
        <button type="submit" className={buttonClass.primary} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className={buttonClass.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Dashboard() {
  const { account, setAccount, logout } = useMemberAuth();
  const { config } = useConfig();
  const [photoUrl, setPhotoUrl] = useState(null);
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const member = account.member;

  useEffect(() => {
    if (!member.documents?.photo) return;
    let url;
    let alive = true;
    apiBlob("/account/photo", { auth: "member" })
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setPhotoUrl(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [member._id, member.documents?.photo]);

  async function open(path) {
    setError("");
    try {
      await openInNewTab(path, "member");
    } catch (e) {
      setError(e.message);
    }
  }

  const a = member.address || {};
  const af = member.affiliation || {};
  const isInstitution = member.membershipType === "INSTITUTIONAL";

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My membership</h1>
          <p className="mt-1 text-sm text-slate-500">{config?.orgName}</p>
        </div>
        <button type="button" className={buttonClass.secondary} onClick={logout}>
          <Icon name="logout" className="h-4 w-4" /> Log out
        </button>
      </div>

      {flash && <Alert kind="success" onClose={() => setFlash("")}>{flash}</Alert>}
      {error && <Alert onClose={() => setError("")}>{error}</Alert>}

      <Card>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="h-28 w-24 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">No photo</div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">{member.name}</h2>
              <StatusBadge status={member.status} large />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500">Membership ID</dt>
                <dd className="font-mono font-medium">{member.membershipId}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Type</dt>
                <dd className="font-medium">{member.typeLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Member since</dt>
                <dd className="font-medium">{formatDate(member.joinDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Valid till</dt>
                <dd className="font-medium">{member.expiryDate ? formatDate(member.expiryDate) : "Lifetime"}</dd>
              </div>
            </dl>
            {member.status === "INACTIVE" && member.statusReason && <p className="mt-3 text-sm text-slate-600">Reason: {member.statusReason}</p>}
          </div>
          <button type="button" className={buttonClass.primary} onClick={() => open("/account/card.pdf")}>
            <Icon name="download" className="h-4 w-4" /> ID card (PDF)
          </button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card title="Payments and receipts" padded={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-5 py-2.5">For</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                    <th className="px-5 py-2.5">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...member.payments].reverse().map((p) => (
                    <tr key={p._id}>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums">{formatDate(p.date)}</td>
                      <td className="px-5 py-3">
                        {p.kind === "NEW" ? "New membership" : "Renewal"}
                        <div className="text-xs text-slate-500">
                          {formatDate(p.periodFrom)} – {p.periodTo ? formatDate(p.periodTo) : "Lifetime"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">
                        {formatMoney(p.amount)}
                        {p.refunded && <div className="text-xs text-violet-700">Refunded</div>}
                      </td>
                      <td className="px-5 py-3">
                        {p.receiptNo ? (
                          <button type="button" className={buttonClass.ghost} onClick={() => open(`/account/receipts/${p._id}.pdf`)}>
                            {p.receiptNo}
                          </button>
                        ) : (
                          <span className="text-slate-400">–</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="My details"
            action={
              !editing && (
                <button type="button" className={buttonClass.ghost} onClick={() => setEditing(true)}>
                  Edit contact details
                </button>
              )
            }
          >
            {editing ? (
              <EditDetails
                member={member}
                onCancel={() => setEditing(false)}
                onSaved={(res) => {
                  setAccount(res);
                  setEditing(false);
                  setFlash("Your details have been updated.");
                }}
              />
            ) : (
              <div className="space-y-5">
                <Details
                  rows={[
                    ["Email", member.email],
                    ["Number", member.whatsapp],
                    ...(isInstitution ? [["Authorized contact person", member.contactPerson]] : [["Date of birth", formatDate(member.dob)]]),
                    ["Address", [a.line1, a.line2, a.city, a.state && `${a.state} – ${a.pincode}`].filter(Boolean).join(", ")],
                    ["Affiliation", member.affiliated ? [af.designation, af.department, af.institution].filter(Boolean).join(", ") : "Not affiliated"],
                    ["Members directory", member.showInPublicList ? "Listed" : "Not listed"],
                  ]}
                />
                <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">
                  To change your name, email, date of birth, photo or documents, please contact the membership office
                  {config?.contact?.email ? ` at ${config.contact.email}` : ""}.
                </p>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <RenewCard account={account} onUpdated={setAccount} />
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { status } = useMemberAuth();
  if (status === "checking") return <Spinner label="Checking your session…" />;
  if (status !== "in") return <LoginView />;
  return <Dashboard />;
}
