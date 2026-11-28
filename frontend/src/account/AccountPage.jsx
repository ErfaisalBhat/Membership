import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiBlob, openInNewTab } from "../api/client";
import { formatDate, formatMoney } from "../shared/format";
import Checkout from "../payments/Checkout";
import CodeForm from "../ui/CodeForm";
import StatusBadge from "../ui/StatusBadge";
import Icon from "../ui/icons";
import { Alert, Card, Details, Spinner, buttonClass } from "../ui/form";
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
        <p className="mt-1 text-sm text-slate-500">Download your ID card and receipts, and renew your membership online.</p>
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

// renewRequest: goes up by one each time "Renew" in the header is clicked; the card then
// scrolls into view and opens the payment when renewal is open.
function RenewCard({ account, onUpdated, renewRequest = 0 }) {
  const { member, renewal, onlinePayments } = account;
  const [checkout, setCheckout] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!renewRequest) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (renewal.canRenew && onlinePayments && !checkout && !busy) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renewRequest]);

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

  // Life membership: "Valid till: Lifetime" above already says there is nothing to renew.
  if (member.expiryDate === null) return null;

  return (
    <div ref={cardRef} className="scroll-mt-6">
    <Card title="Renewal">
      <div className="space-y-4">
        {message && <Alert kind={message.kind}>{message.text}</Alert>}
        {renewal.canRenew ? (
          <>
            <p className="text-sm text-slate-600">
              Renewing now extends your membership to <strong className="text-slate-900">{formatDate(renewal.periodTo)}</strong>.
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
                {busy ? "Please wait…" : "Renew now"}
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
    </div>
  );
}

function Dashboard() {
  const { account, setAccount, logout } = useMemberAuth();
  const [photoUrl, setPhotoUrl] = useState(null);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [renewRequest, setRenewRequest] = useState(0);
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My membership</h1>
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
          <div className="flex shrink-0 flex-col gap-2">
            <button type="button" className={buttonClass.primary} onClick={() => open("/account/card.pdf")}>
              <Icon name="download" className="h-4 w-4" /> ID card (PDF)
            </button>
            {/* Memberships that expire: opens the Renewal box (and the payment, once renewal is open). */}
            {member.expiryDate && (
              <button
                type="button"
                className={account.renewal.canRenew ? buttonClass.primary : buttonClass.secondary}
                onClick={() => setRenewRequest((n) => n + 1)}
              >
                <Icon name="refresh" className="h-4 w-4" /> Renew membership
              </button>
            )}
          </div>
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

          <Card title="My details">
            <Details
              rows={[
                ["Email", member.email],
                ["Number", member.whatsapp],
                ...(isInstitution
                  ? [["Authorized contact person", member.contactPerson], ...(member.pan?.number ? [["PAN", member.pan.number]] : [])]
                  : [["Date of birth", formatDate(member.dob)]]),
                ["Address", [a.line1, a.line2, a.city, a.state && `${a.state} – ${a.pincode}`].filter(Boolean).join(", ")],
                ["Affiliation", member.affiliated ? [af.designation, af.department, af.institution].filter(Boolean).join(", ") : "Not affiliated"],
              ]}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <RenewCard account={account} onUpdated={setAccount} renewRequest={renewRequest} />
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
