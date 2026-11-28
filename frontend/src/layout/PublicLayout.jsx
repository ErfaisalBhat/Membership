import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useConfig } from "../api/useConfig";
import Icon from "../ui/icons";
import OrgHeader from "./OrgHeader";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/members", label: "Membership Directory" },
  { to: "/account", label: "Member Login" },
];

const navClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"}`;

export default function PublicLayout() {
  const { config } = useConfig();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const menuRef = useRef(null);
  useEffect(() => setOpen(false), [location.pathname]);

  // Close the menu on a click outside it or on Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top strip above the banner: Admin Login on the right. */}
      <div className="bg-brand-900">
        <div className="mx-auto flex max-w-6xl justify-end px-4 py-1 sm:px-6">
          <Link to="/admin" className="flex items-center gap-1 text-xs font-medium text-brand-100 hover:text-white">
            <Icon name="shield" className="h-3.5 w-3.5" />
            Admin Login
          </Link>
        </div>
      </div>
      <OrgHeader />

      {/* Wide screens: separate links in the bar, divided by thin lines. Small screens: ☰ Menu dropdown. */}
      <header className="sticky top-0 z-30 bg-brand-800 shadow-sm">
        <div ref={menuRef} className="relative mx-auto flex max-w-6xl items-center px-4 py-2 sm:px-6">
          <nav aria-label="Main" className="hidden items-center divide-x divide-white/20 md:flex">
            {links.map((l) => (
              <div key={l.to} className="px-1.5 first:pl-0">
                <NavLink to={l.to} end={l.end} className={navClass}>
                  {l.label}
                </NavLink>
              </div>
            ))}
          </nav>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-brand-100 hover:bg-white/10 hover:text-white md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="main-menu"
          >
            <Icon name={open ? "close" : "menu"} />
            Menu
          </button>
          {open && (
            <nav
              id="main-menu"
              aria-label="Main"
              className="absolute left-4 right-4 top-full mt-1 rounded-lg bg-brand-800 p-2 shadow-lg ring-1 ring-white/10 sm:left-6 sm:right-auto sm:w-64 md:hidden"
            >
              <div className="flex flex-col divide-y divide-white/15">
                {links.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.end} className={navClass}>
                    {l.label}
                  </NavLink>
                ))}
              </div>
            </nav>
          )}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-brand-900 text-brand-100">
        <div>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-brand-200 sm:px-6">
            <span>© {year} {config?.orgName || ""}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
