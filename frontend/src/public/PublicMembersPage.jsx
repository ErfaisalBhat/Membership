import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useConfig } from "../api/useConfig";
import { formatDate } from "../shared/format";
import StatusBadge from "../ui/StatusBadge";
import Pagination from "../ui/Pagination";
import { Alert, EmptyState, Spinner, inputClass } from "../ui/form";

export default function PublicMembersPage() {
  const { config } = useConfig();
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({ search: "", type: "", status: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchInput.trim() ? f : { ...f, search: searchInput.trim() }));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ page: String(page) });
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
    api(`/public/members?${q}`, { auth: false })
      .then((d) => {
        if (alive) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [filters, page]);

  const setFilter = (k) => (e) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setPage(1);
  };
  const hasFilters = filters.search || filters.type || filters.status;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Members directory</h1>
        <p className="mt-1 text-sm text-slate-500">Members who have agreed to be listed publicly. Contact details are never shown.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-xs sm:flex-row">
        <input
          type="search"
          placeholder="Search by name or membership ID"
          className={`${inputClass()} sm:max-w-sm`}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search members"
        />
        <select className={`${inputClass()} sm:w-52`} value={filters.type} onChange={setFilter("type")} aria-label="Filter by type">
          <option value="">All types</option>
          {config?.membershipTypes.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <select className={`${inputClass()} sm:w-40`} value={filters.status} onChange={setFilter("status")} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
          <option value="INACTIVE">Debarred</option>
        </select>
      </div>

      {error && <Alert>{error}</Alert>}

      {!data ? (
        !error && <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState>{hasFilters ? "No members match your search." : "No members are listed yet."}</EmptyState>
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
                  <th className="px-4 py-3">Date of joining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((m) => (
                  <tr key={m.membershipId}>
                    <td className="px-4 py-3 font-medium text-slate-900">{m.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{m.membershipId}</td>
                    <td className="whitespace-nowrap px-4 py-3">{m.typeLabel}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(m.joinDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
