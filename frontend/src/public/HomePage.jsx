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

// Icon on each category card.
const CATEGORY_ICON = { ANNUAL: "id", LIFE: "shield", INSTITUTIONAL: "users" };

function validity(t) {
  return t.validityMonths ? `${t.validityMonths} months` : "Lifetime";
}

// Centered section heading: small gold label, title, gold rule.
function SectionTitle({ label, title }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#b08d57]">{label}</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
      <span aria-hidden="true" className="mx-auto mt-2.5 block h-0.5 w-12 rounded-full bg-gradient-to-r from-[#b08d57] to-[#e2c48f]" />
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
        <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[26px]">Membership of the Society</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{content.about}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rights and Facilities of Members</h2>
            <ul className="mt-2 space-y-1.5">
              {content.benefits.map((b) => (
                <li key={b} className="flex gap-2.5 text-[13px] text-slate-700">
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
      <section id="categories" className="scroll-mt-16 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <SectionTitle label="Membership Plans" title="Categories of Membership and Prescribed Fees" />

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {config.membershipTypes.map((t) => {
              const saving = t.regularFee > t.fee ? t.regularFee - t.fee : 0;
              return (
                <article
                  key={t.key}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_28px_-10px_rgba(15,23,42,0.2)]"
                >
                  {/* gold accent bar */}
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#b08d57] to-[#e2c48f]" />

                  <div className="flex items-center justify-between gap-2 px-4 pt-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-800 to-brand-600 text-white shadow-sm">
                        <Icon name={CATEGORY_ICON[t.key] || "id"} className="h-4 w-4" />
                      </span>
                      <h3 className="text-sm font-semibold leading-tight text-slate-900">{t.label}</h3>
                    </div>
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">{validity(t)}</span>
                  </div>

                  <div className="mt-2.5 flex items-baseline gap-2 px-4 tabular-nums">
                    <span className="text-[22px] font-bold leading-none tracking-tight text-slate-900">{formatMoney(t.fee)}</span>
                    {saving > 0 && <span className="text-xs text-slate-400 line-through">{formatMoney(t.regularFee)}</span>}
                    {saving > 0 && (
                      <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Save {formatMoney(saving)}
                      </span>
                    )}
                  </div>

                  <p className="mx-4 mt-2.5 flex-1 border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-600">
                    <span className="font-semibold text-slate-500">Eligibility: </span>
                    {eligibility[t.key] || ""}
                  </p>

                  <div className="p-4 pt-2.5">
                    <Link
                      to={`/join?type=${t.key}`}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-700 px-3 py-1.5 text-[13px] font-medium text-white shadow-xs transition hover:bg-brand-800"
                    >
                      Apply now <Icon name="arrowRight" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          {content.feesNote && (
            <div className="mt-3 flex gap-2.5 rounded-lg border border-[#e8d9bd] bg-[#fbf7ef] px-3 py-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#b08d57] text-[10px] font-bold text-white">i</span>
              <p className="text-[11px] leading-relaxed text-[#6b5326]">{content.feesNote}</p>
            </div>
          )}
        </div>
      </section>

      {/* How to join: light band, numbered steps with icons joined by a gold line. */}
      <section className="border-y border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <SectionTitle label="Application Process" title="How to Join" />

          <ol className="relative mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
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
                <div className="mt-2 w-full flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition duration-300 group-hover:border-slate-300 group-hover:shadow-[0_10px_24px_-10px_rgba(15,23,42,0.2)]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b08d57]">Step {String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-0.5 text-[13px] font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Terms and Conditions of Membership */}
      <section className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-slate-900">Terms and Conditions of Membership</h2>
          {/* Two columns on wide screens to keep the page short. */}
          <ol className="mt-3 grid gap-x-8 gap-y-2 text-xs leading-relaxed text-slate-600 lg:grid-cols-2">
            {content.terms.map((t, i) => (
              <li key={t.title} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700">{i + 1}</span>
                <div>
                  <span className="font-semibold text-slate-900">{t.title}.</span> {t.text}
                  {t.items && (
                    <ol className="mt-1 pl-1">
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
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <SectionTitle label="Our Institutions" title="Components of the Society" />
          {content.componentsIntro && <p className="mx-auto mt-2.5 max-w-2xl text-center text-xs text-slate-600">{content.componentsIntro}</p>}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(content.components || []).map((comp) => {
              const c = { ...DEFAULT_STYLE, badge: comp.short.slice(0, 2), ...COMPONENT_STYLE[comp.short] };
              return (
                <article
                  key={comp.short}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_-8px_rgba(15,23,42,0.18)]"
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
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold tracking-wide text-white shadow-md"
                      style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
                    >
                      {c.badge}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: c.from }}>
                      {comp.short}
                    </span>
                  </div>

                  <h3 className="relative mt-3 text-[13px] font-semibold leading-snug text-slate-900">{comp.name}</h3>
                  <p className="relative mt-1.5 text-xs leading-relaxed text-slate-600">{comp.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
