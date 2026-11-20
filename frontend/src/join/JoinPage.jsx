import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api, joinTokenStore } from "../api/client";
import { typeInfo, useConfig } from "../api/useConfig";
import { formatDate, formatMoney } from "../shared/format";
import { emptyPerson, setIn } from "../shared/formState";
import PersonFields from "../members/PersonFields";
import PlanCards from "../public/PlanCards";
import Checkout from "../payments/Checkout";
import CodeForm from "../ui/CodeForm";
import Icon from "../ui/icons";
import { Alert, Card, Details, Spinner, buttonClass } from "../ui/form";

// Joining, in the order of the process flow:
//   plan -> verify email (duplicate check + OTP) -> details -> review and pay -> done
// An unpaid application is kept, so verifying the same email later goes straight to payment.

const STEPS = [
  ["plan", "Plan"],
  ["email", "Verify email"],
  ["details", "Your details"],
  ["pay", "Payment"],
];

function Stepper({ step }) {
  const current = STEPS.findIndex(([k]) => k === step);
  return (
    <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Progress">
      {STEPS.map(([key, label], i) => {
        const done = i < current || step === "done";
        const active = i === current;
        return (
          <li key={key} className="min-w-0">
            <div className={`h-1 rounded-full ${done || active ? "bg-brand-700" : "bg-slate-200"}`} />
            <p className={`mt-2 truncate text-xs font-medium ${active ? "text-brand-700" : done ? "text-slate-700" : "text-slate-400"}`}>
              <span className="hidden sm:inline">{i + 1}. </span>
              {label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export default function JoinPage() {
  const { config, error: configError } = useConfig();
  const [params] = useSearchParams();
  const [step, setStep] = useState("loading");
  const [plan, setPlan] = useState(params.get("type") || "");
  const [email, setEmail] = useState("");
  const [existing, setExisting] = useState(false); // email already belongs to a member
  const [resume, setResume] = useState(null); // saved application offered after verifying
  const [application, setApplication] = useState(null);
  const [member, setMember] = useState(null);
  const [form, setForm] = useState(emptyPerson);
  const [files, setFiles] = useState({});
  const [errors, setErrors] = useState({});
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState(null);
  const [payMessage, setPayMessage] = useState(null);
  const topRef = useRef(null);

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Coming back in the same tab: continue where the applicant left off.
  useEffect(() => {
    if (!joinTokenStore.get()) return setStep("plan");
    api("/join/application", { auth: "join" })
      .then((res) => {
        if (res.application?.status === "PAID" && res.member) {
          setApplication(res.application);
          setMember(res.member);
          setStep("done");
        } else if (res.application?.status === "PENDING") {
          setApplication(res.application);
          setEmail(res.application.email);
          setStep("pay");
        } else setStep("plan");
      })
      .catch(() => {
        joinTokenStore.clear();
        setStep("plan");
      });
  }, []);

  // Join token expired mid-way.
  useEffect(() => {
    const end = () => {
      setBanner("Your email verification has expired. Please verify your email again.");
      setStep("email");
    };
    window.addEventListener("mp:join-session-ended", end);
    return () => window.removeEventListener("mp:join-session-ended", end);
  }, []);

  useEffect(() => {
    if (step !== "loading") scrollTop();
  }, [step]);

  function choosePlan(key) {
    setPlan(key);
    setForm((f) => ({ ...f, membershipType: key, affiliated: key === "STUDENT" ? "Yes" : f.affiliated }));
  }

  // ---------- email ----------
  const requestCode = (value) => {
    setExisting(false);
    return api("/join/otp", { method: "POST", json: { email: value }, auth: false });
  };
  const onRequestError = (err) => {
    if (err.code === "MEMBER_EXISTS") {
      setExisting(true);
      return true;
    }
    return false;
  };
  async function verifyCode(value, code) {
    const res = await api("/join/verify", { method: "POST", json: { email: value, code }, auth: false });
    joinTokenStore.set(res.joinToken);
    setEmail(res.email);
    setBanner("");
    if (res.application) {
      setResume(res.application);
      setStep("resume");
    } else {
      setForm((f) => ({ ...f, membershipType: plan, affiliated: plan === "STUDENT" ? "Yes" : f.affiliated }));
      setStep("details");
    }
  }

  // ---------- details ----------
  function clearError(path) {
    setErrors((e) => {
      if (!e[path]) return e;
      const next = { ...e };
      delete next[path];
      return next;
    });
  }
  function set(path, value) {
    setForm((f) => setIn(f, path, value));
    clearError(path);
  }
  function pickFile(key, file) {
    setFiles((f) => ({ ...f, [key]: file || undefined }));
    clearError(`documents.${key}`);
  }

  async function submitDetails(e) {
    e.preventDefault();
    setBanner("");
    setBusy(true);
    const affiliated = form.membershipType === "STUDENT" || form.affiliated === "Yes";
    const fd = new FormData();
    fd.append("data", JSON.stringify({ ...form, membershipType: plan, affiliated: affiliated ? "Yes" : "No", acceptTerms }));
    for (const [key, file] of Object.entries(files)) if (file) fd.append(key, file);
    try {
      const res = await api("/join/application", { method: "POST", form: fd, auth: "join" });
      setApplication(res.application);
      setErrors({});
      setStep("pay");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.errors).length) setErrors(err.errors);
      if (err.code === "MEMBER_EXISTS") setExisting(true);
      setBanner(err.message);
      scrollTop();
    } finally {
      setBusy(false);
    }
  }

  async function startOver() {
    setBusy(true);
    try {
      await api("/join/application", { method: "DELETE", auth: "join" });
      setResume(null);
      setApplication(null);
      setForm((f) => ({ ...f, membershipType: plan }));
      setStep(plan ? "details" : "plan");
    } catch (err) {
      setBanner(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ---------- payment ----------
  async function pay() {
    setBanner("");
    setPayMessage(null);
    setBusy(true);
    try {
      const res = await api("/join/application/checkout", { method: "POST", auth: "join" });
      setCheckout(res.checkout);
    } catch (err) {
      setBanner(err.message);
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
        const res = await api(`/join/orders/${order.orderId}/confirm`, { method: "POST", json: { result }, auth: "join" });
        if (res.order.status === "PAID" && res.member) {
          setApplication(res.application);
          setMember(res.member);
          setStep("done");
        } else if (res.order.status === "FAILED") {
          setPayMessage({ kind: "error", text: "The payment was not completed. Your application is saved — you can try again now." });
        } else {
          setPayMessage({
            kind: "warning",
            text: "We are waiting for the payment gateway to confirm your payment. You will receive an email with your ID card once it is confirmed. Please do not pay again.",
          });
        }
      } catch (err) {
        setPayMessage({ kind: "error", text: err.message });
      } finally {
        setBusy(false);
      }
    },
    [checkout]
  );
  const onCancel = useCallback(() => setCheckout(null), []);

  if (configError) return <div className="mx-auto max-w-3xl px-4 py-10"><Alert>{configError.message}</Alert></div>;
  if (!config || step === "loading") return <Spinner />;

  const chosen = typeInfo(config, plan);
  const appType = application ? typeInfo(config, application.membershipType) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6" ref={topRef}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Become a member</h1>
        <p className="mt-1 text-sm text-slate-500">{config.orgName}</p>
      </div>
      {step !== "done" && step !== "resume" && <Stepper step={step} />}
      {banner && (
        <div className="mb-6">
          <Alert onClose={() => setBanner("")}>{banner}</Alert>
        </div>
      )}

      {step === "plan" && (
        <div className="space-y-6">
          <PlanCards config={config} selected={plan} onSelect={choosePlan} />
          <div className="flex justify-end">
            <button type="button" className={buttonClass.primary} disabled={!chosen} onClick={() => setStep("email")}>
              Continue <Icon name="arrowRight" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === "email" && (
        <div className="mx-auto max-w-md space-y-4">
          {chosen && (
            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 text-sm">
              <span>
                <span className="font-medium text-slate-900">{chosen.label}</span>
                <span className="text-slate-500"> · {formatMoney(chosen.fee)}</span>
              </span>
              <button type="button" className={buttonClass.ghost} onClick={() => setStep("plan")}>
                Change
              </button>
            </div>
          )}
          <Card>
            {existing ? (
              <div className="space-y-4">
                <Alert kind="info" title="You are already a member">
                  This email address already belongs to a member. Log in to your member account to download your ID card or renew your membership.
                </Alert>
                <Link to="/account" className={`${buttonClass.primary} w-full`}>
                  Go to member login
                </Link>
                <button type="button" className={`${buttonClass.ghost} w-full justify-center`} onClick={() => setExisting(false)}>
                  Use a different email
                </button>
              </div>
            ) : (
              <CodeForm
                requestCode={requestCode}
                verifyCode={verifyCode}
                onRequestError={onRequestError}
                submitLabel="Send verification code"
                intro={
                  <p className="text-sm text-slate-600">
                    We will send a one-time code to your email. Your ID card and receipt will be delivered to this address, so please use one you check regularly.
                  </p>
                }
              />
            )}
          </Card>
        </div>
      )}

      {step === "resume" && resume && (
        <Card className="mx-auto max-w-lg">
          <h2 className="text-lg font-semibold text-slate-900">Continue your saved application?</h2>
          <p className="mt-2 text-sm text-slate-600">
            You started an application for <strong>{resume.typeLabel}</strong> on {formatDate(resume.createdAt)} that has not been paid yet.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass.primary}
              onClick={() => {
                setApplication(resume);
                setStep("pay");
              }}
            >
              Continue to payment
            </button>
            <button type="button" className={buttonClass.secondary} disabled={busy} onClick={startOver}>
              Start a new application
            </button>
          </div>
        </Card>
      )}

      {step === "details" && (
        <form onSubmit={submitDetails} noValidate className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm">
            <span>
              Applying for <strong className="text-slate-900">{chosen?.label}</strong> · {formatMoney(chosen?.fee)}
            </span>
            <button type="button" className={buttonClass.ghost} onClick={() => setStep("plan")}>
              Change plan
            </button>
          </div>

          <PersonFields
            form={{ ...form, membershipType: plan }}
            set={set}
            errors={errors}
            config={config}
            files={files}
            pickFile={pickFile}
            lockedEmail={email}
            documentsNote="Your documents are stored privately and are only seen by the membership office."
          />

          <section className="space-y-4 rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-xs sm:px-6">
            <h2 className="text-base font-semibold text-slate-900">Consent and declaration</h2>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700" checked={form.showInPublicList} onChange={(e) => set("showInPublicList", e.target.checked)} />
              <span className="text-sm text-slate-700">
                List me in the public members directory (name, membership ID, type, status and date of joining only — never contact details).
              </span>
            </label>
            <div className="rounded-md bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Terms</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
                {config.content.terms.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700"
                checked={acceptTerms}
                onChange={(e) => {
                  setAcceptTerms(e.target.checked);
                  clearError("acceptTerms");
                }}
              />
              <span className="text-sm text-slate-700">I have read and accept the terms, and the information I have given is true.</span>
            </label>
            {errors.acceptTerms && <p className="text-xs text-red-600">{errors.acceptTerms}</p>}
          </section>

          <div className="flex justify-end">
            <button type="submit" className={buttonClass.primary} disabled={busy}>
              {busy ? "Saving…" : "Save and continue to payment"}
            </button>
          </div>
        </form>
      )}

      {step === "pay" && application && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card title="Review your application">
            <Details
              rows={[
                ["Name", application.name],
                ["Email", application.email],
                ["WhatsApp", application.whatsapp],
                ["Membership type", application.typeLabel],
                ["Validity", appType?.validityMonths ? `${appType.validityMonths} months from the date of payment` : "Lifetime"],
              ]}
            />
            <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
              Your application is saved for {config.pendingApplicationDays} days. If you leave now, come back to this page and verify the same email to continue.
            </p>
          </Card>

          <Card title="Payment">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-600">Amount</span>
                <span className="text-2xl font-semibold tabular-nums text-slate-900">{formatMoney(application.amount)}</span>
              </div>
              {payMessage && <Alert kind={payMessage.kind}>{payMessage.text}</Alert>}
              {!config.onlinePayments.enabled ? (
                <Alert kind="warning" title="Online payment is not available yet">
                  Your application has been saved. Please contact the membership office{config.contact.email ? ` at ${config.contact.email}` : ""} to complete the payment.
                </Alert>
              ) : checkout ? (
                <Checkout checkout={checkout} onResult={onResult} onCancel={onCancel} />
              ) : (
                <button type="button" className={`${buttonClass.primary} w-full`} disabled={busy} onClick={pay}>
                  {busy ? "Please wait…" : `Pay ${formatMoney(application.amount)}`}
                </button>
              )}
              <p className="text-xs text-slate-500">UPI, cards and net banking are accepted. Your membership number and ID card are issued as soon as the payment is confirmed.</p>
            </div>
          </Card>
        </div>
      )}

      {step === "done" && member && (
        <Card className="mx-auto max-w-lg text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
            <Icon name="check" className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Welcome, {member.name}</h2>
          <p className="mt-2 text-sm text-slate-600">Your payment is confirmed and your membership is active.</p>
          <dl className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-4 rounded-md bg-slate-50 p-4 text-left">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Membership ID</dt>
              <dd className="font-mono text-sm font-semibold text-slate-900">{member.membershipId}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Valid till</dt>
              <dd className="text-sm font-semibold text-slate-900">{member.expiryDate ? formatDate(member.expiryDate) : "Lifetime"}</dd>
            </div>
          </dl>
          <p className="mt-6 text-sm text-slate-600">
            Your ID card and payment receipt have been emailed to <strong>{application?.email || email}</strong>.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/account" className={buttonClass.primary}>
              Go to my member account
            </Link>
            <Link
              to="/"
              className={buttonClass.secondary}
              onClick={() => {
                joinTokenStore.clear();
              }}
            >
              Back to home
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
