import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Activity, PhoneCall, Users } from "lucide-react";

interface AnalyticsData {
  sessions: {
    total: number;
    byStatus: Record<string, number>;
    avgDurationSeconds: number;
    durationDistribution: number[];
  };
  calls: {
    total: number;
    byDirection: Record<string, number>;
  };
  usage: {
    voiceSessions: number;
    messages: number;
    aiRequests: number;
    characters: number;
    audioSeconds: number;
  };
  agents: Array<{
    agentId: string;
    agentName: string;
    totalSessions: number;
    completedSessions: number;
    completionRate: number;
  }>;
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workspace/analytics")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-black/50">Loading analytics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-hair bg-white p-12 text-center">
          <BarChart3 size={48} className="text-black/10 mx-auto mb-4" />
          <p className="text-lg font-display font-bold text-black/60">No analytics available</p>
          <p className="text-sm text-black/40 mt-1">Start using the platform to see analytics data.</p>
        </div>
      </div>
    );
  }

  const maxSessions = Math.max(...Object.values(data.sessions.byStatus), 1);
  const maxCalls = Math.max(...Object.values(data.calls.byDirection), 1);

  return (
    <div className="p-8 space-y-6">
      <div>
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-black/35 mb-1">Insights</p>
        <h2 className="text-2xl font-display font-bold tracking-tight">Analytics</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-hair bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <PhoneCall size={16} className="text-black/30" />
            <span className="text-[10px] font-display uppercase tracking-widest text-black/35">Total Sessions</span>
          </div>
          <p className="text-3xl font-display font-bold">{data.sessions.total}</p>
          <p className="text-xs text-black/40 mt-1">
            Avg: {data.sessions.avgDurationSeconds ? `${Math.round(data.sessions.avgDurationSeconds)}s` : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-hair bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-black/30" />
            <span className="text-[10px] font-display uppercase tracking-widest text-black/35">Messages</span>
          </div>
          <p className="text-3xl font-display font-bold">{data.usage.messages}</p>
          <p className="text-xs text-black/40 mt-1">Total messages processed</p>
        </div>

        <div className="rounded-xl border border-hair bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-black/30" />
            <span className="text-[10px] font-display uppercase tracking-widest text-black/35">AI Requests</span>
          </div>
          <p className="text-3xl font-display font-bold">{data.usage.aiRequests}</p>
          <p className="text-xs text-black/40 mt-1">AI completions requested</p>
        </div>

        <div className="rounded-xl border border-hair bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-black/30" />
            <span className="text-[10px] font-display uppercase tracking-widest text-black/35">Active Agents</span>
          </div>
          <p className="text-3xl font-display font-bold">{data.agents.length}</p>
          <p className="text-xs text-black/40 mt-1">Agents with activity</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-hair bg-white p-5">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35 mb-4">
            Sessions by Status
          </h3>
          {data.sessions.total === 0 ? (
            <p className="text-sm text-black/40 text-center py-8">No session data yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(data.sessions.byStatus).map(([status, count]) => (
                <div key={status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium capitalize">{status}</span>
                    <span className="text-sm font-bold">{count}</span>
                  </div>
                  <div className="w-full h-2 bg-mist rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        status === "completed" ? "bg-green-600" :
                        status === "failed" ? "bg-red-600" :
                        status === "active" ? "bg-blue-600" :
                        "bg-gray-400"
                      }`}
                      style={{ width: `${(count / maxSessions) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-hair bg-white p-5">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35 mb-4">
            Calls by Direction
          </h3>
          {data.calls.total === 0 ? (
            <p className="text-sm text-black/40 text-center py-8">No call data yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(data.calls.byDirection).map(([direction, count]) => (
                <div key={direction}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium capitalize">{direction}</span>
                    <span className="text-sm font-bold">{count}</span>
                  </div>
                  <div className="w-full h-2 bg-mist rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        direction === "INBOUND" ? "bg-green-600" : "bg-blue-600"
                      }`}
                      style={{ width: `${(count / maxCalls) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-hair bg-white p-5">
        <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35 mb-4">
          Agent Performance
        </h3>
        {data.agents.length === 0 ? (
          <p className="text-sm text-black/40 text-center py-8">No agent data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-mist border-b border-hair">
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Agent</th>
                  <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Total Sessions</th>
                  <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Completed</th>
                  <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((agent) => (
                  <tr key={agent.agentId} className="border-b border-hair hover:bg-mist/50 transition-colors">
                    <td className="px-4 py-3 font-medium">{agent.agentName}</td>
                    <td className="px-4 py-3">{agent.totalSessions}</td>
                    <td className="px-4 py-3">{agent.completedSessions}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-mist rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-600"
                            style={{ width: `${agent.completionRate}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{agent.completionRate.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-hair bg-white p-5">
        <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35 mb-4">
          Usage Summary
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Voice Sessions</p>
            <p className="text-2xl font-display font-bold">{data.usage.voiceSessions}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Messages</p>
            <p className="text-2xl font-display font-bold">{data.usage.messages}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">AI Requests</p>
            <p className="text-2xl font-display font-bold">{data.usage.aiRequests}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Characters</p>
            <p className="text-2xl font-display font-bold">{data.usage.characters}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Audio Seconds</p>
            <p className="text-2xl font-display font-bold">{Math.round(data.usage.audioSeconds)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
