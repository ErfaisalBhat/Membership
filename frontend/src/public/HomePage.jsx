import { Link } from "react-router-dom";
import { useConfig } from "../api/useConfig";
import { Alert, Spinner } from "../ui/form";
import Icon from "../ui/icons";
import PlanCards from "./PlanCards";

// The order of the join page: details, then payment, then review.
const STEPS = [
  { title: "Choose a plan", text: "Pick the plan that fits you." },
  { title: "Verify your email", text: "We send a 6-digit code. Your ID card is delivered to this address." },
  { title: "Fill the form", text: "Your details, address, affiliation and documents (photo, signature, ID)." },
  { title: "Pay online", text: "Pay the fee by UPI, card or net banking." },
  { title: "Application review", text: "The Membership Section reviews your application. Once approved, your membership number and ID card are emailed to you." },
];

export default function HomePage() {
  const { config, error } = useConfig();
  if (error) return <div className="mx-auto max-w-6xl px-4 py-10"><Alert>{error.message}</Alert></div>;
  if (!config) return <Spinner />;

  return (
    <div className="home-ui">
      {/* Intro */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:py-20">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Become a member</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">{config.content.about}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/join" className="rounded-md bg-brand-700 px-5 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-brand-800">
                Apply now
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

      {/* How it works: dark navy band with a soft glow; the steps sit on it as glass cards
          joined by a lit line. Placed right after the introduction, before the plans. */}
      <section className="relative overflow-hidden bg-brand-900">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 55% at 50% 0%, rgba(96,145,214,0.28), transparent 70%), radial-gradient(ellipse 40% 50% at 100% 100%, rgba(176,141,87,0.14), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-9 sm:px-6">
          <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
            How to join <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-200">Five simple steps</span>
          </h2>

          <ol className="relative mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* the line joining the steps (wide screens) */}
            <span
              aria-hidden="true"
              className="absolute left-[10%] right-[10%] top-[16px] hidden h-px lg:block"
              style={{ background: "linear-gradient(90deg, transparent, rgba(147,183,232,0.6), rgba(147,183,232,0.6), transparent)" }}
            />
            {STEPS.map((s, i) => (
              <li key={s.title} className="group relative flex flex-col items-center text-center">
                <span
                  className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-brand-700 text-xs font-semibold text-white transition duration-300 group-hover:scale-105"
                  style={{ boxShadow: "0 0 0 3px rgba(18,34,62,1), 0 0 16px 1px rgba(96,145,214,0.55)" }}
                >
                  {i + 1}
                </span>
                <div className="mt-3 w-full flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 backdrop-blur-sm transition duration-300 group-hover:-translate-y-0.5 group-hover:border-white/25 group-hover:bg-white/[0.07] group-hover:shadow-[0_0_22px_rgba(96,145,214,0.25)]">
                  <h3 className="text-[13px] font-semibold text-white">{s.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
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

      {/* Eligibility */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Terms of membership</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-600">
            {config.content.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
