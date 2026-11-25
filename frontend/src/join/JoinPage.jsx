import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
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
//   plan -> verify email (duplicate check + OTP) -> details -> pay -> admin review
// Once approved, the member is registered and the ID card emailed. Verifying the same
// email later continues where they left off: details saved -> pay, paid -> status.
// (Applications approved under the older flow also pay on the "pay" step.)

const STEPS = [
  ["plan", "Plan"],
  ["email", "Verify email"],
  ["details", "Your details"],
  ["pay", "Payment"],
  ["review", "Review"],
];

// Which step shows a saved application.
// Whether this tab opened the Zoho payment page for the application (survives a reload).
const zohoOpenedFor = (id) => {
  try {
    return !!id && sessionStorage.getItem("mp_zoho_opened") === id;
  } catch {
    return false;
  }
};

const stepFor = (application) => (["UNPAID", "APPROVED"].includes(application.status) ? "pay" : "review");

function Stepper({ step }) {
  const current = STEPS.findIndex(([k]) => k === step);
  return (
    <ol className="mb-8 grid grid-cols-5 gap-2" aria-label="Progress">
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
  const location = useLocation();
  const [step, setStep] = useState("loading");
  const [plan, setPlan] = useState(params.get("type") || "");
  const [email, setEmail] = useState("");
  const [existing, setExisting] = useState(false); // email already belongs to a member
  const [alreadyApplied, setAlreadyApplied] = useState(""); // message: this email already applied for this plan
  // ?type=<plan> for the join endpoints: one email can have an application per plan.
  const planQuery = (type) => (type ? `?type=${encodeURIComponent(type)}` : "");
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
  const [paidOrder, setPaidOrder] = useState(null); // fee paid, details not yet approved
  const [pagePaying, setPagePaying] = useState(false); // Zoho payment page opened in another tab
  // DigiLocker (Aadhaar auto-fill for the plans in config.digilocker.types — Annual and Life):
  //   digi    { verificationId, last4, locked } once the details came from Aadhaar
  //   manual  the applicant chose, or was sent back, to fill the form by hand
  const [digi, setDigi] = useState(null);
  const [savedDigi, setSavedDigi] = useState(null); // this email's verification, kept from the server
  const [manual, setManual] = useState(false);
  const [digiAvailable, setDigiAvailable] = useState(null); // null = not asked yet; false = Cashfree down
  const [digiNotice, setDigiNotice] = useState("");
  // Institutional: the organisation's PAN checked with the Income Tax records
  // ({ verificationId, pan, name, panType, locked }); fills and locks the PAN and institution name.
  const [savedPan, setSavedPan] = useState(null);
  const [panBusy, setPanBusy] = useState(false);
  const [panDown, setPanDown] = useState(false); // Cashfree down / out of credits: PAN typed by hand
  const panInfo = plan === "INSTITUTIONAL" ? savedPan : null;
  const topRef = useRef(null);

  useEffect(() => {
    if (!panInfo) return;
    setForm((f) => ({ ...f, pan: panInfo.pan, ...(panInfo.name ? { name: panInfo.name } : {}) }));
  }, [panInfo]);

  async function verifyPan() {
    // Checked here first so a wrong or personal PAN never reaches Cashfree (each check costs a credit).
    const pan = String(form.pan || "").toUpperCase();
    const problem = !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)
      ? "Enter a valid 10-character PAN, e.g. AAABA1234B."
      : ["P", "H"].includes(pan[3])
        ? "This is a personal PAN. Please enter the PAN of the institution or organisation, not of a person."
        : "";
    if (problem) {
      setErrors((e) => ({ ...e, pan: problem }));
      return;
    }
    setPanBusy(true);
    try {
      const res = await api("/join/pan/verify", { method: "POST", json: { pan: form.pan }, auth: "join" });
      setSavedPan(res);
      clearError("pan");
      clearError("name");
    } catch (err) {
      if (err.code === "PAN_UNAVAILABLE") {
        // Cashfree down or out of credits: quietly let the PAN be typed by hand.
        setPanDown(true);
        clearError("pan");
      } else setErrors((e) => ({ ...e, pan: err.errors?.pan || err.message }));
    } finally {
      setPanBusy(false);
    }
  }

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Fills the form from a DigiLocker result and locks those fields. Once verified, the
  // applicant is never offered DigiLocker or the manual form again for this email.
  // type: the plan the form is for (Annual or Life).
  function applyDigilocker(result, type) {
    const p = result.prefill || {};
    const filled = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v));
    // Everything Aadhaar has replaces what was typed (those fields are locked); what Aadhaar
    // doesn't have stays as the applicant typed it.
    const address = filled(p.address);
    if (p.address?.line1) address.line2 = p.address.line2 || "";
    setForm((f) => ({
      ...f,
      ...filled({ name: p.name, dob: p.dob, gender: p.gender, fatherName: p.fatherName }),
      whatsapp: p.mobile || f.whatsapp || "", // Aadhaar-linked mobile, locked when present
      address: { ...f.address, ...address },
      ...(type ? { membershipType: type } : {}),
    }));
    const d = { verificationId: result.verificationId, last4: result.last4, locked: result.locked || [], prefill: p, photo: result.photo || "" };
    setDigi(d);
    setSavedDigi(d);
    if (type) setPlan(type);
    setManual(false);
    setDigiNotice("");
  }

  // Cashfree is down or out of credits: switch to the manual form without telling the applicant.
  function goManual() {
    setDigi(null);
    setDigiAvailable(false);
    setManual(true);
    setDigiNotice("");
  }

  // Back from DigiLocker (/join?type=<plan>&dl=<id>): fill the form. If the applicant denied,
  // didn't finish or the session expired, they are asked to use DigiLocker again; only when
  // Cashfree itself can't be used do they get the manual form.
  async function completeDigilocker(verificationId) {
    let res;
    try {
      res = await api("/join/digilocker/complete", { method: "POST", json: { verificationId }, auth: "join" });
    } catch (err) {
      if (err.status === 401) return; // join session ended: handled by the listener below
      res = { verified: false, kind: "PENDING", message: "We could not finish the DigiLocker verification. Please try again." };
    }
    if (res.email) {
      setEmail(res.email);
      restoreDraft(res.email);
    }
    const type = params.get("type") || "";
    if (type) setPlan(type);
    if (res.verified) applyDigilocker(res, type);
    else {
      if (type) setForm((f) => ({ ...f, membershipType: type }));
      if (res.kind === "UNAVAILABLE") goManual();
      else {
        setDigi(null);
        setManual(false);
        setDigiNotice(res.message);
      }
    }
    setStep("details");
  }

  // ---------- draft: what the applicant typed survives a refresh and the DigiLocker round trip ----------
  // Kept in this browser tab only (sessionStorage); uploaded files can't be kept and are chosen again.
  const DRAFT_KEY = "mp_join_draft";
  function readDraft() {
    try {
      return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    } catch {
      return null; // storage unavailable
    }
  }
  // withPlan: false when the applicant has just chosen a plan again (after verifying their email).
  function restoreDraft(forEmail, { withPlan = true } = {}) {
    try {
      const d = readDraft();
      if (d && d.email === forEmail && d.form) {
        setForm((f) => ({ ...f, ...d.form, address: { ...f.address, ...d.form.address }, affiliation: { ...f.affiliation, ...d.form.affiliation } }));
        if (withPlan && d.plan) setPlan(d.plan);
        return true;
      }
    } catch {
      /* storage unavailable */
    }
    return false;
  }
  function clearDraft() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
  }
  useEffect(() => {
    if (step !== "details" || !email) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ email, plan, form }));
    } catch {
      /* storage unavailable */
    }
  }, [step, email, plan, form]);

  // Arriving by a link inside the site (e.g. a plan on the home page) starts at the plan and
  // email steps: an earlier application is found only by verifying the email (see verifyCode).
  // A refresh, a direct visit, or the return from DigiLocker (?dl=) continues where the applicant
  // was: verified email, Aadhaar / PAN verification and the details typed so far.
  // Nothing typed is thrown away: the draft (per email) and the DigiLocker / PAN verifications
  // (kept on the server per email) come back as soon as the same email is verified.
  useEffect(() => {
    const inSiteLink = location.key !== "default"; // "default" = the page was (re)loaded
    if (inSiteLink && !params.get("dl")) {
      joinTokenStore.clear();
      return setStep(params.get("continue") ? "email" : "plan");
    }
    if (!joinTokenStore.get()) {
      // ?dl= without a session (DigiLocker opened in another tab), or ?continue=1 (link in an
      // email): verify the email first.
      return setStep(params.get("dl") || params.get("continue") ? "email" : "plan");
    }
    api(`/join/application${planQuery(params.get("type") || readDraft()?.plan || "")}`, { auth: "join" })
      .then((res) => {
        setPaidOrder(res.paidOrder || null);
        if (res.pan) setSavedPan(res.pan);
        if (res.paidOrder) setPlan(res.paidOrder.membershipType);
        if (res.application?.status === "PAID" && res.member) {
          setApplication(res.application);
          setMember(res.member);
          setStep("done");
        } else if (["UNPAID", "PENDING", "APPROVED"].includes(res.application?.status)) {
          setApplication(res.application);
          setEmail(res.application.email);
          setStep(stepFor(res.application));
        } else if (res.digilocker && res.application?.status !== "REJECTED") {
          // Already verified: straight back to the filled, locked form.
          setEmail(res.email);
          restoreDraft(res.email);
          applyDigilocker(res.digilocker, res.paidOrder?.membershipType || params.get("type") || readDraft()?.plan || "");
          setStep("details");
        } else if (params.get("dl")) {
          return completeDigilocker(params.get("dl"));
        } else if (res.application?.status === "REJECTED") {
          setApplication(res.application);
          setEmail(res.application.email);
          if (res.digilocker) setSavedDigi(res.digilocker);
          setStep(stepFor(res.application));
        } else if (res.email && restoreDraft(res.email)) {
          setEmail(res.email);
          setStep("details");
        } else {
          // Email verified but nothing typed yet: choose the plan, then straight to the details.
          setEmail(res.email || "");
          setStep("plan");
        }
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
    setForm((f) => ({ ...f, membershipType: key }));
    // Aadhaar auto-fill applies to some plans only. Going back to one re-uses the verification.
    if (config?.digilocker?.types?.includes(key)) {
      if (savedDigi) applyDigilocker(savedDigi, key);
    } else if (digi) setDigi(null);
  }

  // Leaves for the DigiLocker consent page; only if Cashfree can't be used, fill the form by hand.
  async function startDigilocker() {
    setBusy(true);
    setDigiNotice("");
    try {
      const res = await api("/join/digilocker/start", { method: "POST", json: { membershipType: plan }, auth: "join" });
      window.location.assign(res.url);
    } catch (err) {
      if (err.code === "DIGILOCKER_DONE") {
        // Verified in another tab or earlier: fetch it and fill the form.
        const res = await api(`/join/application${planQuery(plan)}`, { auth: "join" }).catch(() => null);
        if (res?.digilocker) applyDigilocker(res.digilocker, plan);
        setBusy(false);
        return;
      }
      if (err.status === 401) return setBusy(false); // join session ended: handled by the listener below
      if (err.code === "DIGILOCKER_UNAVAILABLE") goManual();
      else setDigiNotice(err.message); // e.g. too many tries: stay on DigiLocker
      setBusy(false);
    }
  }

  // ---------- email ----------
  const requestCode = (value) => {
    setExisting(false);
    setAlreadyApplied("");
    return api("/join/otp", { method: "POST", json: { email: value, membershipType: plan }, auth: false });
  };
  const onRequestError = (err) => {
    if (err.code === "MEMBER_EXISTS") {
      setExisting(true);
      return true;
    }
    if (err.code === "ALREADY_APPLIED") {
      // Already applied for this plan with this email: no code is sent.
      setAlreadyApplied(err.message);
      return true;
    }
    return false;
  };
  async function verifyCode(value, code) {
    const res = await api("/join/verify", { method: "POST", json: { email: value, code, membershipType: plan }, auth: false });
    joinTokenStore.set(res.joinToken);
    setEmail(res.email);
    setBanner("");
    setPaidOrder(res.paidOrder || null);
    if (res.digilocker) setSavedDigi(res.digilocker);
    if (res.pan) setSavedPan(res.pan);
    if (params.get("dl")) return completeDigilocker(params.get("dl"));
    // An earlier application of this email is shown only for the plan chosen now (or when no
    // plan was chosen). One that is paid and under review is always shown, so no payment is lost.
    const earlier = res.application;
    const relevant = earlier && (!plan || earlier.membershipType === plan || ["PENDING", "APPROVED"].includes(earlier.status));
    if (relevant && earlier.status !== "REJECTED") {
      // Details saved and waiting for payment, or paid and under review.
      setApplication(earlier);
      setStep(stepFor(earlier));
    } else if (relevant) {
      // Rejected: show the reason; "Start a new application" continues from there.
      setApplication(earlier);
      setStep("review");
    } else if (res.paidOrder) {
      // A payment not used yet: fill in the details for the plan that was paid for.
      restoreDraft(res.email, { withPlan: false });
      startDetails(res.paidOrder.membershipType, res.digilocker);
    } else if (plan) {
      restoreDraft(res.email, { withPlan: false });
      startDetails(plan, res.digilocker);
    } else {
      setApplication(null);
      setStep("plan");
    }
  }

  // Opens the details form for a plan (Aadhaar auto-fill re-used if verified).
  function startDetails(type, verified = savedDigi) {
    setApplication(null);
    setPlan(type);
    if (verified && config?.digilocker?.types?.includes(type)) {
      applyDigilocker(verified, type);
    } else {
      setDigi(null);
      // A new plan starts with DigiLocker again: Cashfree is asked afresh, and the manual form
      // comes only if it is still down or out of credits.
      setManual(false);
      setDigiAvailable(null);
      setDigiNotice("");
      setForm((f) => ({ ...f, membershipType: type }));
    }
    setStep("details");
  }

  // Email already verified, plan chosen: show this plan's application if there is one
  // (waiting for payment or under review), otherwise open the form for it.
  async function continueWithPlan(type) {
    const res = await api(`/join/application${planQuery(type)}`, { auth: "join" }).catch(() => null);
    const a = res?.application;
    if (a && a.membershipType === type && ["UNPAID", "PENDING", "APPROVED"].includes(a.status)) {
      setApplication(a);
      setStep(stepFor(a));
    } else startDetails(type);
  }

  // After a rejection or withdrawal: fill the form again (no new payment if one is unused).
  function newApplication() {
    if (paidOrder) return startDetails(paidOrder.membershipType);
    if (plan) return startDetails(plan);
    setApplication(null);
    setStep("plan");
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
    const affiliated = form.affiliated === "Yes";
    const fd = new FormData();
    fd.append(
      "data",
      JSON.stringify({ ...form, membershipType: plan, affiliated: affiliated ? "Yes" : "No", acceptTerms, digilockerId: digi?.verificationId || "", panVerificationId: panInfo?.verificationId || "" })
    );
    for (const [key, file] of Object.entries(files)) if (file) fd.append(key, file);
    try {
      const res = await api("/join/application", { method: "POST", form: fd, auth: "join" });
      setApplication(res.application);
      setErrors({});
      clearDraft();
      setPayMessage(null);
      // Not paid yet -> payment; an unused earlier payment was re-used -> under review.
      setStep(stepFor(res.application));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.errors).length) setErrors(err.errors);
      if (err.code === "MEMBER_EXISTS") setExisting(true);
      if (err.code === "DIGILOCKER_EXPIRED") {
        setDigi(null);
        setSavedDigi(null);
        setManual(false);
        setDigiAvailable(null); // ask Cashfree again before showing the DigiLocker screen
      }
      setBanner(err.message);
      scrollTop();
    } finally {
      setBusy(false);
    }
  }

  // Withdraw the open application and fill a new one.
  async function startOver() {
    setBusy(true);
    try {
      await api(`/join/application${planQuery(application?.membershipType || plan)}`, { method: "DELETE", auth: "join" });
      newApplication();
    } catch (err) {
      setBanner(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ---------- payment ----------
  // Pay for the submitted application.
  async function pay() {
    setBanner("");
    setPayMessage(null);
    setBusy(true);
    try {
      const type = application?.membershipType || plan;
      const res = await api("/join/application/checkout", { method: "POST", json: { membershipType: type }, auth: "join" });
      setCheckout(res.checkout);
    } catch (err) {
      if (err.code === "ALREADY_PAID") {
        const res = await api(`/join/application${planQuery(application?.membershipType || plan)}`, { auth: "join" }).catch(() => null);
        if (res?.application) {
          setApplication(res.application);
          setStep(stepFor(res.application));
          return;
        }
      }
      if (err.code === "MEMBER_EXISTS") {
        setExisting(true);
        setStep("email");
      }
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
          // Older flow: approved application paid -> member registered.
          setApplication(res.application);
          setMember(res.member);
          setStep("done");
        } else if (res.order.status === "PAID" && res.application?.status === "PENDING") {
          // Paid: the application now goes to the membership office for review.
          setApplication(res.application);
          setPaidOrder(null);
          setStep("review");
        } else if (res.order.status === "PAID") {
          setPayMessage({ kind: "warning", text: "Your payment was received, but there is a problem with it. The membership office will contact you. Please do not pay again." });
        } else if (res.order.status === "FAILED") {
          setPayMessage({ kind: "error", text: "The payment was not completed and no money was taken. You can try again now." });
        } else {
          setPayMessage({
            kind: "warning",
            text: "We are waiting for the payment gateway to confirm your payment. Please do not pay again. Come back to this page and verify your email in a few minutes to see the status of your application.",
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

  // Zoho payment page: Zoho's webhook sends the application to the admin by itself. While the
  // applicant pays in the other tab, check every few seconds and move on once it has.
  const waitingForZoho =
    step === "pay" && application?.status === "UNPAID" && !config?.onlinePayments?.enabled && !!config?.paymentPages?.[application?.membershipType];
  useEffect(() => {
    if (!waitingForZoho) return;
    const timer = setInterval(async () => {
      const res = await api(`/join/application${planQuery(application?.membershipType)}`, { auth: "join" }).catch(() => null);
      if (res?.application && res.application.status !== "UNPAID") {
        setApplication(res.application);
        setStep(stepFor(res.application));
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [waitingForZoho]);

  // "I have completed the payment": for when Zoho's confirmation is late or another email was
  // used on the Zoho page. The membership office then checks the payment in Zoho.
  async function markPaid() {
    setBusy(true);
    setBanner("");
    try {
      const res = await api("/join/application/paid", { method: "POST", json: { membershipType: application?.membershipType || plan }, auth: "join" });
      setApplication(res.application);
      setStep("review");
    } catch (err) {
      setBanner(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Before offering DigiLocker, ask the server whether Cashfree is up. If it isn't,
  // go straight to the manual form without showing the DigiLocker screen.
  const wantsDigilocker = step === "details" && !!config?.digilocker?.enabled && !!config?.digilocker?.types?.includes(plan) && !digi && !manual;
  useEffect(() => {
    if (!wantsDigilocker || digiAvailable !== null) return;
    let cancelled = false;
    api("/join/digilocker/available", { auth: false })
      .then((res) => !!res.available)
      .catch(() => false)
      .then((available) => {
        if (cancelled) return;
        setDigiAvailable(available);
        if (!available) setManual(true);
      });
    return () => {
      cancelled = true;
    };
  }, [wantsDigilocker, digiAvailable]);

  if (configError) return <div className="mx-auto max-w-3xl px-4 py-10"><Alert>{configError.message}</Alert></div>;
  if (!config || step === "loading") return <Spinner />;

  const chosen = typeInfo(config, plan);
  const digilockerOn = !!config.digilocker?.enabled && config.digilocker.types.includes(plan);
  const askDigilocker = digilockerOn && !digi && !manual; // offer DigiLocker before showing the form
  if (askDigilocker && step === "details" && digiAvailable !== true) return <Spinner />; // checking Cashfree
  const appType = application ? typeInfo(config, application.membershipType) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6" ref={topRef}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Become a member</h1>
      </div>
      {step !== "done" && <Stepper step={step} />}
      {banner && (
        <div className="mb-6">
          <Alert onClose={() => setBanner("")}>{banner}</Alert>
        </div>
      )}

      {step === "plan" && (
        <div className="space-y-6">
          <PlanCards config={config} selected={plan} onSelect={choosePlan} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className={buttonClass.ghost} onClick={() => setStep("email")}>
              Already applied? Continue here
            </button>
            <button
              type="button"
              className={buttonClass.primary}
              disabled={!chosen}
              onClick={() => (email && joinTokenStore.get() ? continueWithPlan(plan) : setStep("email"))}
            >
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
            ) : alreadyApplied ? (
              <div className="space-y-4">
                <Alert kind="info" title="Already applied">
                  {alreadyApplied}
                </Alert>
                <button type="button" className={`${buttonClass.primary} w-full justify-center`} onClick={() => { setAlreadyApplied(""); setStep("plan"); }}>
                  Apply for a different plan
                </button>
                <button type="button" className={`${buttonClass.ghost} w-full justify-center`} onClick={() => setAlreadyApplied("")}>
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

      {step === "review" && application?.status === "PENDING" && (
        <Card className="mx-auto max-w-lg text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Icon name="inbox" className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Application submitted</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your application for <strong>{application.typeLabel}</strong>, submitted on {formatDate(application.createdAt)}, is being reviewed by the
            Membership Section.
            {application.paidOnPage
              ? application.paymentVerified
                ? " Your payment has been received."
                : " We will check your payment."
              : application.paymentOrderId
                ? " Your payment has been received."
                : " You do not need to pay anything yet."}
          </p>
          <p className="mt-3 text-sm text-slate-600">
            {application.paymentOrderId || application.paidOnPage ? (
              <>
                Once it is approved, your membership number, ID card and payment receipt will be emailed to <strong>{application.email}</strong>.
              </>
            ) : (
              <>
                We will email <strong>{application.email}</strong> once it has been reviewed. If it is approved, the email will have a link to pay the
                membership fee ({formatMoney(application.amount)}).
              </>
            )}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/" className={buttonClass.primary} onClick={() => joinTokenStore.clear()}>
              Back to home
            </Link>
          </div>
        </Card>
      )}

      {step === "review" && application?.status === "REJECTED" && (
        <Card className="mx-auto max-w-lg">
          <h2 className="text-lg font-semibold text-slate-900">Your application was not approved</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your application for <strong>{application.typeLabel}</strong> submitted on {formatDate(application.createdAt)} was not approved
            {application.reviewedAt ? ` on ${formatDate(application.reviewedAt)}` : ""}.{paidOrder ? "" : " No payment was taken."}
          </p>
          {application.reviewNote && (
            <div className="mt-4">
              <Alert kind="warning" title="Reason">
                {application.reviewNote}
              </Alert>
            </div>
          )}
          <p className="mt-4 text-sm text-slate-600">
            {paidOrder
              ? `Your payment of ${formatMoney(paidOrder.amount)} is kept. Submit a new application with the correct information without paying again.`
              : "You are welcome to submit a new application with the correct information."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={buttonClass.primary} onClick={newApplication}>
              Start a new application
            </button>
            <Link to="/" className={buttonClass.secondary} onClick={() => joinTokenStore.clear()}>
              Back to home
            </Link>
          </div>
        </Card>
      )}

      {step === "details" && askDigilocker && (
        <Card className="mx-auto max-w-lg">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 text-brand-700">
            <Icon name="shield" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Fill your details automatically with DigiLocker</h2>
          <p className="mt-2 text-sm text-slate-600">
            Log in to DigiLocker with your Aadhaar and allow access. Your name, date of birth, gender, father's name, address and photograph are
            taken from your Aadhaar, and you do not need to upload an ID card. Only the last 4 digits of your Aadhaar number are kept.
          </p>
          {digiNotice && (
            <div className="mt-4">
              <Alert kind="warning" onClose={() => setDigiNotice("")}>
                {digiNotice}
              </Alert>
            </div>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button type="button" className={buttonClass.primary} disabled={busy} onClick={startDigilocker}>
              {busy ? "Opening DigiLocker…" : "Continue with DigiLocker"}
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-500">Your application is reviewed by the membership office before your membership is issued.</p>
        </Card>
      )}

      {step === "details" && !askDigilocker && (
        <form onSubmit={submitDetails} noValidate className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm">
            <span>
              Applying for <strong className="text-slate-900">{chosen?.label}</strong> · {formatMoney(paidOrder?.amount ?? chosen?.fee)}
            </span>
            {paidOrder ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
                <Icon name="check" className="h-4 w-4" /> Paid
              </span>
            ) : (
              <button type="button" className={buttonClass.ghost} onClick={() => setStep("plan")}>
                Change plan
              </button>
            )}
          </div>

          {digi && (
            <Alert kind="success" title="Details filled from your Aadhaar">
              Verified through DigiLocker (Aadhaar ending {digi.last4 || "····"}). The greyed-out fields and the photograph come from your Aadhaar
              and cannot be changed. Please fill in the rest.
            </Alert>
          )}

          <PersonFields
            form={{ ...form, membershipType: plan }}
            set={set}
            errors={errors}
            config={config}
            files={files}
            pickFile={pickFile}
            lockedEmail={email}
            locked={digi?.locked || panInfo?.locked || []}
            aadhaarVerified={!!digi}
            aadhaarPhoto={digi?.photo || ""}
            onVerifyPan={config.panVerification?.enabled && !panDown ? verifyPan : null}
            panBusy={panBusy}
            panInfo={panInfo}
            documentsNote="Your documents are stored privately and are only seen by the membership office. If you reload this page, choose the files again."
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
              {busy ? "Saving…" : paidOrder ? "Submit application for review" : "Save and continue to payment"}
            </button>
          </div>
        </form>
      )}

      {step === "pay" && application && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card title="Your application">
            <div className="mb-5">
              {application.status === "APPROVED" ? (
                <Alert kind="success" title="Your application has been approved">
                  {application.reviewedAt ? `Approved on ${formatDate(application.reviewedAt)}. ` : ""}Pay the membership fee: your membership number
                  and ID card are issued as soon as the payment is confirmed.
                </Alert>
              ) : (
                <Alert kind="info" title="Your details are saved">
                  Pay the membership fee to send your application to the membership office for review. Once it is approved, your membership
                  number, ID card and receipt are emailed to you.
                </Alert>
              )}
            </div>
            <Details
              rows={[
                ["Name", application.name],
                ["Email", application.email],
                ["Number", application.whatsapp],
                ["Membership type", application.typeLabel],
                [
                  "Validity",
                  appType?.validityMonths
                    ? `${appType.validityMonths} months from the date of ${application.status === "APPROVED" ? "payment" : "approval"}`
                    : "Lifetime",
                ],
              ]}
            />
            {application.status === "UNPAID" && (
              <div className="mt-4">
                <button type="button" className={buttonClass.ghost} disabled={busy || !!checkout} onClick={startOver}>
                  Change details
                </button>
              </div>
            )}
            <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
              {application.status === "UNPAID" ? "" : `Please pay within ${config.pendingApplicationDays} days of approval. `}
              If you leave now, come back to this page and verify the same email to continue.
            </p>
          </Card>

          <Card title="Payment">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-600">Amount</span>
                <span className="text-2xl font-semibold tabular-nums text-slate-900">{formatMoney(application.amount)}</span>
              </div>
              {payMessage && <Alert kind={payMessage.kind}>{payMessage.text}</Alert>}
              {!config.onlinePayments.enabled && config.paymentPages?.[application.membershipType] ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Pay on the Zoho payment page. Please use <strong>{application.email}</strong> as your email there, so your payment is matched to
                    your application.
                  </p>
                  <a
                    href={config.paymentPages[application.membershipType]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${buttonClass.primary} w-full`}
                    onClick={() => {
                      setPagePaying(true);
                      try {
                        sessionStorage.setItem("mp_zoho_opened", application._id);
                      } catch {
                        /* storage unavailable */
                      }
                    }}
                  >
                    Pay on Zoho
                  </a>
                  {pagePaying && (
                    <p className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-brand-700" />
                      Waiting for Zoho to confirm your payment. This page moves on by itself once it does.
                    </p>
                  )}
                  {/* Only once the Zoho page has been opened: before that, nothing can have been paid. */}
                  {(pagePaying || zohoOpenedFor(application._id)) && (
                    <button type="button" className={`${buttonClass.secondary} w-full`} disabled={busy} onClick={markPaid}>
                      {busy ? "Please wait…" : "I have completed the payment"}
                    </button>
                  )}
                </div>
              ) : !config.onlinePayments.enabled ? (
                <Alert kind="warning" title="Online payment is not available yet">
                  Please contact the membership office{config.contact.email ? ` at ${config.contact.email}` : ""} to complete the payment.
                </Alert>
              ) : checkout ? (
                <Checkout checkout={checkout} onResult={onResult} onCancel={onCancel} />
              ) : (
                <button type="button" className={`${buttonClass.primary} w-full`} disabled={busy} onClick={pay}>
                  {busy ? "Please wait…" : "Pay now"}
                </button>
              )}
              <p className="text-xs text-slate-500">UPI, cards and net banking are accepted.</p>
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
