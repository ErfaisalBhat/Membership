import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useConfig } from "../api/useConfig";
import Brand from "../ui/Brand";
import Icon from "../ui/icons";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/members", label: "Members directory" },
  { to: "/account", label: "Member login" },
];

const navClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "text-brand-700" : "text-slate-600 hover:text-slate-900"}`;

export default function PublicLayout() {
  const { config } = useConfig();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const contact = config?.contact || {};
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Brand config={config} />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
                {l.label}
              </NavLink>
            ))}
            <Link to="/join" className="ml-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-brand-800">
              Become a member
            </Link>
          </nav>
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Menu"
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
        {open && (
          <nav className="border-t border-slate-100 px-4 py-3 md:hidden" aria-label="Main">
            <div className="flex flex-col gap-1">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
                  {l.label}
                </NavLink>
              ))}
              <Link to="/join" className="mt-2 rounded-md bg-brand-700 px-4 py-2 text-center text-sm font-medium text-white">
                Become a member
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-brand-900 text-brand-100">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
          <div className="space-y-3">
            <Brand config={config} light />
            {contact.address && <p className="text-sm leading-relaxed text-brand-200">{contact.address}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-200">Membership</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link className="hover:text-white" to="/join">Become a member</Link></li>
              <li><Link className="hover:text-white" to="/account">Member login and renewal</Link></li>
              <li><Link className="hover:text-white" to="/members">Members directory</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-200">Contact</p>
            <ul className="mt-3 space-y-2 text-sm">
              {contact.email && (
                <li className="flex items-center gap-2">
                  <Icon name="mail" className="h-4 w-4 text-brand-200" />
                  <a className="hover:text-white" href={`mailto:${contact.email}`}>{contact.email}</a>
                </li>
              )}
              {contact.phone && (
                <li className="flex items-center gap-2">
                  <Icon name="phone" className="h-4 w-4 text-brand-200" />
                  {contact.phone}
                </li>
              )}
              {contact.website && (
                <li>
                  <a className="hover:text-white" href={contact.website} target="_blank" rel="noreferrer">
                    {contact.website.replace(/^https?:\/\//, "")}
                  </a>
                </li>
              )}
            </ul>
            {config?.socialLinks?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {config.socialLinks.map((s) => (
                  <a key={s.label} href={s.url} target="_blank" rel="noreferrer" className="hover:text-white">
                    {s.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-brand-200 sm:px-6">
            <span>© {year} {config?.orgName || ""}</span>
            <Link to="/admin" className="hover:text-white">Admin login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
