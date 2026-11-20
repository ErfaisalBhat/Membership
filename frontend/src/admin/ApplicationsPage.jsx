import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { formatDate, formatMoney } from "../shared/format";
import StatusBadge from "../ui/StatusBadge";
import Pagination from "../ui/Pagination";
import { Alert, EmptyState, PageHeader, Spinner, inputClass } from "../ui/form";

const TABS = [
  ["PENDING", "Waiting for payment"],
  ["PAID", "Paid"],
  ["CANCELLED", "Cancelled"],
];

// Online sign-ups. Pending ones have not been paid yet.
export default function ApplicationsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "PENDING";
  const page = Number(params.get("page") || 1);
  const [searchInput, setSearchInput] = useState(params.get("search") || "");
  const search = params.get("search") || "";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => update({ search: searchInput.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    let alive = true;
    setData(null);
    const q = new URLSearchParams({ status, page: String(page) });
    if (search) q.set("search", search);
    api(`/admin/applications?${q}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [status, page, search]);

  return (
    <div>
      <PageHeader title="Applications" subtitle="People who applied on the website. A member is created automatically when the online payment is confirmed." />
      <div className="space-y-4">
        <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => update({ status: key === "PENDING" ? "" : key })}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${
                status === key ? "border-brand-700 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search name, email or mobile"
          className={`${inputClass()} sm:max-w-sm`}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search applications"
        />
        {error && <Alert>{error}</Alert>}
        {!data ? (
          !error && <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState>{status === "PENDING" ? "No applications are waiting for payment." : "Nothing here."}</EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Applicant</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Fee</th>
                    <th className="px-4 py-3">Applied</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((a) => (
                    <tr key={a._id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/admin/applications/${a._id}`)}>
                      <td className="px-4 py-3">
                        <Link to={`/admin/applications/${a._id}`} className="font-medium text-slate-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                          {a.name}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {a.email} · {a.whatsapp}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{a.typeLabel}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatMoney(a.amount)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(a.createdAt)}</td>
                      <td className="px-4 py-3">
                        {a.status === "PENDING" && a.lastAttempt?.status === "FAILED" ? (
                          <StatusBadge status="FAILED" label="Payment failed" />
                        ) : (
                          <StatusBadge status={a.status} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pages={data.pages} total={data.total} noun="application" onChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
