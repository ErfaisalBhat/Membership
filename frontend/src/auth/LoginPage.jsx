import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useConfig } from "../api/useConfig";
import Brand from "../ui/Brand";
import { Alert, Field, buttonClass, inputClass } from "../ui/form";

export default function LoginPage() {
  const { status, login } = useAuth();
  const { config } = useConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const target = location.state?.from || "/admin";
  if (status === "in") return <Navigate to={target} replace />;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Brand config={config} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Admin login</h1>
          <p className="mt-1 text-sm text-slate-500">Membership office only.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            {error && <Alert>{error}</Alert>}
            <Field label="Username" htmlFor="username">
              <input id="username" className={inputClass()} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
            </Field>
            <Field label="Password" htmlFor="password">
              <input
                id="password"
                type="password"
                className={inputClass()}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <button type="submit" className={`${buttonClass.primary} w-full`} disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm">
          <Link to="/" className="text-slate-500 hover:text-slate-800">
            ← Back to the website
          </Link>
        </p>
      </div>
    </div>
  );
}
