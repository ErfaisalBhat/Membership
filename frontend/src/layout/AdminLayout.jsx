import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useConfig } from "../api/useConfig";
import { api } from "../api/client";
import Brand from "../ui/Brand";
import Icon from "../ui/icons";

const itemClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

function Sidebar({ pending, username, logout, config }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-4">
        <Brand config={config} to="/admin" />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Admin">
        <NavLink to="/admin" end className={itemClass}>
          <Icon name="dashboard" /> Dashboard
        </NavLink>
        <NavLink to="/admin/members" className={itemClass}>
          <Icon name="users" /> Members
        </NavLink>
        <NavLink to="/admin/applications" className={itemClass}>
          <Icon name="inbox" />
          <span className="flex-1">Applications</span>
          {pending > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{pending}</span>}
        </NavLink>
        <NavLink to="/admin/payments" className={itemClass}>
          <Icon name="card" /> Payments
        </NavLink>
        <NavLink to="/admin/members/new" className={itemClass}>
          <Icon name="plus" /> Add member
        </NavLink>
      </nav>
      <div className="space-y-1 border-t border-slate-200 px-3 py-4">
        <a href="/" target="_blank" rel="noreferrer" className={itemClass({ isActive: false })}>
          <Icon name="external" /> Public website
        </a>
        <NavLink to="/admin/password" className={itemClass}>
          <Icon name="key" /> Change password
        </NavLink>
        <button type="button" onClick={logout} className={`${itemClass({ isActive: false })} w-full`}>
          <Icon name="logout" /> Log out
        </button>
        <p className="px-3 pt-2 text-xs text-slate-400">Signed in as {username}</p>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { username, logout } = useAuth();
  const { config } = useConfig();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    api("/admin/overview")
      .then((o) => setPending(o.pendingApplications))
      .catch(() => {});
  }, [location.pathname]);

  const sidebar = <Sidebar pending={pending} username={username} logout={logout} config={config} />;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:block">{sidebar}</aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Brand config={config} to="/admin" />
        <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
          <Icon name="menu" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-md p-1 text-slate-500" aria-label="Close menu">
              <Icon name="close" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
