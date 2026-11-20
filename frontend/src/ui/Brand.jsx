import { Link } from "react-router-dom";

// Organization mark: a navy tile with the short code, then the full name.
export default function Brand({ config, to = "/", light = false, compact = false }) {
  const code = config?.orgCode || "ORG";
  const name = config?.orgName || "Membership Portal";
  return (
    <Link to={to} className="flex min-w-0 items-center gap-3">
      <span
        className={`flex h-10 min-w-10 shrink-0 items-center justify-center rounded-md px-1.5 text-[10px] font-bold tracking-wide ${
          light ? "bg-white text-brand-800" : "bg-brand-700 text-white"
        }`}
      >
        {code.slice(0, 5)}
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className={`block truncate text-sm font-semibold leading-tight sm:text-base ${light ? "text-white" : "text-slate-900"}`}>{name}</span>
          <span className={`block text-xs ${light ? "text-brand-200" : "text-slate-500"}`}>Membership</span>
        </span>
      )}
    </Link>
  );
}
