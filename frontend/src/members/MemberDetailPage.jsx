import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, apiBlob, openInNewTab } from "../api/client";
import { useConfig } from "../api/useConfig";
import { formatBytes, formatDate, formatMoney } from "../shared/format";
import StatusBadge from "../ui/StatusBadge";
import Icon from "../ui/icons";
import { Alert, Card, Details, Spinner, buttonClass } from "../ui/form";
import RenewPanel from "./RenewPanel";
import StatusPanel from "./StatusPanel";

const DOC_LABELS = {
  photo: "Passport size photograph",
  signature: "Signature",
  idProof: "Valid ID card",
};

export default function MemberDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { config } = useConfig();
  const [member, setMember] = useState(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(location.state?.flash || "");
  const [photoUrl, setPhotoUrl] = useState(null);
  const [busy, setBusy] = useState("");

  // Clear the flash from history so a refresh doesn't show it again.
  useEffect(() => {
    if (location.state?.flash) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    let alive = true;
    api(`/members/${id}`)
      .then(({ member: m }) => alive && setMember(m))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const photoKey = member?.documents?.photo ? `${member._id}:${member.updatedAt}` : null;
  useEffect(() => {
    if (!photoKey) return;
    let url;
    let alive = true;
    apiBlob(`/members/${id}/files/photo`)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setPhotoUrl(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, photoKey]);

  function updated(m, message) {
    setMember(m);
    setFlash(message);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function open(path) {
    setError("");
    try {
      await openInNewTab(path);
    } catch (e) {
      setError(e.message);
    }
  }

  async function emailCard() {
    setBusy("email");
    setError("");
    try {
      const res = await api(`/members/${id}/send-card`, { method: "POST" });
      setFlash(res.email?.simulated ? "Email is in log mode on the server, so nothing was sent." : `ID card emailed to ${member.email}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  if (error && !member) return <Alert>{error}</Alert>;
  if (!member || !config) return <Spinner />;

  const isInstitution = member.membershipType === "INSTITUTIONAL";
  const canRenew = !!config.membershipTypes.find((t) => t.key === member.membershipType)?.validityMonths && member.status !== "INACTIVE";
  const verifyLink = `${window.location.origin}/verify/${member.verifyToken}`;
  const a = member.address || {};
  const af = member.affiliation || {};

  return (
    <div className="space-y-6">
      <Link to="/admin/members" className="text-sm text-slate-500 hover:text-slate-800">
        ← Members
      </Link>

      {flash && (
        <Alert kind="success" onClose={() => setFlash("")}>
          {flash}
        </Alert>
      )}
      {error && <Alert onClose={() => setError("")}>{error}</Alert>}

      <Card>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="h-32 w-26 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            {photoUrl ? (
              <img src={photoUrl} alt={`Photo of ${member.name}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">No photo</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{member.name}</h1>
              <StatusBadge status={member.status} large />
            </div>
            <p className="mt-1 font-mono text-sm text-slate-600">{member.membershipId}</p>
            <p className="mt-1 text-sm text-slate-600">
              {member.typeLabel} · Joined {formatDate(member.joinDate)} · {member.expiryDate ? `Valid till ${formatDate(member.expiryDate)}` : "Lifetime"}
              {member.source === "ONLINE" && " · Joined online"}
            </p>
            {member.status === "INACTIVE" && member.statusReason && (
              <p className="mt-2 text-sm text-slate-700">
                <span className="font-medium">Reason inactive:</span> {member.statusReason}
              </p>
            )}
          </div>
          <Link to={`/admin/members/${id}/edit`} className={buttonClass.secondary}>
            Edit details
          </Link>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Basic credentials">
            <Details
              rows={[
                ["Email", member.email],
                ["Number", member.whatsapp],
                ...(isInstitution
                  ? [["Authorized contact person", member.contactPerson]]
                  : [
                      ["Mother's name", member.motherName],
                      ["Father's name", member.fatherName],
                      ["Gender", member.gender],
                      ["Date of birth", formatDate(member.dob)],
                    ]),
              ]}
            />
          </Card>

          <Card title="Current address">
            <p className="text-sm text-slate-900">
              {[a.line1, a.line2].filter(Boolean).join(", ")}
              <br />
              {a.city}, {a.state} – {a.pincode}
            </p>
          </Card>

          <Card title="Institution of affiliation">
            {member.affiliated ? (
              <Details
                rows={[
                  ["University / Institution / Organization", af.institution],
                  ["Department", af.department],
                  ["Designation", af.designation],
                  ["State", af.state],
                ]}
              />
            ) : (
              <p className="text-sm text-slate-600">Not affiliated to any institute.</p>
            )}
          </Card>

          <Card title="Documents" padded={false}>
            <ul className="divide-y divide-slate-100">
              {Object.keys(DOC_LABELS).map((key) => {
                const doc = member.documents?.[key];
                if (!doc) return null;
                return (
                  <li key={key} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {DOC_LABELS[key]}
                        {key === "idProof" && member.idProofType ? ` (${member.idProofType})` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {doc.originalName} · {formatBytes(doc.size)}
                      </p>
                    </div>
                    <button type="button" className={buttonClass.ghost} onClick={() => open(`/members/${id}/files/${key}`)}>
                      View
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Payments" padded={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">For</th>
                    <th className="px-4 py-2.5">Paid</th>
                    <th className="px-4 py-2.5">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...member.payments].reverse().map((p) => (
                    <tr key={p._id}>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(p.date)}</td>
                      <td className="px-4 py-3">
                        {p.kind === "NEW" ? "New membership" : "Renewal"}
                        <div className="text-xs text-slate-500">
                          {formatDate(p.periodFrom)} – {p.periodTo ? formatDate(p.periodTo) : "Lifetime"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="tabular-nums">{formatMoney(p.amount)}</span> · {p.mode}
                        <div className="break-all text-xs text-slate-500">{p.reference || "No reference"}</div>
                        {p.refunded && <div className="text-xs font-medium text-violet-700">Refunded</div>}
                      </td>
                      <td className="px-4 py-3">
                        {p.receiptNo ? (
                          <button type="button" className={`${buttonClass.ghost} text-xs`} onClick={() => open(`/members/${id}/receipts/${p._id}.pdf`)}>
                            {p.receiptNo}
                          </button>
                        ) : (
                          <span className="text-slate-400">–</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {member.remarks && (
            <Card title="Remarks">
              <p className="whitespace-pre-line text-sm text-slate-800">{member.remarks}</p>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="ID card">
            <div className="space-y-2">
              <button type="button" className={`${buttonClass.primary} w-full`} onClick={() => open(`/members/${id}/card.pdf`)}>
                <Icon name="id" className="h-4 w-4" /> View / print ID card
              </button>
              <button type="button" className={`${buttonClass.secondary} w-full`} disabled={busy === "email"} onClick={emailCard}>
                <Icon name="mail" className="h-4 w-4" /> {busy === "email" ? "Sending…" : "Email ID card to member"}
              </button>
              <p className="pt-2 text-xs text-slate-500">
                QR verification link:{" "}
                <a href={verifyLink} target="_blank" rel="noreferrer" className="break-all text-brand-700 hover:underline">
                  {verifyLink}
                </a>
              </p>
              <p className="text-xs text-slate-500">Members directory: {member.showInPublicList ? "listed (member consented)" : "not listed"}</p>
            </div>
          </Card>

          {canRenew && (
            <Card title="Record a renewal">
              <RenewPanel key={member.expiryDate} member={member} config={config} onDone={updated} />
            </Card>
          )}

          <Card title={member.status === "INACTIVE" ? "Reinstate" : "Suspend or cancel"}>
            <StatusPanel member={member} onDone={updated} />
          </Card>
        </div>
      </div>
    </div>
  );
}
