import { Link } from "react-router-dom";
import { useConfig } from "../api/useConfig";
import { formatMoney } from "../shared/format";
import { Alert, Spinner } from "../ui/form";
import Icon from "../ui/icons";

// The order of the join page: details, then payment, then review.
const STEPS = [
  { icon: "dashboard", title: "Choose a category", text: "Pick the membership category that fits you." },
  { icon: "mail", title: "Verify your email", text: "We send a 6-digit code. Your ID card is delivered to this address." },
  { icon: "id", title: "Fill the form", text: "Your details, address, affiliation and documents (photo, signature, ID)." },
  { icon: "card", title: "Pay online", text: "Pay the fee by UPI, card or net banking." },
  { icon: "shield", title: "Application review", text: "The Membership Section reviews your application. Once approved, your membership number and ID card are emailed to you." },
];

// Colours of each Component card: `from`/`to` for the badge gradient, `tint` for the soft background.
// The text of the cards comes from backend/config/content.js.
const COMPONENT_STYLE = {
  ASSSR: { badge: "AS", from: "#1e3a8a", to: "#3b5fc0", tint: "#eef2fb" },
  VMI: { badge: "VM", from: "#0f5f5a", to: "#14998f", tint: "#e9f6f4" },
  DHC: { badge: "DH", from: "#7f1d1d", to: "#b4343a", tint: "#fbeeee" },
  JASSSR: { badge: "JA", from: "#8a5a12", to: "#c98a1e", tint: "#fbf4e6" },
};
const DEFAULT_STYLE = { badge: "", from: "#334155", to: "#64748b", tint: "#f1f5f9" };

function validity(t) {
  return t.validityMonths ? `${t.validityMonths} months` : "Lifetime";
}

// Centered section heading: small gold label, title, gold rule.
function SectionTitle({ label, title }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#b08d57]">{label}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      <span aria-hidden="true" className="mx-auto mt-4 block h-0.5 w-14 rounded-full bg-gradient-to-r from-[#b08d57] to-[#e2c48f]" />
    </div>
  );
}

export default function HomePage() {
  const { config, error } = useConfig();
  if (error) return <div className="mx-auto max-w-6xl px-4 py-10"><Alert>{error.message}</Alert></div>;
  if (!config) return <Spinner />;

  const content = config.content;
  const eligibility = content.eligibility || {};

  return (
    <div className="home-ui">
      {/* Membership of the Society + Rights and Facilities */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:py-10">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Membership of the Society</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">{content.about}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {/* Scrolls to the categories table, where the category is chosen. */}
              <a href="#categories" className="rounded-md bg-brand-700 px-5 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-brand-800">
                Apply now
              </a>
              <Link to="/renew" className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Renew membership
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Rights and Facilities of Members</h2>
            <ul className="mt-3 space-y-2">
              {content.benefits.map((b) => (
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

      {/* Categories of Membership and Prescribed Fees */}
      <section id="categories" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-8 sm:px-6">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Categories of Membership and Prescribed Fees</h2>
          {content.feesNote && <p className="mt-2 text-sm leading-relaxed text-slate-600">{content.feesNote}</p>}
        </div>

        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-xs">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3">Eligibility</th>
                <th scope="col" className="px-4 py-3 text-right">Fee</th>
                <th scope="col" className="px-4 py-3">Validity</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Apply</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {config.membershipTypes.map((t) => (
                <tr key={t.key} className="align-top">
                  <th scope="row" className="px-4 py-3 font-semibold text-slate-900">{t.label}</th>
                  <td className="px-4 py-3 text-slate-600">{eligibility[t.key] || ""}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    <span className="font-semibold text-slate-900">{formatMoney(t.fee)}</span>
                    {t.regularFee > t.fee && <span className="ml-2 text-slate-400 line-through">{formatMoney(t.regularFee)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{validity(t)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link to={`/join?type=${t.key}`} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-800">
                      Apply <Icon name="arrowRight" className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* How to join: light band, numbered steps with icons joined by a gold line. */}
      <section className="border-y border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <SectionTitle label="Application Process" title="How to Join" />

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

      {/* Terms and Conditions of Membership */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Terms and Conditions of Membership</h2>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
            {content.terms.map((t, i) => (
              <li key={t.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{i + 1}</span>
                <div>
                  <span className="font-semibold text-slate-900">{t.title}.</span> {t.text}
                  {t.items && (
                    <ol className="mt-1.5 space-y-1 pl-1">
                      {t.items.map((item, j) => (
                        <li key={item}>({String.fromCharCode(97 + j)}) {item}</li>
                      ))}
                    </ol>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Components of the Society */}
      <section className="border-t border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <SectionTitle label="Our Institutions" title="Components of the Society" />
          {content.componentsIntro && <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-slate-600">{content.componentsIntro}</p>}

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(content.components || []).map((comp) => {
              const c = { ...DEFAULT_STYLE, badge: comp.short.slice(0, 2), ...COMPONENT_STYLE[comp.short] };
              return (
                <article
                  key={comp.short}
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
                      {comp.short}
                    </span>
                  </div>

                  <h3 className="relative mt-4 text-[15px] font-semibold leading-snug text-slate-900">{comp.name}</h3>
                  <p className="relative mt-2 text-sm leading-relaxed text-slate-600">{comp.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
