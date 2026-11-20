import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useConfig } from "../api/useConfig";
import { formatDate, formatMoney } from "../shared/format";
import StatusBadge from "../ui/StatusBadge";
import { Alert, Card, PageHeader, Spinner, buttonClass } from "../ui/form";

function Stat({ label, value, to, tone = "text-slate-900", note }) {
  return (
    <Link to={to} className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs transition hover:border-brand-500">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value ?? "–"}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </Link>
  );
}

export default function DashboardPage() {
  const { config } = useConfig();
  const [stats, setStats] = useState(null);
  const [overview, setOverview] = useState(null);
  const [payments, setPayments] = useState(null);
  const [applications, setApplications] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api("/members/stats"),
      api("/admin/overview"),
      api("/admin/payments?limit=6"),
      api("/admin/applications?status=PENDING&limit=6"),
    ])
      .then(([s, o, p, a]) => {
        setStats(s);
        setOverview(o);
        setPayments(p.items);
        setApplications(a.items);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!stats || !overview || !config) return <Spinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={config.orgName}
        actions={
          <Link to="/admin/members/new" className={buttonClass.primary}>
            + Add member
          </Link>
        }
      />

      {!overview.onlinePayments.enabled && (
        <Alert kind="info" title="Online payments are switched off">
          {overview.onlinePayments.problem} Applicants can still apply; you can register them from Applications when they pay offline.
        </Alert>
      )}
      {overview.paymentsNeedingAttention > 0 && (
        <Alert kind="warning" title={`${overview.paymentsNeedingAttention} payment(s) need attention`}>
          Money was received but something went wrong (for example, paid twice).{" "}
          <Link to="/admin/payments?attention=1" className="font-medium underline">
            Review payments
          </Link>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Members" value={stats.total} to="/admin/members" />
        <Stat label="Active" value={stats.active} tone="text-green-700" to="/admin/members?status=ACTIVE" />
        <Stat label="Expired" value={stats.expired} tone="text-amber-700" to="/admin/members?status=EXPIRED" />
        <Stat label="Expiring in 30 days" value={stats.expiringSoon} tone="text-brand-700" to="/admin/members?expiring=30" />
        <Stat label="Applications" value={overview.pendingApplications} tone="text-amber-700" note="waiting for payment" to="/admin/applications" />
        <Stat
          label="Online this month"
          value={formatMoney(overview.onlineThisMonth.total)}
          note={`${overview.onlineThisMonth.count} payment(s)`}
          to="/admin/payments?status=PAID"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Latest payments"
          padded={false}
          action={
            <Link to="/admin/payments" className={buttonClass.ghost}>
              View all
            </Link>
          }
        >
          {payments.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No online payments yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {payments.map((p) => (
                <li key={p._id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.purpose === "NEW" ? "New membership" : "Renewal"} · {formatDate(p.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm tabular-nums">{formatMoney(p.amount)}</span>
                    <StatusBadge status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Waiting for payment"
          padded={false}
          action={
            <Link to="/admin/applications" className={buttonClass.ghost}>
              View all
            </Link>
          }
        >
          {applications.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No pending applications.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {applications.map((a) => (
                <li key={a._id}>
                  <Link to={`/admin/applications/${a._id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{a.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {a.typeLabel} · applied {formatDate(a.createdAt)}
                      </p>
                    </div>
                    {a.lastAttempt?.status === "FAILED" && <StatusBadge status="FAILED" label="Payment failed" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Members by type">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {config.membershipTypes.map((t) => (
            <Link key={t.key} to={`/admin/members?type=${t.key}`} className="rounded-md bg-slate-50 px-4 py-3 hover:bg-brand-50">
              <p className="text-xs text-slate-500">{t.label}</p>
              <p className="text-xl font-semibold tabular-nums">{stats.byType[t.key] ?? 0}</p>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
