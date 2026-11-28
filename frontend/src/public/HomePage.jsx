import { Link } from "react-router-dom";
import { joinableTypes, useConfig } from "../api/useConfig";
import { formatMoney } from "../shared/format";
import { Alert, Spinner } from "../ui/form";
import Icon from "../ui/icons";

// Compact home page: small type and tight spacing to keep scrolling short.

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
      <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-[#b08d57]">{label}</p>
      <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{title}</h2>
      <span aria-hidden="true" className="mx-auto mt-1.5 block h-0.5 w-10 rounded-full bg-gradient-to-r from-[#b08d57] to-[#e2c48f]" />
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
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Membership of the Society</h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-slate-600">{content.about}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Rights and Facilities of Members</h2>
            <ul className="mt-1.5 space-y-1">
              {content.benefits.map((b) => (
                <li key={b} className="flex gap-2 text-xs leading-snug text-slate-700">
                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <Icon name="check" className="h-3 w-3" />
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
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <SectionTitle label="Membership Plans" title="Categories of Membership and Prescribed Fees" />

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {joinableTypes(config).map((t) => {
              const saving = t.regularFee > t.fee ? t.regularFee - t.fee : 0;
              return (
                <article
                  key={t.key}
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_24px_-10px_rgba(15,23,42,0.2)]"
                >
                  {/* gold accent bar */}
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#b08d57] to-[#e2c48f]" />

                  <div className="flex items-center justify-between gap-2 px-3 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gradient-to-br from-brand-800 to-brand-600 text-white">
                        <Icon name={CATEGORY_ICON[t.key] || "id"} className="h-3.5 w-3.5" />
                      </span>
                      <h3 className="text-[13px] font-semibold leading-tight text-slate-900">{t.label}</h3>
                    </div>
                    <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-px text-[9px] font-medium text-brand-700">{validity(t)}</span>
                  </div>

                  <div className="mt-2 flex items-baseline gap-1.5 px-3 tabular-nums">
                    <span className="text-lg font-bold leading-none tracking-tight text-slate-900">{formatMoney(t.fee)}</span>
                    {saving > 0 && <span className="text-[11px] text-slate-400 line-through">{formatMoney(t.regularFee)}</span>}
                    {saving > 0 && (
                      <span className="ml-auto rounded-full bg-emerald-50 px-1.5 py-px text-[9px] font-semibold text-emerald-700">
                        Save {formatMoney(saving)}
                      </span>
                    )}
                  </div>

                  <p className="mx-3 mt-2 flex-1 border-t border-slate-100 pt-1.5 text-[10.5px] leading-snug text-slate-600">
                    <span className="font-semibold text-slate-500">Eligibility: </span>
                    {eligibility[t.key] || ""}
                  </p>

                  <div className="p-3 pt-2">
                    <Link
                      to={`/join?type=${t.key}`}
                      className="flex w-full items-center justify-center gap-1 rounded-md bg-brand-700 px-3 py-1 text-xs font-medium text-white transition hover:bg-brand-800"
                    >
                      Apply now <Icon name="arrowRight" className="h-3 w-3 transition group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          {content.feesNote && (
            <div className="mt-2.5 flex gap-2 rounded-md border border-[#e8d9bd] bg-[#fbf7ef] px-3 py-1.5">
              <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#b08d57] text-[9px] font-bold text-white">i</span>
              <p className="text-[10.5px] leading-snug text-[#6b5326]">{content.feesNote}</p>
            </div>
          )}
        </div>
      </section>

      {/* Terms and Conditions of Membership */}
      <section className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <h2 className="text-[15px] font-semibold text-slate-900">Terms and Conditions of Membership</h2>
          {/* Two flowing columns on wide screens (no row-height gaps between short and long items). */}
          <ol className="mt-2 gap-x-6 text-[11px] leading-snug text-slate-600 lg:columns-2">
            {content.terms.map((t, i) => (
              <li key={t.title} className="mb-1.5 flex break-inside-avoid gap-2">
                <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[9px] font-semibold text-brand-700">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-justify hyphens-auto">
                    <span className="font-semibold text-slate-900">{t.title}.</span> {t.text}
                  </p>
                  {t.items && (
                    <ol className="mt-0.5 space-y-0.5">
                      {t.items.map((item, j) => (
                        <li key={item} className="flex gap-1">
                          <span className="w-4 shrink-0">({String.fromCharCode(97 + j)})</span>
                          <span className="flex-1">{item}</span>
                        </li>
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
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <SectionTitle label="Our Institutions" title="Components of the Society" />
          {content.componentsIntro && <p className="mx-auto mt-1.5 max-w-2xl text-center text-[11px] text-slate-600">{content.componentsIntro}</p>}

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(content.components || []).map((comp) => {
              const c = { ...DEFAULT_STYLE, badge: comp.short.slice(0, 2), ...COMPONENT_STYLE[comp.short] };
              // With a url the whole card is a link to the component's website (new tab).
              const Card = comp.url ? "a" : "article";
              const linkProps = comp.url ? { href: comp.url, target: "_blank", rel: "noopener noreferrer", title: `Open the ${comp.short} website` } : {};
              return (
                <Card
                  key={comp.short}
                  {...linkProps}
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(15,23,42,0.18)]"
                >
                  {/* accent bar */}
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${c.from}, ${c.to})` }} />
                  {/* soft corner tint */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-80"
                    style={{ background: c.tint }}
                  />

                  <div className="relative flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-wide text-white"
                      style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }}
                    >
                      {c.badge}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: c.from }}>
                      {comp.short}
                    </span>
                  </div>

                  <h3 className="relative mt-2 text-xs font-semibold leading-snug text-slate-900">{comp.name}</h3>
                  <p className="relative mt-1 text-[10.5px] leading-snug text-slate-600">{comp.text}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
