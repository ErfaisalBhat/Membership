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
            <span lang="hi">{ORG.nitiHi}</span> / {ORG.nitiEn}: <span className="font-semibold text-white">{ORG.nitiId}</span>
          </p>
          <p className="sm:text-right">
            <span lang="hi" className="block">{ORG.estdHi}</span>
            <span className="block">{ORG.estdEn}</span>
          </p>
        </div>
      </div>

      {/* Logos and name */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1 sm:gap-6 sm:px-6">
          <Link to="/" className="shrink-0" aria-label="Home">
            <Logo
              src={LOGO_ASSSR}
              alt="ASSSR Logo"
              className="h-11 w-auto sm:h-14"
              fallback={
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-700 text-xs font-bold tracking-wide text-white sm:h-14 sm:w-14 sm:text-sm">
                  ASSSR
                </span>
              }
            />
          </Link>

          <Link to="/" className="min-w-0 flex-1 text-center" style={{ fontFamily: '"Arya", "Noto Sans Devanagari", sans-serif' }}>
            <span lang="hi" className="block text-sm font-bold leading-tight text-brand-800 sm:text-[19px] lg:text-[21px]">
              {ORG.nameHi}
            </span>
            <span className="block text-xs font-semibold leading-tight text-brand-700 sm:text-[15px] lg:text-[17px]">
              {ORG.nameEn}
            </span>
            <span className="mt-0.5 block text-[9px] font-medium uppercase leading-tight tracking-[0.2em] text-slate-500 sm:text-[11px]">
              Membership Portal
            </span>
          </Link>

          <Logo src={LOGO_VIKSIT} alt="Viksit Bharat Logo" className="h-10 w-auto shrink-0 sm:h-14" />
        </div>
      </div>
    </>
  );
}
