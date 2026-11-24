import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, apiUrl } from "../api/client";
import { formatDate } from "../shared/format";
import Icon from "../ui/icons";
import { Spinner } from "../ui/form";

const VERDICT = {
  ACTIVE: { title: "Valid membership", tone: "border-green-200 bg-green-50 text-green-900", icon: "check", iconTone: "bg-green-600" },
  EXPIRED: { title: "Membership expired", tone: "border-amber-200 bg-amber-50 text-amber-900", icon: "refresh", iconTone: "bg-amber-500" },
  INACTIVE: { title: "Membership not active", tone: "border-slate-200 bg-slate-100 text-slate-800", icon: "close", iconTone: "bg-slate-500" },
};

// Opened by scanning the QR code on a member's ID card.
export default function VerifyPage() {
  const { token } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/public/verify/${encodeURIComponent(token)}`, { auth: false })
      .then(setResult)
      .catch((e) => setError(e.status === 404 ? "This card could not be verified. No membership was found for it." : e.message));
  }, [token]);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-900">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white">
            <Icon name="close" />
          </span>
          <h1 className="mt-3 text-lg font-semibold">Not verified</h1>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      ) : !result ? (
        <Spinner label="Verifying…" />
      ) : (
        <Result result={result} token={token} />
      )}
    </div>
  );
}

function Result({ result, token }) {
  const v = VERDICT[result.status] || VERDICT.INACTIVE;
  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-5 text-center ${v.tone}`}>
        <span className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full text-white ${v.iconTone}`}>
          <Icon name={v.icon} />
        </span>
        <h1 className="mt-3 text-lg font-semibold">{v.title}</h1>
        <p className="text-xs opacity-75">Checked on {formatDate(new Date().toISOString())}</p>
      </div>

      <div className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
        {result.hasPhoto && (
          <img
            src={apiUrl(`/public/verify/${encodeURIComponent(token)}/photo`)}
            alt={`Photo of ${result.name}`}
            className="h-32 w-26 shrink-0 rounded-md border border-slate-200 object-cover"
          />
        )}
        <dl className="min-w-0 space-y-2.5 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Name</dt>
            <dd className="font-semibold text-slate-900">{result.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Membership ID</dt>
            <dd className="font-mono">{result.membershipId}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Type</dt>
            <dd>{result.typeLabel}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Valid till</dt>
            <dd>{result.expiryDate ? formatDate(result.expiryDate) : "Lifetime"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
