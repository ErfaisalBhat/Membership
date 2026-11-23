import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api/client";
import { formatDate, formatMoney, todayISO } from "../shared/format";
import StatusBadge from "../ui/StatusBadge";
import Pagination from "../ui/Pagination";
import { Alert, Details, EmptyState, Field, PageHeader, Spinner, buttonClass, inputClass } from "../ui/form";

const TABS = [
  ["", "All"],
  ["PAID", "Paid"],
  ["CREATED", "In progress"],
  ["FAILED", "Failed"],
  ["REFUNDED", "Refunded"],
  ["attention", "Needs attention"],
];

function RefundForm({ order, onDone, onCancel }) {
  const [form, setForm] = useState({ amount: order.amount, date: todayISO(), reference: "", note: "", deactivate: order.purpose === "NEW" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api(`/admin/payments/${order._id}/refund`, { method: "POST", json: form });
      onDone(res.order, "Refund recorded.");
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.errors);
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-600">
        First make the refund in your payment gateway's dashboard, then record it here so the records match.
      </p>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount refunded (₹)" htmlFor="rf-amount" required error={errors.amount}>
          <input id="rf-amount" type="number" min="1" className={inputClass(errors.amount)} value={form.amount} onChange={set("amount")} />
        </Field>
        <Field label="Refund date" htmlFor="rf-date" required error={errors.date}>
          <input id="rf-date" type="date" className={inputClass(errors.date)} value={form.date} onChange={set("date")} />
        </Field>
        <Field label="Refund reference" htmlFor="rf-ref">
          <input id="rf-ref" className={inputClass()} value={form.reference} onChange={set("reference")} />
        </Field>
        <Field label="Note" htmlFor="rf-note">
          <input id="rf-note" className={inputClass()} value={form.note} onChange={set("note")} maxLength={300} />
        </Field>
      </div>
      {order.memberId && (
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700" checked={form.deactivate} onChange={set("deactivate")} />
          <span className="text-sm text-slate-700">Also make the membership inactive</span>
        </label>
      )}
      <div className="flex gap-2">
        <button type="submit" className={buttonClass.danger} disabled={busy}>
          {busy ? "Saving…" : "Record refund"}
        </button>
        <button type="button" className={buttonClass.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function OrderDetail({ order, onChange }) {
  const [refunding, setRefunding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function check() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api(`/admin/payments/${order._id}/check`, { method: "POST" });
      onChange(res.order);
      setMessage({ kind: "info", text: `The gateway reports: ${res.order.status.toLowerCase()}.` });
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 bg-slate-50/60 px-4 py-4">
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      {order.memberMissing && (
        <Alert kind="warning">
          The member record created by this payment no longer exists. It was removed from the database. The payment record is kept for your accounts.
        </Alert>
      )}
      {order.failureReason && <Alert kind={order.status === "PAID" || order.status === "CREATED" ? "warning" : "info"}>{order.failureReason}</Alert>}
      <Details
        rows={[
          ["Order number", <span className="font-mono">{order.orderNo}</span>],
          ["Email", order.email],
          ["Gateway", order.provider],
          ["Gateway payment ID", order.providerPaymentId],
          ["Method", order.paymentMethod],
          ["Paid on", order.paidAt && formatDate(order.paidAt)],
          ["Receipt", order.receiptNo],
          ["Period", order.periodFrom && `${formatDate(order.periodFrom)} – ${order.periodTo ? formatDate(order.periodTo) : "Lifetime"}`],
          ["Refund", order.refund && `${formatMoney(order.refund.amount)} on ${formatDate(order.refund.date)}${order.refund.reference ? ` (${order.refund.reference})` : ""}${order.refund.note ? ` — ${order.refund.note}` : ""}`],
        ]}
      />
      <div className="flex flex-wrap gap-2">
        {order.memberId && !order.memberMissing && (
          <Link to={`/admin/members/${order.memberId}`} className={buttonClass.secondary}>
            Open member
          </Link>
        )}
        {(!order.memberId || order.memberMissing) && order.applicationId && !order.applicationMissing && (
          <Link to={`/admin/applications/${order.applicationId}`} className={buttonClass.secondary}>
            Open application
          </Link>
        )}
        {(order.status === "CREATED" || (order.status === "FAILED" && order.provider !== "test")) && (
          <button type="button" className={buttonClass.secondary} disabled={busy} onClick={check}>
            {busy ? "Checking…" : "Check status with gateway"}
          </button>
        )}
        {order.status === "PAID" && !refunding && (
          <button type="button" className={buttonClass.secondary} onClick={() => setRefunding(true)}>
            Record a refund
          </button>
        )}
      </div>
      {refunding && (
        <RefundForm
          order={order}
          onCancel={() => setRefunding(false)}
          onDone={(o, text) => {
            onChange(o);
            setRefunding(false);
            setMessage({ kind: "success", text });
          }}
        />
      )}
    </div>
  );
}

// Online payments (orders). Offline payments are on each member's page.
export default function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("attention") === "1" ? "attention" : params.get("status") || "";
  const purpose = params.get("purpose") || "";
  const search = params.get("search") || "";
  const page = Number(params.get("page") || 1);
  const [searchInput, setSearchInput] = useState(search);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => update({ search: searchInput.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    let alive = true;
    setData(null);
    const q = new URLSearchParams({ page: String(page) });
    if (tab === "attention") q.set("attention", "1");
    else if (tab) q.set("status", tab);
    if (purpose) q.set("purpose", purpose);
    if (search) q.set("search", search);
    api(`/admin/payments?${q}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [tab, purpose, search, page]);

  const replaceOrder = (o) => setData((d) => ({ ...d, items: d.items.map((x) => (x._id === o._id ? { ...x, ...o } : x)) }));

  return (
    <div>
      <PageHeader title="Payments" subtitle="Online payments for new memberships and renewals. Offline payments are listed on each member's page." />
      <div className="space-y-4">
        <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200">
          {TABS.map(([key, label]) => (
            <button
              key={key || "all"}
              type="button"
              onClick={() => update(key === "attention" ? { attention: "1", status: "" } : { status: key, attention: "" })}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${
                tab === key ? "border-brand-700 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            placeholder="Search name, email, order, receipt or payment ID"
            className={`${inputClass()} sm:max-w-sm`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search payments"
          />
          <select className={`${inputClass()} sm:w-48`} value={purpose} onChange={(e) => update({ purpose: e.target.value })} aria-label="Filter by purpose">
            <option value="">New and renewals</option>
            <option value="NEW">New memberships</option>
            <option value="RENEWAL">Renewals</option>
          </select>
        </div>

        {error && <Alert>{error}</Alert>}
        {!data ? (
          !error && <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState>No payments found.</EmptyState>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Payer</th>
                      <th className="px-4 py-3">For</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  {data.items.map((o) => (
                    <tbody key={o._id} className="divide-y divide-slate-100 border-b border-slate-100 last:border-0">
                      <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(openId === o._id ? null : o._id)} aria-expanded={openId === o._id}>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(o.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{o.name}</div>
                          <div className="font-mono text-xs text-slate-500">{o.orderNo}</div>
                        </td>
                        <td className="px-4 py-3">
                          {o.purpose === "NEW" ? "New membership" : "Renewal"}
                          <div className="text-xs text-slate-500">{o.typeLabel}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatMoney(o.amount)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={o.status} />
                            {o.failureReason && (o.status === "PAID" || o.status === "CREATED") && (
                              <span className="h-2 w-2 rounded-full bg-amber-500" title="Needs attention" aria-label="Needs attention" />
                            )}
                          </div>
                        </td>
                      </tr>
                      {openId === o._id && (
                        <tr>
                          <td colSpan={5} className="p-0">
                            <OrderDetail order={o} onChange={replaceOrder} />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  ))}
                </table>
              </div>
            </div>
            <Pagination page={data.page} pages={data.pages} total={data.total} noun="payment" onChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
