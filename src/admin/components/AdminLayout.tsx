/**
 * CenterAI Admin Layout — Platform Control Plane
 *
 * Sidebar navigation for the administrative platform.
 * Distinct visual identity from the customer workspace.
 */

import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Building2, CreditCard, Shield, Settings, Server, BadgeCheck, ScrollText, BarChart3 } from "lucide-react";
import { cn } from "@/utils/cn";

const NAV_ITEMS = [
  { to: "/admin/overview", icon: LayoutDashboard, label: "Overview" },
  { to: "/admin/organizations", icon: Building2, label: "Organizations" },
  { to: "/admin/plans", icon: CreditCard, label: "Plans" },
  { to: "/admin/subscriptions", icon: ScrollText, label: "Subscriptions" },
  { to: "/admin/entitlements", icon: BadgeCheck, label: "Entitlements" },
  { to: "/admin/providers", icon: Server, label: "Providers" },
  { to: "/admin/usage", icon: BarChart3, label: "Usage" },
  { to: "/admin/audit", icon: Shield, label: "Audit Log" },
  { to: "/admin/settings", icon: Settings, label: "Settings" },
];

export function AdminLayout() {
  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h1 className="font-display text-lg font-bold tracking-tight">CenterAI</h1>
          <p className="text-xs text-white/40 mt-1 font-display uppercase tracking-widest">Platform Admin</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
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
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">
              SA
            </div>
            <div>
              <p className="text-sm font-medium">Super Admin</p>
              <p className="text-xs text-white/40">platform@centerai.jo</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
