import { buttonClass } from "./form";

export default function Pagination({ page, pages, total, onChange, noun = "member" }) {
  if (!total) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span>
        {total} {total === 1 ? noun : `${noun}s`} · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <button type="button" className={buttonClass.secondary} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <button type="button" className={buttonClass.secondary} disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
