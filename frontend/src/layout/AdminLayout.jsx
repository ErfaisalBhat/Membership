import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useConfig } from "../api/useConfig";
import { api } from "../api/client";
import Brand from "../ui/Brand";
import Icon from "../ui/icons";

const SECTION_TITLES = [
  ["/admin/members/new", "Add member"],
  ["/admin/members", "Members"],
  ["/admin/applications", "Applications"],
  ["/admin/payments", "Payments"],
  ["/admin/password", "Change password"],
  ["/admin", "Dashboard"],
];

function sectionTitle(pathname) {
  const hit = SECTION_TITLES.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  return hit ? hit[1] : "Administration";
}

// Dark, institutional sidebar: white text, a thin white bar marks the active page.
// When collapsed only the icons show; the label appears as a tooltip.
function NavItem({ to, end, icon, label, collapsed, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        `relative flex items-center gap-3 border-l-2 py-2.5 text-sm ${collapsed ? "justify-center px-0" : "px-4"} ${
          isActive ? "border-white bg-white/10 font-semibold text-white" : "border-transparent text-zinc-300 hover:bg-white/5 hover:text-white"
        }`
      }
    >
      <Icon name={icon} className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {badge > 0 &&
        (collapsed ? (
          <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-white" aria-hidden="true" />
        ) : (
          <span className="min-w-6 bg-white px-1.5 py-0.5 text-center text-xs font-semibold text-zinc-900">{badge}</span>
        ))}
    </NavLink>
  );
}

function Sidebar({ pending, collapsed = false, onToggle }) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900 text-white">
      <div className={`flex items-center pb-2 pt-4 ${collapsed ? "justify-center" : "justify-between pl-4 pr-3"}`}>
        {!collapsed && <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Administration</p>}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name="menu" className="h-4 w-4 shrink-0" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-0.5" aria-label="Admin">
        <NavItem to="/admin" end icon="dashboard" label="Dashboard" collapsed={collapsed} />
        <NavItem to="/admin/members" icon="users" label="Members" collapsed={collapsed} />
        <NavItem to="/admin/applications" icon="inbox" label="Applications" collapsed={collapsed} badge={pending} />
        <NavItem to="/admin/payments" icon="card" label="Payments" collapsed={collapsed} />
        <NavItem to="/admin/fees" icon="id" label="Plan fees" collapsed={collapsed} />
        <NavItem to="/admin/members/new" icon="plus" label="Add member" collapsed={collapsed} />
      </nav>
      <div className="border-t border-white/10 py-3">
        <NavItem to="/admin/password" icon="key" label="Change password" collapsed={collapsed} />
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { username, logout } = useAuth();
  const { config } = useConfig();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    api("/admin/overview")
      .then((o) => setPending(o.pendingApplications))
      .catch(() => {});
  }, [location.pathname]);

  const toggleCollapsed = () => setCollapsed((c) => !c);

  return (
    <div className="admin-ui min-h-screen lg:flex">
      <aside className={`hidden shrink-0 transition-[width] duration-200 lg:fixed lg:inset-y-0 lg:block ${collapsed ? "w-16" : "w-64"}`}>
        <Sidebar pending={pending} collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-zinc-900 px-4 py-3 lg:hidden">
        <Brand config={config} to="/admin" light />
        <button type="button" onClick={() => setOpen(true)} className="p-2 text-zinc-200 hover:bg-white/10" aria-label="Open menu">
          <Icon name="menu" className="h-4 w-4 shrink-0" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-5 z-10 p-1 text-zinc-300" aria-label="Close menu">
              <Icon name="close" className="h-4 w-4 shrink-0" />
            </button>
            <Sidebar pending={pending} />
          </aside>
        </div>
      )}

      <div className={`min-w-0 flex-1 transition-[padding] duration-200 ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}>
        {/* Top bar: sidebar toggle, section, date, signed-in user */}
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{config?.orgName || "Membership"}</p>
              <p className="truncate text-sm font-semibold text-zinc-900">{sectionTitle(location.pathname)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="hidden text-sm text-zinc-700 sm:inline">{username}</span>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              <Icon name="logout" className="h-4 w-4 shrink-0" /> Log out
            </button>
          </div>
        </header>

        <main className={`mx-auto px-4 py-5 sm:px-6 lg:py-6${collapsed ? "max-w-6xl lg:max-w-7xl" : "max-w-6xl"}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
