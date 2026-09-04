import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Bot, PhoneCall, BarChart3, Activity, Users, BadgeCheck, ContactRound, Plug, ShieldCheck, Settings, LogOut } from "lucide-react";
import { cn } from "@/utils/cn";
import { useTenantBranding } from "@/branding/TenantBrandingProvider";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { to: "/workspace/overview", icon: LayoutDashboard, label: "Overview" },
  { to: "/workspace/calls", icon: PhoneCall, label: "Calls" },
  { to: "/workspace/live", icon: Activity, label: "Live" },
  { to: "/workspace/agents", icon: Bot, label: "AI Agents" },
  { to: "/workspace/agents/performance", icon: BarChart3, label: "Performance" },
  { to: "/workspace/campaigns", icon: Users, label: "Campaigns" },
  { to: "/workspace/contacts", icon: ContactRound, label: "Contacts · not configured" },
  { to: "/workspace/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/workspace/team", icon: Users, label: "Team & Roles" },
  { to: "/workspace/integrations", icon: Plug, label: "Integrations" },
  { to: "/workspace/compliance", icon: ShieldCheck, label: "Compliance" },
  { to: "/workspace/settings", icon: Settings, label: "Settings" },
  { to: "/workspace/plan", icon: BadgeCheck, label: "Plan & Capabilities" },
];

export function WorkspaceLayout() {
  const { branding } = useTenantBranding();
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const demo = session?.identitySource === "demo-local";
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
        {demo ? <div className="mx-3 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold leading-relaxed text-amber-800">DEMO MODE · simulated providers only</div> : null}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
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
        <div className="space-y-2 border-t border-hair p-4">
          <p className="truncate text-xs font-semibold text-black/60">{session?.name}</p>
          <p className="truncate text-[10px] text-black/35">{session?.email} · {session?.role}</p>
          <button type="button" onClick={() => void signOut().then(() => navigate("/", { replace: true }))} className="flex w-full items-center justify-center gap-2 rounded-lg border border-hair px-3 py-2 text-xs font-semibold text-black/55 hover:bg-mist"><LogOut size={13} /> Sign out</button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  );
}
