import { useEffect, useState } from "react";
import { PhoneCall, Bot, Clock, Activity, Users, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

interface OverviewData {
  organizationId: string;
  voice: {
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    failedSessions: number;
    avgSessionDuration: number | null;
    inboundCalls: number;
    outboundCalls: number;
    completedCalls: number;
    failedCalls: number;
    avgCallDuration: number | null;
  };
  agents: {
    total: number;
    active: number;
    paused: number;
    draft: number;
  };
  usage: {
    totalEvents: number;
    voiceSessions: number;
    messages: number;
    aiRequests: number;
    characters: number;
    audioSeconds: number;
  };
  limits: {
    maxUsers: number;
    maxAgents: number;
    maxMonthlyMinutes: number;
    maxCampaigns: number;
    maxConnectors: number;
  };
  entitlements: string[];
}

function StatCard({ icon: Icon, label, value, hint, link }: { icon: any; label: string; value: string | number; hint?: string; link?: string }) {
  const content = (
    <div className="rounded-xl border border-hair bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className="text-black/30" />
        <span className="text-[10px] font-display uppercase tracking-widest text-black/35">{label}</span>
      </div>
      <p className="text-2xl font-display font-bold">{value}</p>
      {hint && <p className="text-xs text-black/30 mt-1">{hint}</p>}
    </div>
  );

  return link ? <Link to={link} className="block hover:opacity-80 transition-opacity">{content}</Link> : content;
}

export function WorkspaceOverview() {
  const [bootstrap, setBootstrap] = useState<any>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/workspace/bootstrap").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/workspace/overview").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([bootstrapData, overviewData]) => {
        setBootstrap(bootstrapData);
        setOverview(overviewData);
      })
      .catch(() => setError("Failed to load workspace data"));
  }, []);

  if (error) {
    return (
      <div className="p-8">
        <h2 className="text-2xl font-display font-bold tracking-tight mb-4">Overview</h2>
        <div className="rounded-xl border border-hair bg-white p-5">
          <p className="text-sm text-black/50">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-black/35 mb-1">Customer Workspace</p>
        <h2 className="text-2xl font-display font-bold tracking-tight">
          {bootstrap?.organization?.name || "Organization"} Overview
        </h2>
      </div>

      {bootstrap && (
        <div className="rounded-xl border border-hair bg-white p-5">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35 mb-3">Organization</h3>
          <p className="text-lg font-display font-bold">{bootstrap.organization?.name || "Demo Organization"}</p>
          <p className="text-sm text-black/45 mt-1">
            Plan: <strong>{bootstrap.subscription?.planType || "trial"}</strong> · Status: <strong>{bootstrap.subscription?.status || "trial"}</strong>
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(bootstrap.entitlements || []).slice(0, 5).map((f: string) => (
              <span key={f} className="px-2 py-0.5 rounded-full bg-mist text-[10px] font-medium text-black/50">{f}</span>
            ))}
            {(bootstrap.entitlements || []).length > 5 && (
              <span className="px-2 py-0.5 rounded-full bg-mist text-[10px] font-medium text-black/50">
                +{bootstrap.entitlements.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-display text-sm font-bold uppercase tracking-widest text-black/35 mb-3">Voice Operations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={PhoneCall}
            label="Total Sessions"
            value={overview?.voice.totalSessions || 0}
            hint={`${overview?.voice.activeSessions || 0} active`}
            link="/workspace/calls"
          />
          <StatCard
            icon={PhoneCall}
            label="Inbound Calls"
            value={overview?.voice.inboundCalls || 0}
          />
          <StatCard
            icon={PhoneCall}
            label="Outbound Calls"
            value={overview?.voice.outboundCalls || 0}
          />
          <StatCard
            icon={Clock}
            label="Avg Duration"
            value={overview?.voice.avgCallDuration ? `${Math.round(overview.voice.avgCallDuration)}s` : "No data"}
          />
        </div>
      </div>

      <div>
        <h3 className="font-display text-sm font-bold uppercase tracking-widest text-black/35 mb-3">AI Agents</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Bot}
            label="Total Agents"
            value={overview?.agents.total || 0}
            hint={`${overview?.agents.active || 0} active`}
            link="/workspace/agents"
          />
          <StatCard
            icon={TrendingUp}
            label="Active"
            value={overview?.agents.active || 0}
          />
          <StatCard
            icon={Clock}
            label="Paused"
            value={overview?.agents.paused || 0}
          />
          <StatCard
            icon={Clock}
            label="Draft"
            value={overview?.agents.draft || 0}
          />
        </div>
      </div>

      <div>
        <h3 className="font-display text-sm font-bold uppercase tracking-widest text-black/35 mb-3">Usage</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Activity}
            label="Total Events"
            value={overview?.usage.totalEvents || 0}
            link="/workspace/analytics"
          />
          <StatCard
            icon={Activity}
            label="Messages"
            value={overview?.usage.messages || 0}
          />
          <StatCard
            icon={Activity}
            label="AI Requests"
            value={overview?.usage.aiRequests || 0}
          />
          <StatCard
            icon={Clock}
            label="Audio Seconds"
            value={overview?.usage.audioSeconds ? Math.round(overview.usage.audioSeconds) : 0}
          />
        </div>
      </div>

      {overview?.entitlements.includes("campaigns") && (
        <div>
          <h3 className="font-display text-sm font-bold uppercase tracking-widest text-black/35 mb-3">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to="/workspace/calls" className="rounded-xl border border-hair bg-white p-5 hover:bg-mist transition-colors">
              <PhoneCall size={24} className="text-black/40 mb-2" />
              <p className="font-display font-bold">Call Operations</p>
              <p className="text-xs text-black/45 mt-1">View all calls and activity</p>
            </Link>
            <Link to="/workspace/agents" className="rounded-xl border border-hair bg-white p-5 hover:bg-mist transition-colors">
              <Bot size={24} className="text-black/40 mb-2" />
              <p className="font-display font-bold">AI Agents</p>
              <p className="text-xs text-black/45 mt-1">Manage and monitor agents</p>
            </Link>
            <Link to="/workspace/campaigns" className="rounded-xl border border-hair bg-white p-5 hover:bg-mist transition-colors">
              <Users size={24} className="text-black/40 mb-2" />
              <p className="font-display font-bold">Campaigns</p>
              <p className="text-xs text-black/45 mt-1">Create and manage campaigns</p>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
