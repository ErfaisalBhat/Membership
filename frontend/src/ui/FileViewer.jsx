import { useEffect, useState } from "react";
import { apiBlob } from "../api/client";
import Icon from "./icons";

// Shows a protected file (image or PDF) in a pop-up on the same page, with a close (×) button.
// Closes on ×, Esc, or a click outside the window.
//   file: { path, title } or null (closed)
export default function FileViewer({ file, onClose, auth = "admin" }) {
  const [state, setState] = useState({ url: "", type: "", error: "" });

  useEffect(() => {
    if (!file) return;
    let url = "";
    let alive = true;
    setState({ url: "", type: "", error: "" });
    apiBlob(file.path, { auth })
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setState({ url, type: blob.type || "", error: "" });
      })
      .catch((err) => alive && setState({ url: "", type: "", error: err.message || "Could not open the file." }));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, auth]);

  useEffect(() => {
    if (!file) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, onClose]);

  if (!file) return null;
  const isPdf = state.type === "application/pdf";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={file.title}
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
          <h2 className="truncate text-sm font-semibold text-slate-900">{file.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
            title="Close"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-48 flex-1 items-center justify-center overflow-auto bg-slate-50 p-3">
          {state.error ? (
            <p className="text-sm text-red-700">{state.error}</p>
          ) : !state.url ? (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" aria-label="Loading" />
          ) : isPdf ? (
            <iframe src={state.url} title={file.title} className="h-[65vh] w-full rounded border border-slate-200 bg-white" />
          ) : (
            <img src={state.url} alt={file.title} className="max-h-[65vh] max-w-full rounded object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}
