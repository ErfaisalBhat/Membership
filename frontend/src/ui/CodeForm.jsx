import { useState } from "react";
import { Alert, Field, buttonClass, inputClass } from "./form";

// Two-step "email -> 6-digit code" form, used for joining and for member login.
//
// requestCode(email) -> Promise; verifyCode(email, code) -> Promise.
// Errors thrown by either are shown in the form; onRequestError lets the page
// handle special cases (e.g. "already a member") instead.
export default function CodeForm({ requestCode, verifyCode, emailLabel = "Email address", submitLabel = "Send code", onRequestError, intro }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function send(e) {
    e?.preventDefault();
    setError("");
    setNote("");
    setBusy(true);
    try {
      const res = await requestCode(email.trim());
      setStep("code");
      setCode("");
      if (res?.emailLogOnly) setNote("Email is in log mode on the server: the code is printed in the backend console.");
    } catch (err) {
      if (!(onRequestError && onRequestError(err))) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await verifyCode(email.trim(), code);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={send} className="space-y-4" noValidate>
        {intro}
        {error && <Alert>{error}</Alert>}
        <Field label={emailLabel} htmlFor="code-email">
          <input
            id="code-email"
            type="email"
            className={inputClass()}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="name@example.com"
            required
            autoFocus
          />
        </Field>
        <button type="submit" className={`${buttonClass.primary} w-full`} disabled={busy || !email.trim()}>
          {busy ? "Sending…" : submitLabel}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      <p className="text-sm text-slate-600">
        We sent a 6-digit code to <strong className="text-slate-900">{email}</strong>. It is valid for 10 minutes.
      </p>
      {note && <Alert kind="info">{note}</Alert>}
      {error && <Alert>{error}</Alert>}
      <Field label="Verification code" htmlFor="code-value">
        <input
          id="code-value"
          className={`${inputClass()} text-center font-mono text-lg tracking-[0.5em]`}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          autoFocus
        />
      </Field>
      <button type="submit" className={`${buttonClass.primary} w-full`} disabled={busy || code.length !== 6}>
        {busy ? "Checking…" : "Verify"}
      </button>
      <div className="flex justify-between text-sm">
        <button type="button" className={buttonClass.ghost} onClick={() => setStep("email")}>
          Change email
        </button>
        <button type="button" className={buttonClass.ghost} onClick={send} disabled={busy}>
          Send a new code
        </button>
      </div>
    </form>
  );
}
