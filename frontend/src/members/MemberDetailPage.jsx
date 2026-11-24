import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, apiBlob, openInNewTab } from "../api/client";
import { useConfig } from "../api/useConfig";
import { formatBytes, formatDate, formatMoney } from "../shared/format";
import StatusBadge from "../ui/StatusBadge";
import Icon from "../ui/icons";
import FileViewer from "../ui/FileViewer";
import { Alert, Card, Details, Spinner, buttonClass } from "../ui/form";
import RenewPanel from "./RenewPanel";
import StatusPanel from "./StatusPanel";

const DOC_LABELS = {
  photo: "Passport size photograph",
  signature: "Signature",
  idProof: "Valid ID card",
};

// A box whose content opens on click, so rarely used forms don't make the page long.
function Collapsible({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-xs">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {title}
        <span className={`text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
          ›
        </span>
      </button>
      {open && <div className="border-t border-slate-100 p-5">{children}</div>}
    </section>
  );
}

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
  // The document shown in the pop-up viewer ({ path, title }), or null.
  const [viewing, setViewing] = useState(null);
  const closeViewer = useCallback(() => setViewing(null), []);

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

  const addressText = [[a.line1, a.line2].filter(Boolean).join(", "), [a.city, a.state && `${a.state} – ${a.pincode}`].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
  const affiliationText = member.affiliated
    ? [af.designation, af.department, af.institution, af.state].filter(Boolean).join(", ")
    : "Not affiliated to any institute";

  return (
    <div className="space-y-4">
      <FileViewer file={viewing} onClose={closeViewer} />
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
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="h-28 w-22 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title="Member details">
            <Details
              columns={3}
              rows={[
                ["Email", member.email],
                ["Number", member.whatsapp],
                ...(isInstitution
                  ? [
                      ["Authorized contact person", member.contactPerson],
                      [
                        "PAN",
                        member.pan?.number
                          ? `${member.pan.number}${member.pan.panType ? ` · ${member.pan.panType}` : ""}${member.pan.verified ? " · Verified" : " · Not verified"}`
                          : "–",
                      ],
                    ]
                  : [
                      ["Mother's name", member.motherName],
                      ["Father's name", member.fatherName],
                      ["Gender", member.gender],
                      ["Date of birth", formatDate(member.dob)],
                    ]),
                ["Current address", addressText],
                ["Institution of affiliation", affiliationText],
              ]}
            />
          </Card>

          <Card title="Documents">
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Object.keys(DOC_LABELS).map((key) => {
                const doc = member.documents?.[key];
                if (!doc) return null;
                return (
                  <li key={key} className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {DOC_LABELS[key]}
                        {key === "idProof" && member.idProofType ? ` (${member.idProofType})` : ""}
                      </p>
                      <p className="truncate text-xs text-slate-500" title={doc.originalName}>
                        {doc.originalName} · {formatBytes(doc.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`${buttonClass.ghost} shrink-0`}
                      onClick={() =>
                        setViewing({
                          path: `/members/${id}/files/${key}`,
                          title: `${DOC_LABELS[key]}${key === "idProof" && member.idProofType ? ` (${member.idProofType})` : ""}`,
                        })
                      }
                    >
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

        <div className="space-y-4">
          <Card title="ID card">
            <div className="space-y-2">
              <button type="button" className={`${buttonClass.primary} w-full`} onClick={() => open(`/members/${id}/card.pdf`)}>
                <Icon name="id" className="h-4 w-4" /> View / print
              </button>
              <button type="button" className={`${buttonClass.secondary} w-full`} disabled={busy === "email"} onClick={emailCard}>
                <Icon name="mail" className="h-4 w-4" /> {busy === "email" ? "Sending…" : "Email to member"}
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
            <Collapsible key={`renew-${member.expiryDate}`} title="Record a renewal">
              <RenewPanel key={member.expiryDate} member={member} config={config} onDone={updated} />
            </Collapsible>
          )}

          <Collapsible key={`status-${member.status}`} title={member.status === "INACTIVE" ? "Reinstate" : "Suspend or cancel"}>
            <StatusPanel member={member} onDone={updated} />
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
