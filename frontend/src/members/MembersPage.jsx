import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useConfig } from "../api/useConfig";
import { formatDate } from "../shared/format";
import StatusBadge from "../ui/StatusBadge";
import Pagination from "../ui/Pagination";
import { Alert, EmptyState, PageHeader, Spinner, inputClass } from "../ui/form";

const FILTER_KEYS = ["search", "type", "status", "expiring"];

export default function MembersPage() {
  const { config } = useConfig();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("search") || "");
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  const query = new URLSearchParams();
  for (const k of FILTER_KEYS) if (params.get(k)) query.set(k, params.get(k));
  const page = Number(params.get("page") || 1);
  const filterQuery = query.toString();

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  }

  // Debounce typing in the search box.
  useEffect(() => {
    const current = params.get("search") || "";
    if (searchInput === current) return;
    const t = setTimeout(() => update({ search: searchInput.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    let alive = true;
    setError("");
    const q = new URLSearchParams(filterQuery);
    q.set("page", page);
    api(`/members?${q}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [filterQuery, page]);

  useEffect(() => {
    api("/members/stats").then(setStats).catch(() => {});
  }, []);

  const status = params.get("status") || "";
  const expiring = params.get("expiring") === "30";
  const hasFilters = FILTER_KEYS.some((k) => params.get(k));

  const tabs = [
    { label: "All", count: stats?.total, active: !status && !expiring, set: { status: "", expiring: "" } },
    { label: "Active", count: stats?.active, active: status === "ACTIVE", set: { status: "ACTIVE", expiring: "" } },
    { label: "Expired", count: stats?.expired, active: status === "EXPIRED", set: { status: "EXPIRED", expiring: "" } },
    { label: "Debarred", count: stats?.inactive, active: status === "INACTIVE", set: { status: "INACTIVE", expiring: "" } },
    { label: "Expiring in 30 days", count: stats?.expiringSoon, active: expiring, set: { expiring: "30", status: "" } },
  ];

  return (
    <div>
      <PageHeader title="Members" />

      <div className="space-y-4">
        <div className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 px-1">
          {tabs.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => update(t.set)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium ${
                t.active ? "border-brand-700 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
              <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${t.active ? "bg-brand-50 text-brand-800" : "bg-slate-100 text-slate-600"}`}>{t.count ?? "–"}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            placeholder="Search name, membership ID, email or mobile"
            className={`${inputClass()} sm:max-w-sm`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search members"
          />
          <select className={`${inputClass()} sm:w-56`} value={params.get("type") || ""} onChange={(e) => update({ type: e.target.value })} aria-label="Filter by type">
            <option value="">All types</option>
            {config?.membershipTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              className="text-sm text-slate-500 underline hover:text-slate-900"
              onClick={() => {
                setSearchInput("");
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {error && <Alert>{error}</Alert>}

        {!data ? (
          !error && <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState>{hasFilters ? "No members match these filters." : "No members yet. Use “Add member” to register the first one."}</EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Membership ID</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Valid till</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((m) => (
                    <tr key={m._id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/admin/members/${m._id}`)}>
                      <td className="px-4 py-3">
                        <Link to={`/admin/members/${m._id}`} className="font-medium text-slate-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                          {m.name}
                        </Link>
                        <div className="text-xs text-slate-500">{m.email}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{m.membershipId}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {m.typeLabel}
                        {m.source === "ONLINE" && <div className="text-xs text-slate-500">Joined online</div>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(m.joinDate)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{m.expiryDate ? formatDate(m.expiryDate) : "Lifetime"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pages={data.pages} total={data.total} onChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
