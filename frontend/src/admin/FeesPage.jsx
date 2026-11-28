import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import { reloadConfig } from "../api/useConfig";
import { formatMoney } from "../shared/format";
import { Alert, Field, PageHeader, Spinner, buttonClass, inputClass } from "../ui/form";

// Admin: the fee of each plan. New applicants and renewals pay the new fee straight away;
// payments already made keep their amount.
export default function FeesPage() {
  const [fees, setFees] = useState(null);
  const [form, setForm] = useState({});
  const [paymentPages, setPaymentPages] = useState([]);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const fill = (list) => {
    setFees(list);
    setForm(Object.fromEntries(list.map((f) => [f.key, { fee: String(f.fee), regularFee: String(f.regularFee) }])));
  };

  useEffect(() => {
    api("/admin/fees")
      .then((res) => {
        fill(res.fees);
        setPaymentPages(res.paymentPages || []);
      })
      .catch((err) => setMessage({ kind: "error", text: err.message }));
  }, []);

  const set = (key, field) => (e) => {
    const value = e.target.value.replace(/[^\d]/g, "");
    setForm((f) => ({ ...f, [key]: { ...f[key], [field]: value } }));
    setErrors((er) => {
      const next = { ...er };
      delete next[`${key}.${field}`];
      return next;
    });
  };

  async function save(e) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const res = await api("/admin/fees", { method: "PUT", json: { fees: form } });
      fill(res.fees);
      setErrors({});
      await reloadConfig().catch(() => {});
      setMessage({ kind: "success", text: "Fees saved." });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.errors).length) setErrors(err.errors);
      setMessage({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!fees && !message) return <Spinner />;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Plan fees" />
      <form onSubmit={save} className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
        {message && <Alert kind={message.kind}>{message.text}</Alert>}
        {(fees || []).map((f) => {
          const v = form[f.key] || {};
          const waiver = Number(v.regularFee) - Number(v.fee);
          return (
            <fieldset key={f.key} className="grid gap-4 border-b border-slate-100 pb-5 last:border-0 last:pb-0 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold text-slate-900">{f.label}</legend>
              <Field label="Fee (₹)" htmlFor={`${f.key}-fee`} required error={errors[`${f.key}.fee`]} hint={String(f.fee) !== v.fee ? `Now: ${formatMoney(f.fee)}` : undefined}>
                <input id={`${f.key}-fee`} inputMode="numeric" className={inputClass(errors[`${f.key}.fee`])} value={v.fee ?? ""} onChange={set(f.key, "fee")} />
              </Field>
              <Field
                label="Price before waiver (₹)"
                htmlFor={`${f.key}-regular`}
                error={errors[`${f.key}.regularFee`]}
                hint={waiver > 0 ? `Shown struck out; waiver of ${formatMoney(waiver)}.` : "Same as the fee, or empty: no waiver shown."}
              >
                <input
                  id={`${f.key}-regular`}
                  inputMode="numeric"
                  className={inputClass(errors[`${f.key}.regularFee`])}
                  value={v.regularFee ?? ""}
                  onChange={set(f.key, "regularFee")}
                />
              </Field>
            </fieldset>
          );
        })}
        <p className="text-xs text-slate-500">
          New fees apply at once to the plans page, new applications and renewals. Payments already made keep the amount that was paid.
        </p>
        <button type="submit" className={buttonClass.primary} disabled={busy || !fees}>
          {busy ? "Saving…" : "Save fees"}
        </button>
      </form>
    </div>
  );
}
