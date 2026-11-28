const STYLES = {
  ACTIVE: "bg-green-50 text-green-700 ring-green-600/20",
  EXPIRED: "bg-amber-50 text-amber-800 ring-amber-600/25",
  INACTIVE: "bg-slate-100 text-slate-600 ring-slate-500/20",
  // applications and payments
  UNPAID: "bg-slate-100 text-slate-600 ring-slate-500/20",
  PENDING: "bg-amber-50 text-amber-800 ring-amber-600/25",
  APPROVED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  REJECTED: "bg-red-50 text-red-700 ring-red-600/20",
  CREATED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  PAID: "bg-green-50 text-green-700 ring-green-600/20",
  FAILED: "bg-red-50 text-red-700 ring-red-600/20",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const LABELS = {
  ACTIVE: "Active",
  EXPIRED: "Expired",
  INACTIVE: "Debarred",
  UNPAID: "Not paid yet",
  PENDING: "Awaiting review",
  APPROVED: "Approved, awaiting payment",
  REJECTED: "Rejected",
  CREATED: "In progress",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export default function StatusBadge({ status, large = false, label }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset ${
        large ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"
      } ${STYLES[status] || STYLES.INACTIVE}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {label || LABELS[status] || status}
    </span>
  );
}
