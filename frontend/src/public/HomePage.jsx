import { Link } from "react-router-dom";
import { useConfig } from "../api/useConfig";
import { Alert, Spinner } from "../ui/form";
import Icon from "../ui/icons";
import PlanCards from "./PlanCards";

const STEPS = [
  { title: "Choose a plan", text: "Student, Annual, Life or Institutional membership." },
  { title: "Verify your email", text: "We send a 6-digit code. Your ID card is delivered to this address." },
  { title: "Fill the form", text: "Your details, address, affiliation and documents (photo, signature, ID)." },
  { title: "Pay online", text: "Your membership number and ID card are issued as soon as the payment is confirmed." },
];

export default function HomePage() {
  const { config, error } = useConfig();
  if (error) return <div className="mx-auto max-w-6xl px-4 py-10"><Alert>{error.message}</Alert></div>;
  if (!config) return <Spinner />;

  return (
    <>
      {/* Intro */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{config.orgCode} Membership</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Become a member of the {config.orgName}</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">{config.content.about}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/join" className="rounded-md bg-brand-700 px-5 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-brand-800">
                Become a member
              </Link>
              <Link to="/account" className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Renew or download my card
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Membership benefits</h2>
            <ul className="mt-4 space-y-3">
              {config.content.benefits.map((b) => (
                <li key={b} className="flex gap-3 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Membership plans and fees</h2>
          <p className="mt-2 text-sm text-slate-600">Subsidized fees as per the Memorandum of Association. All fees are in Indian Rupees.</p>
        </div>
        <div className="mt-8">
          <PlanCards config={config} />
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">How to join</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">{i + 1}</span>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Eligibility + verify */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Terms of membership</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-600">
            {config.content.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 text-brand-700">
            <Icon name="shield" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Checking a membership card?</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Every ID card carries a QR code on the back. Scan it with a phone camera to see whether the membership is active today, with the member's photo.
          </p>
          <Link to="/members" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            Search the members directory <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
