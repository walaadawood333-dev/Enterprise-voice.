import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Bot, PhoneCall, BarChart3, Activity, Users, BadgeCheck } from "lucide-react";
import { cn } from "@/utils/cn";
import { useTenantBranding } from "@/branding/TenantBrandingProvider";

const NAV = [
  { to: "/workspace/overview", icon: LayoutDashboard, label: "Overview" },
  { to: "/workspace/calls", icon: PhoneCall, label: "Calls" },
  { to: "/workspace/live", icon: Activity, label: "Live" },
  { to: "/workspace/agents", icon: Bot, label: "AI Agents" },
  { to: "/workspace/agents/performance", icon: BarChart3, label: "Performance" },
  { to: "/workspace/campaigns", icon: Users, label: "Campaigns" },
  { to: "/workspace/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/workspace/plan", icon: BadgeCheck, label: "Plan & Capabilities" },
];

export function WorkspaceLayout() {
  const { branding } = useTenantBranding();
  return (
    <div className="flex h-screen bg-mist">
      <aside className="w-60 border-r border-hair bg-white flex flex-col">
        <div className="border-b border-hair p-5">
          <div className="flex items-center gap-2.5">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-lg object-contain" />
            ) : (
              <span className="h-7 w-1.5 rounded-full" style={{ backgroundColor: branding.primaryColor }} />
            )}
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-bold tracking-tight">{branding.displayName}</h1>
              <p className="mt-0.5 font-display text-[10px] uppercase tracking-widest text-black/35">Workspace</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                  isActive ? "text-white" : "text-black/45 hover:text-black/70 hover:bg-black/[0.02]"
                )
              }
              style={({ isActive }) => isActive ? { backgroundColor: branding.primaryColor } : undefined}
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-hair">
          <p className="text-[10px] text-black/30 text-center">Enterprise Voice Platform</p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  );
}
