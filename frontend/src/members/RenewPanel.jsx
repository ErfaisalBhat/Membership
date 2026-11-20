import { useState } from "react";
import { ApiError, api } from "../api/client";
import { formatDate, todayISO } from "../shared/format";
import { Alert, Field, buttonClass, inputClass } from "../ui/form";

export default function RenewPanel({ member, config, onDone }) {
  const fee = config.membershipTypes.find((t) => t.key === member.membershipType)?.fee ?? "";
  const [form, setForm] = useState({ amount: fee, mode: "", reference: "", date: todayISO() });
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
      const res = await api(`/members/${member._id}/renew`, { method: "POST", json: form });
      let msg = `Membership renewed. Now valid till ${formatDate(res.member.expiryDate)}.`;
      if (res.email?.sent && !res.email.simulated) msg += " The updated ID card and receipt were emailed to the member.";
      else if (res.email && !res.email.sent) msg += ` The email could not be sent: ${res.email.error}`;
      onDone(res.member, msg);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.errors);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const stillValid = member.status === "ACTIVE";
  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <p className="text-sm text-slate-600">
        {stillValid
          ? `The new period will start the day after the current expiry (${formatDate(member.expiryDate)}).`
          : "The membership has expired, so the new period will start from the payment date."}
      </p>
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" htmlFor="r-amount" required error={errors["payment.amount"]}>
          <input id="r-amount" type="number" min="0" className={inputClass(errors["payment.amount"])} value={form.amount} onChange={set("amount")} />
        </Field>
        <Field label="Mode" htmlFor="r-mode" required error={errors["payment.mode"]}>
          <select id="r-mode" className={inputClass(errors["payment.mode"])} value={form.mode} onChange={set("mode")}>
            <option value="">Select…</option>
            {config.paymentModes.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Reference" htmlFor="r-ref" error={errors["payment.reference"]}>
          <input id="r-ref" className={inputClass(errors["payment.reference"])} value={form.reference} onChange={set("reference")} />
        </Field>
        <Field label="Payment date" htmlFor="r-date" required error={errors["payment.date"]}>
          <input id="r-date" type="date" className={inputClass(errors["payment.date"])} value={form.date} onChange={set("date")} />
        </Field>
      </div>
      <button type="submit" className={`${buttonClass.primary} w-full`} disabled={busy}>
        {busy ? "Renewing…" : "Record payment and renew"}
      </button>
    </form>
  );
}
