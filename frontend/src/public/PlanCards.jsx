import { Link } from "react-router-dom";
import { formatMoney } from "../shared/format";
import Icon from "../ui/icons";

function validity(t) {
  return t.validityMonths ? `Valid for ${t.validityMonths} months` : "Lifetime — never expires";
}

// Who the plan is for. How long it lasts is shown once, at the bottom of the card.
const WHO = {
  ANNUAL: "For individuals.",
  LIFE: "For individuals, with a single payment.",
  INSTITUTIONAL: "For universities, colleges and organizations.",
};

// Membership plans. With onSelect they work as radio cards (join page);
// otherwise each card links to the join page with that plan chosen.
export default function PlanCards({ config, selected, onSelect }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role={onSelect ? "radiogroup" : undefined}>
      {config.membershipTypes.map((t) => {
        const active = selected === t.key;
        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">{t.label}</h3>
              {onSelect && (
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white"
                  }`}
                >
                  {active && <Icon name="check" className="h-3.5 w-3.5" />}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">{WHO[t.key] || ""}</p>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-slate-900">{formatMoney(t.fee)}</span>
              {t.regularFee > t.fee && <span className="text-sm text-slate-400 line-through tabular-nums">{formatMoney(t.regularFee)}</span>}
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{validity(t)}</p>
          </>
        );
        const cls = `block h-full rounded-lg border bg-white p-5 text-left shadow-xs transition ${
          active ? "border-brand-700 ring-2 ring-brand-700/15" : "border-slate-200 hover:border-brand-500"
        }`;
        return onSelect ? (
          <button key={t.key} type="button" role="radio" aria-checked={active} className={cls} onClick={() => onSelect(t.key)}>
            {body}
          </button>
        ) : (
          <Link key={t.key} to={`/join?type=${t.key}`} className={cls}>
            {body}
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
              Choose this plan <Icon name="arrowRight" className="h-4 w-4" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
