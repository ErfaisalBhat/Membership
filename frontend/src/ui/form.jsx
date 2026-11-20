// Shared form styling and building blocks.

export const inputClass = (error) =>
  `block w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:text-slate-500 ${
    error
      ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
      : "border-slate-300 focus:border-brand-600 focus:ring-brand-600/20"
  }`;

const btn =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export const buttonClass = {
  primary: `${btn} bg-brand-700 text-white hover:bg-brand-800`,
  secondary: `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`,
  danger: `${btn} bg-red-600 text-white hover:bg-red-700`,
  ghost: "inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-900 hover:underline disabled:opacity-60",
};

export function Field({ label, htmlFor, required, error, hint, children, className = "" }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

// A titled block of form fields in a two-column grid.
export function Section({ title, description, children, aside }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        {aside}
      </div>
      <div className="grid grid-cols-1 gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">{children}</div>
    </section>
  );
}

// A plain white box, with an optional title row.
export function Card({ title, action, children, className = "", padded = true }) {
  return (
    <section className={`min-w-0 rounded-lg border border-slate-200 bg-white shadow-xs ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {action}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Alert({ kind = "error", children, onClose, title }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-green-200 bg-green-50 text-green-800",
    info: "border-brand-100 bg-brand-50 text-brand-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm ${styles[kind]}`}>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-700" />
      {label}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-6 space-y-2">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">{children}</div>;
}

// Label / value pairs.
export function Details({ rows, columns = 2 }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-4 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {rows
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-0.5 break-words text-sm text-slate-900">{value}</dd>
          </div>
        ))}
    </dl>
  );
}
