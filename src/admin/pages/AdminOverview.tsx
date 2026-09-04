import { apiFetch } from "@/api";
/**
 * Admin Overview — Platform Executive Dashboard
 *
 * Shows real platform-level metrics derived from the database.
 * Shows "No production data available" for metrics without data.
 */

import { useEffect, useState } from "react";
import { Building2, Users, Bot, PhoneCall, CreditCard, Server } from "lucide-react";

interface OverviewData {
  organizations: { total: number; active: number; trial: number; suspended: number };
  users: { total: number };
  agents: { total: number; active: number };
  voiceSessions: { total: number; completed: number; failed: number; active: number };
  calls: { total: number; inbound: number; outbound: number; completed: number; failed: number };
  subscriptions: { total: number; active: number; trial: number };
  plans: Array<{ id: string; name: string; planType: string }>;
  providers: number;
}

function StatCard({ icon: Icon, label, value, sublabel }: { icon: any; label: string; value: string | number; sublabel?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
          <Icon size={18} className="text-white/50" />
        </div>
        <span className="text-xs font-display uppercase tracking-widest text-white/40">{label}</span>
      </div>
      <p className="text-3xl font-display font-bold tracking-tight">{value}</p>
      {sublabel && <p className="text-xs text-white/30 mt-1">{sublabel}</p>}
    </div>
  );
}

export function AdminOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/admin/overview")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-display font-bold mb-4">Platform Overview</h2>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <p className="text-amber-200/80 text-sm">
            Admin API not yet available. This endpoint requires platform admin authentication.
          </p>
          <p className="text-amber-200/50 text-xs mt-2">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-display font-bold mb-4">Platform Overview</h2>
        <p className="text-white/40 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <p className="text-xs font-display uppercase tracking-widest text-white/40 mb-1">Platform Control Plane</p>
        <h2 className="text-2xl font-display font-bold tracking-tight">Executive Overview</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={Building2}
          label="Organizations"
          value={data.organizations.total}
          sublabel={`${data.organizations.active} active, ${data.organizations.trial} trial`}
        />
        <StatCard icon={Users} label="Users" value={data.users.total} />
        <StatCard
          icon={Bot}
          label="AI Agents"
          value={data.agents.total}
          sublabel={`${data.agents.active} active`}
        />
        <StatCard
          icon={PhoneCall}
          label="Voice Sessions"
          value={data.voiceSessions.total || "No data"}
          sublabel={data.voiceSessions.total ? `${data.voiceSessions.completed} completed` : "No production data available"}
        />
        <StatCard
          icon={PhoneCall}
          label="Calls"
          value={data.calls.total || "No data"}
          sublabel={data.calls.total ? `${data.calls.inbound} inbound, ${data.calls.outbound} outbound` : "No production data available"}
        />
        <StatCard
          icon={CreditCard}
          label="Subscriptions"
          value={data.subscriptions.total || "No data"}
          sublabel={data.subscriptions.total ? `${data.subscriptions.active} active` : "No production data available"}
        />
        <StatCard icon={Server} label="Providers" value={data.providers} />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="font-display text-sm font-bold uppercase tracking-widest text-white/40 mb-3">Available Plans</h3>
        <div className="flex flex-wrap gap-2">
          {data.plans.length === 0 ? (
            <p className="text-white/30 text-sm">No plans configured</p>
          ) : (
            data.plans.map((p) => (
              <span key={p.id} className="px-3 py-1.5 rounded-full bg-white/5 text-xs font-medium">
                {p.name} <span className="text-white/30">({p.planType})</span>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
