import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useConfig } from "../api/useConfig";
import Icon from "../ui/icons";
import OrgHeader from "./OrgHeader";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/members", label: "Members directory" },
  { to: "/account", label: "Member login" },
];

const navClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"}`;

export default function PublicLayout() {
  const { config } = useConfig();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col">
      <OrgHeader />

      <header className="sticky top-0 z-30 bg-brand-800 shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-brand-100 hover:bg-white/10 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Menu"
          >
            <Icon name={open ? "close" : "menu"} />
            Menu
          </button>
        </div>
        {open && (
          <nav className="border-t border-white/10 px-4 py-3 md:hidden" aria-label="Main">
            <div className="flex flex-col gap-1">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
                  {l.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-brand-900 text-brand-100">
        <div>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-brand-200 sm:px-6">
            <span>© {year} {config?.orgName || ""}</span>
            <Link to="/admin" className="hover:text-white">Admin login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
