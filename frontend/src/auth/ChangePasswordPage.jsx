import { useState } from "react";
import { api } from "../api/client";
import { Alert, Field, PageHeader, buttonClass, inputClass } from "../ui/form";

export default function ChangePasswordPage() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setMessage(null);
    if (form.newPassword !== form.confirm) {
      setMessage({ kind: "error", text: "The new passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        json: { currentPassword: form.currentPassword, newPassword: form.newPassword },
      });
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      setMessage({ kind: "success", text: "Password changed." });
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md">
      <PageHeader title="Change password" />
      <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
        {message && <Alert kind={message.kind}>{message.text}</Alert>}
        <Field label="Current password" htmlFor="cur">
          <input id="cur" type="password" className={inputClass()} value={form.currentPassword} onChange={set("currentPassword")} autoComplete="current-password" required />
        </Field>
        <Field label="New password" htmlFor="new" hint="At least 8 characters.">
          <input id="new" type="password" minLength={8} className={inputClass()} value={form.newPassword} onChange={set("newPassword")} autoComplete="new-password" required />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <input id="confirm" type="password" minLength={8} className={inputClass()} value={form.confirm} onChange={set("confirm")} autoComplete="new-password" required />
        </Field>
        <button type="submit" className={buttonClass.primary} disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
