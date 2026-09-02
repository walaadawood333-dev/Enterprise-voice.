import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Bot, PhoneCall, BarChart3, Activity, Users } from "lucide-react";
import { cn } from "@/utils/cn";

const NAV = [
  { to: "/workspace/overview", icon: LayoutDashboard, label: "Overview" },
  { to: "/workspace/calls", icon: PhoneCall, label: "Calls" },
  { to: "/workspace/live", icon: Activity, label: "Live" },
  { to: "/workspace/agents", icon: Bot, label: "AI Agents" },
  { to: "/workspace/agents/performance", icon: BarChart3, label: "Performance" },
  { to: "/workspace/campaigns", icon: Users, label: "Campaigns" },
  { to: "/workspace/analytics", icon: BarChart3, label: "Analytics" },
];

export function WorkspaceLayout() {
  return (
    <div className="flex h-screen bg-mist">
      <aside className="w-60 border-r border-hair bg-white flex flex-col">
        <div className="p-5 border-b border-hair">
          <h1 className="font-display text-base font-bold tracking-tight">CenterAI</h1>
          <p className="text-[10px] text-black/35 font-display uppercase tracking-widest mt-0.5">Workspace</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                  isActive ? "bg-black/[0.04] text-black" : "text-black/45 hover:text-black/70 hover:bg-black/[0.02]"
                )
              }
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
