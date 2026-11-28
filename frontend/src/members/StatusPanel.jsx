import { useState } from "react";
import { api } from "../api/client";
import { Alert, Field, buttonClass, inputClass } from "../ui/form";

// Debarred by the admin (stored as status INACTIVE). Reinstating returns the member
// to Active, or to Expired if the validity date has already passed.
export default function StatusPanel({ member, onDone }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inactive = member.status === "INACTIVE";

  async function run(action) {
    if (action === "deactivate" && !window.confirm(`Debar ${member.name}?`)) return;
    setError("");
    setBusy(true);
    try {
      const res = await api(`/members/${member._id}/status`, { method: "POST", json: { action, reason } });
      setReason("");
      onDone(res.member, action === "deactivate" ? "Member debarred." : "Membership reinstated.");
    } catch (err) {
      setError(err.errors?.reason || err.message);
    } finally {
      setBusy(false);
    }
  }

  if (inactive) {
    return (
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">Reinstating lifts the debarment and makes the membership Active again (or Expired, if its validity has ended).</p>
        <button type="button" className={`${buttonClass.primary} w-full`} disabled={busy} onClick={() => run("reinstate")}>
          {busy ? "Saving…" : "Reinstate membership"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <Field label="Reason" htmlFor="s-reason" required hint="For example: debarred by the Governing Body.">
        <textarea id="s-reason" rows={2} maxLength={300} className={inputClass()} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <button type="button" className={`${buttonClass.danger} w-full`} disabled={busy || !reason.trim()} onClick={() => run("deactivate")}>
        {busy ? "Saving…" : "Debar member"}
      </button>
    </div>
  );
}
