import { apiFetch } from "@/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Clock, CheckCircle, XCircle } from "lucide-react";

interface AgentPerformance {
  agentId: string;
  agentName: string;
  status: string;
  totalSessions: number;
  completedSessions: number;
  failedSessions: number;
  completionRate: number;
  avgDurationSeconds: number | null;
}

export function AgentPerformance() {
  const [performance, setPerformance] = useState<AgentPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/workspace/agents/performance")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setPerformance)
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-black/50">Loading agent performance...</p>
      </div>
    );
  }

  if (performance.length === 0) {
    return (
      <div className="p-8">
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-black/35 mb-1">AI Agents</p>
        <h2 className="text-2xl font-display font-bold tracking-tight mb-6">Performance</h2>
        <div className="rounded-xl border border-hair bg-white p-12 text-center">
          <TrendingUp size={48} className="text-black/10 mx-auto mb-4" />
          <p className="text-lg font-display font-bold text-black/60">No performance data</p>
          <p className="text-sm text-black/40 mt-1">
            Agent performance metrics appear here once sessions are completed.
          </p>
        </div>
      </div>
    );
  }

  const sortedBySessions = [...performance].sort((a, b) => b.totalSessions - a.totalSessions);
  const sortedByCompletion = [...performance].sort((a, b) => b.completionRate - a.completionRate);
  const topPerformers = sortedByCompletion.slice(0, 3);

  return (
    <div className="p-8 space-y-6">
      <div>
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-black/35 mb-1">AI Agents</p>
        <h2 className="text-2xl font-display font-bold tracking-tight">Performance</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {topPerformers.map((agent, idx) => (
          <Link
            key={agent.agentId}
            to={`/workspace/agents/${agent.agentId}`}
            className="rounded-xl border border-hair bg-white p-5 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl font-display font-bold text-black/20">
                {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  agent.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-700"
                }`}
              >
                {agent.status}
              </span>
            </div>
            <h3 className="font-display font-bold text-lg mb-2">{agent.agentName}</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-black/45">Sessions</span>
                <span className="font-bold">{agent.totalSessions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-black/45">Completion Rate</span>
                <span className="font-bold text-green-700">{agent.completionRate.toFixed(1)}%</span>
              </div>
              {agent.avgDurationSeconds && (
                <div className="flex items-center justify-between">
                  <span className="text-black/45">Avg Duration</span>
                  <span className="font-bold">{Math.round(agent.avgDurationSeconds)}s</span>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-hair bg-white overflow-hidden">
        <div className="bg-mist border-b border-hair px-5 py-3">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35">
            All Agents ({performance.length})
          </h3>
        </div>
        <table className="w-full">
          <thead className="bg-mist/50 border-b border-hair">
            <tr>
              <th className="text-left px-5 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Agent</th>
              <th className="text-left px-5 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Status</th>
              <th className="text-left px-5 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Total Sessions</th>
              <th className="text-left px-5 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Completed</th>
              <th className="text-left px-5 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Failed</th>
              <th className="text-left px-5 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Success Rate</th>
              <th className="text-left px-5 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Avg Duration</th>
            </tr>
          </thead>
          <tbody>
            {sortedBySessions.map((agent) => (
              <tr key={agent.agentId} className="border-b border-hair hover:bg-mist/30 transition-colors">
                <td className="px-5 py-4">
                  <Link to={`/workspace/agents/${agent.agentId}`} className="font-medium hover:underline">
                    {agent.agentName}
                  </Link>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      agent.status === "active" ? "bg-green-50 text-green-700" :
                      agent.status === "paused" ? "bg-orange-50 text-orange-700" :
                      "bg-gray-50 text-gray-700"
                    }`}
                  >
                    {agent.status}
                  </span>
                </td>
                <td className="px-5 py-4 font-display font-bold">{agent.totalSessions}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={14} className="text-green-600" />
                    <span>{agent.completedSessions}</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1.5">
                    <XCircle size={14} className="text-red-600" />
                    <span>{agent.failedSessions}</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-mist rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600"
                        style={{ width: `${agent.completionRate}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">{agent.completionRate.toFixed(1)}%</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  {agent.avgDurationSeconds ? (
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} className="text-black/40" />
                      <span>{Math.round(agent.avgDurationSeconds)}s</span>
                    </div>
                  ) : (
                    <span className="text-black/30">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
