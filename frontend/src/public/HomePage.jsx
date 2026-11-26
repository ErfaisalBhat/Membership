import { Link } from "react-router-dom";
import { useConfig } from "../api/useConfig";
import { Alert, Spinner } from "../ui/form";
import Icon from "../ui/icons";
import PlanCards from "./PlanCards";

// The order of the join page: details, then payment, then review.
const STEPS = [
  { icon: "dashboard", title: "Choose a plan", text: "Pick the plan that fits you." },
  { icon: "mail", title: "Verify your email", text: "We send a 6-digit code. Your ID card is delivered to this address." },
  { icon: "id", title: "Fill the form", text: "Your details, address, affiliation and documents (photo, signature, ID)." },
  { icon: "card", title: "Pay online", text: "Pay the fee by UPI, card or net banking." },
  { icon: "shield", title: "Application review", text: "The Membership Section reviews your application. Once approved, your membership number and ID card are emailed to you." },
];

// The bodies that make up ASSSR, shown at the bottom of the home page.
// Each has its own accent: `from`/`to` for the badge gradient, `tint` for the soft background.
const COMPONENTS = [
  { badge: "AS", short: "ASSSR", name: "Asiatic Society for Social Science Research", text: "Access financial services, honorarium payments, and allowances for ASSSR.", from: "#1e3a8a", to: "#3b5fc0", tint: "#eef2fb" },
  { badge: "VM", short: "VMI", name: "Varāhamihira Multidisciplinary Institute", text: "Manage VMI academic fellowship disbursements, salaries, and travel reimbursements.", from: "#0f5f5a", to: "#14998f", tint: "#e9f6f4" },
  { badge: "DH", short: "DHC", name: "Deccan History Congress", text: "Process honoraria and daily allowances for Deccan History Congress expert panels.", from: "#7f1d1d", to: "#b4343a", tint: "#fbeeee" },
  { badge: "JA", short: "JASSSR", name: "Journal of ASSSR", text: "Submit and track reviewer honoraria, editor salaries, and related refunds.", from: "#8a5a12", to: "#c98a1e", tint: "#fbf4e6" },
];

export default function HomePage() {
  const { config, error } = useConfig();
  if (error) return <div className="mx-auto max-w-6xl px-4 py-10"><Alert>{error.message}</Alert></div>;
  if (!config) return <Spinner />;

  return (
    <div className="home-ui">
      {/* Intro */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:py-10">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Become a member</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">{config.content.about}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/join" className="rounded-md bg-brand-700 px-5 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-brand-800">
                Apply now
              </Link>
              <Link to="/account" className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Renew or download my card
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Membership benefits</h2>
            <ul className="mt-3 space-y-2">
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
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Membership plans and fees</h2>
          <p className="mt-2 text-sm text-slate-600">Subsidized fees as per the Memorandum of Association. All fees are in Indian Rupees.</p>
        </div>
        <div className="mt-5">
          <PlanCards config={config} />
        </div>
      </section>

      {/* How to join: light band, numbered steps with icons joined by a gold line. */}
      <section className="border-y border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#b08d57]">Application Process</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">How to Join</h2>
            <span aria-hidden="true" className="mx-auto mt-4 block h-0.5 w-14 rounded-full bg-gradient-to-r from-[#b08d57] to-[#e2c48f]" />
          </div>

          <ol className="relative mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
            {/* line joining the icons (wide screens) */}
            <span
              aria-hidden="true"
              className="absolute left-[10%] right-[10%] top-7 hidden h-px lg:block"
              style={{ background: "linear-gradient(90deg, transparent, #d9c29b 12%, #d9c29b 88%, transparent)" }}
            />
            {STEPS.map((s, i) => (
              <li key={s.title} className="group relative flex flex-col items-center text-center">
                <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.18)] transition duration-300 group-hover:-translate-y-0.5 group-hover:ring-[#d9c29b]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-800 to-brand-600 text-white">
                    <Icon name={s.icon} className="h-5 w-5" />
                  </span>
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#b08d57] text-[10px] font-bold text-white ring-2 ring-white">
                    {i + 1}
                  </span>
                </span>
                <div className="mt-3 w-full flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 transition duration-300 group-hover:border-slate-300 group-hover:shadow-[0_10px_24px_-10px_rgba(15,23,42,0.2)]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b08d57]">Step {String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      {/* Eligibility */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Terms of membership</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
            {config.content.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Constituent components */}
      <section className="border-t border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#b08d57]">Our Institutions</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Constituent Components</h2>
            <span aria-hidden="true" className="mx-auto mt-4 block h-0.5 w-14 rounded-full bg-gradient-to-r from-[#b08d57] to-[#e2c48f]" />
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {COMPONENTS.map((c) => (
              <article
                key={c.short}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_-8px_rgba(15,23,42,0.18)]"
              >
                {/* accent bar */}
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${c.from}, ${c.to})` }} />
                {/* soft corner tint */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-80 transition duration-300 group-hover:scale-110"
                  style={{ background: c.tint }}
                />

                <div className="relative flex items-center gap-3">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-bold tracking-wide text-white shadow-md"
                    style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
                  >
                    {c.badge}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: c.from }}>
                    {c.short}
                  </span>
                </div>

                <h3 className="relative mt-4 text-[15px] font-semibold leading-snug text-slate-900">{c.name}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-slate-600">{c.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
