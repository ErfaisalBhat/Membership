import { useState } from "react";
import { Link } from "react-router-dom";

// Official header text, shown in Hindi and English like the main ASSSR website.
const ORG = {
  nameHi: "एशियाटिक सोसायटी फॉर सोशल साइंस रिसर्च",
  nameEn: "Asiatic Society for Social Science Research",
  nitiHi: "नीति आयोग आईडी",
  nitiEn: "NITI Aayog ID",
  nitiId: "DL/2021/0287154",
  estdHi: "सोसाइटी पंजीकरण अधिनियम XXI, 1860 के तहत स्थापित",
  estdEn: "Estd. under the Societies Registration Act XXI of 1860",
};

// Logo files live in frontend/public/logos/ (copied into the build as-is).
const LOGO_ASSSR = "/logos/asssr.webp";
const LOGO_VIKSIT = "/logos/viksit-bharat.png";

// An <img> that renders `fallback` (or nothing) if the file is missing.
function Logo({ src, alt, className, fallback = null }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

export default function OrgHeader() {
  return (
    <>
      {/* Registration strip */}
      <div className="bg-brand-900 text-[11px] leading-snug text-brand-100 sm:text-xs">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1.5 px-4 py-2 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <p>
            <span lang="hi" className="block">
              {ORG.nitiHi}: <span className="font-semibold text-white">{ORG.nitiId}</span>
            </span>
            <span className="block">
              {ORG.nitiEn}: <span className="font-semibold text-white">{ORG.nitiId}</span>
            </span>
          </p>
          <p className="sm:text-right">
            <span lang="hi" className="block">{ORG.estdHi}</span>
            <span className="block">{ORG.estdEn}</span>
          </p>
        </div>
      </div>

      {/* Logos and name */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6 sm:py-4">
          <Link to="/" className="shrink-0" aria-label="Home">
            <Logo
              src={LOGO_ASSSR}
              alt="ASSSR Logo"
              className="h-14 w-auto sm:h-20"
              fallback={
                <span className="flex h-14 w-14 items-center justify-center rounded-md bg-brand-700 text-xs font-bold tracking-wide text-white sm:h-20 sm:w-20 sm:text-sm">
                  ASSSR
                </span>
              }
            />
          </Link>

          <Link to="/" className="min-w-0 flex-1 text-center">
            <span lang="hi" className="block text-base font-bold leading-snug text-brand-800 sm:text-2xl lg:text-3xl">
              {ORG.nameHi}
            </span>
            <span className="mt-0.5 block text-sm font-semibold leading-snug text-brand-700 sm:text-lg lg:text-xl">
              {ORG.nameEn}
            </span>
            <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
              Membership Portal
            </span>
          </Link>

          <Logo src={LOGO_VIKSIT} alt="Viksit Bharat Logo" className="h-12 w-auto shrink-0 sm:h-20" />
        </div>
      </div>
    </>
  );
}
