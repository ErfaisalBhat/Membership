import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useConfig } from "../api/useConfig";
import { formatDate, formatMoney } from "../shared/format";
import StatusBadge from "../ui/StatusBadge";
import { Alert, PageHeader, Spinner } from "../ui/form";

// One cell of the key-figures strip.
function Figure({ label, value, note, to }) {
  const body = (
    <>
      <span className="truncate text-[10px] font-semibold uppercase leading-4 tracking-wider text-zinc-500">{label}</span>
      <span className="text-lg font-bold leading-6 tabular-nums text-zinc-900">{value ?? "–"}</span>
      <span className="truncate text-[11px] leading-4 text-zinc-500 group-hover:text-zinc-700">{note}</span>
    </>
  );
  if (!to) return <div className="flex flex-col bg-white px-3 py-2">{body}</div>;
  return (
    <Link to={to} className="group flex flex-col bg-white px-3 py-2 hover:bg-zinc-50">
      {body}
    </Link>
  );
}

// A bordered panel with a title bar.
function Panel({ title, to, linkLabel = "View all", children }) {
  return (
    <section className="min-w-0 border border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-5 py-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-700">{title}</h2>
        {to && (
          <Link to={to} className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:underline">
            {linkLabel} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const th = "px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500";
const td = "px-5 py-2.5 align-middle";

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
      <PageHeader title="Dashboard" />
      {overview.paymentsNeedingAttention > 0 && (
        <Alert kind="warning" title={`${overview.paymentsNeedingAttention} payment(s) need attention`}>
          Money was received but something went wrong (for example, paid twice).
        </Alert>
      )}

      {/* Key figures: one strip, cells separated by thin rules */}
      <section className="grid grid-cols-2 gap-px border border-zinc-200 bg-zinc-200 md:grid-cols-3 xl:grid-cols-6" aria-label="Key figures">
        <Figure label="Total members" value={stats.total} note="All records" to="/admin/members" />
        <Figure label="Active" value={stats.active} note="Current membership" to="/admin/members?status=ACTIVE" />
        <Figure label="Expired" value={stats.expired} note="Need renewal" to="/admin/members?status=EXPIRED" />
        <Figure label="Expiring soon" value={stats.expiringSoon} note="Within 30 days" to="/admin/members?expiring=30" />
        <Figure label="Applications" value={overview.pendingApplications} note="Awaiting review" to="/admin/applications" />
        <Figure
          label="Online this month"
          value={formatMoney(overview.onlineThisMonth.total)}
          note={`${overview.onlineThisMonth.count} payment(s)`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Latest applications" to="/admin/applications">
          {applications.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">No applications are waiting for review.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-zinc-200">
                  <tr>
                    <th className={th}>Applicant</th>
                    <th className={th}>Type</th>
                    <th className={`${th} text-right`}>Applied</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {applications.map((a) => (
                    <tr key={a._id} className="hover:bg-zinc-50">
                      <td className={td}>
                        <Link to={`/admin/applications/${a._id}`} className="font-semibold text-zinc-900 hover:underline">
                          {a.name}
                        </Link>
                      </td>
                      <td className={`${td} text-zinc-600`}>{a.typeLabel}</td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums text-zinc-600`}>{formatDate(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Latest online payments">
          {payments.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">No online payments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-zinc-200">
                  <tr>
                    <th className={th}>Payer</th>
                    <th className={`${th} text-right`}>Amount</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {payments.map((p) => (
                    <tr key={p._id}>
                      <td className={td}>
                        <div className="font-semibold text-zinc-900">{p.name}</div>
                        <div className="text-xs text-zinc-500">
                          {p.purpose === "NEW" ? "New membership" : "Renewal"} · {formatDate(p.createdAt)}
                        </div>
                      </td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{formatMoney(p.amount)}</td>
                      <td className={td}>
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

    </div>
  );
}
