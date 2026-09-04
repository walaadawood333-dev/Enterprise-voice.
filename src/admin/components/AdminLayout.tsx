/**
 * CenterAI Admin Layout — Platform Control Plane
 *
 * Sidebar navigation for the administrative platform.
 * Distinct visual identity from the customer workspace.
 */

import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Building2, CreditCard, Shield, Settings, Server, BadgeCheck, ScrollText, BarChart3, Users, Plug, HeartPulse, LogOut } from "lucide-react";
import { cn } from "@/utils/cn";
import { useAuth } from "@/hooks/useAuth";

const NAV_ITEMS = [
  { to: "/admin/overview", icon: LayoutDashboard, label: "Overview" },
  { to: "/admin/organizations", icon: Building2, label: "Organizations" },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/plans", icon: CreditCard, label: "Plans" },
  { to: "/admin/subscriptions", icon: ScrollText, label: "Subscriptions" },
  { to: "/admin/entitlements", icon: BadgeCheck, label: "Entitlements" },
  { to: "/admin/providers", icon: Server, label: "Providers" },
  { to: "/admin/connectors", icon: Plug, label: "Connectors" },
  { to: "/admin/usage", icon: BarChart3, label: "Usage" },
  { to: "/admin/health", icon: HeartPulse, label: "Health" },
  { to: "/admin/audit", icon: Shield, label: "Audit Log" },
  { to: "/admin/settings", icon: Settings, label: "Settings" },
];

export function AdminLayout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h1 className="font-display text-lg font-bold tracking-tight">CenterAI</h1>
          <p className="text-xs text-white/40 mt-1 font-display uppercase tracking-widest">Platform Admin</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-white/10 p-4">
          <div className="px-3 py-1">
            <p className="truncate text-sm font-medium">{session?.name}</p>
            <p className="truncate text-xs text-white/40">{session?.email} · {session?.role}</p>
          </div>
          <button type="button" onClick={() => void signOut().then(() => navigate("/", { replace: true }))} className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/5 hover:text-white"><LogOut size={13} /> Sign out</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
