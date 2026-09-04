import { apiFetch } from "@/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PhoneCall, PhoneIncoming, PhoneOutgoing, CheckCircle, XCircle, Clock } from "lucide-react";
import { clsx } from "clsx";

interface Call {
  id: string;
  agentId: string | null;
  agentName: string | null;
  voiceSessionId: string | null;
  provider: string;
  providerCallId: string;
  direction: "INBOUND" | "OUTBOUND";
  status: "INITIATED" | "RINGING" | "ANSWERED" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED";
  fromNumber: string | null;
  toNumber: string | null;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  metadata: Record<string, string | number | boolean | null>;
}

type TabFilter = "all" | "active" | "inbound" | "outbound" | "completed" | "failed";

export function CallsList() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>("all");

  useEffect(() => {
    apiFetch("/api/workspace/calls")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        setCalls(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredCalls = calls.filter((call) => {
    switch (activeTab) {
      case "active":
        return call.status === "RINGING" || call.status === "ANSWERED" || call.status === "ACTIVE";
      case "inbound":
        return call.direction === "INBOUND";
      case "outbound":
        return call.direction === "OUTBOUND";
      case "completed":
        return call.status === "COMPLETED";
      case "failed":
        return call.status === "FAILED";
      default:
        return true;
    }
  });

  const tabs: { id: TabFilter; label: string; count: number; icon: any }[] = [
    { id: "all", label: "All", count: calls.length, icon: PhoneCall },
    { id: "active", label: "Active", count: calls.filter((c) => ["RINGING", "ANSWERED", "ACTIVE"].includes(c.status)).length, icon: Clock },
    { id: "inbound", label: "Inbound", count: calls.filter((c) => c.direction === "INBOUND").length, icon: PhoneIncoming },
    { id: "outbound", label: "Outbound", count: calls.filter((c) => c.direction === "OUTBOUND").length, icon: PhoneOutgoing },
    { id: "completed", label: "Completed", count: calls.filter((c) => c.status === "COMPLETED").length, icon: CheckCircle },
    { id: "failed", label: "Failed", count: calls.filter((c) => c.status === "FAILED").length, icon: XCircle },
  ];

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-black/50">Loading calls...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-black/35 mb-1">Operations</p>
        <h2 className="text-2xl font-display font-bold tracking-tight">Calls</h2>
      </div>

      <div className="flex gap-2 border-b border-hair overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === tab.id
                ? "border-black text-black"
                : "border-transparent text-black/40 hover:text-black/60"
            )}
          >
            <tab.icon size={14} />
            {tab.label}
            <span className="px-1.5 py-0.5 rounded-full bg-mist text-[10px] font-bold">{tab.count}</span>
          </button>
        ))}
      </div>

      {filteredCalls.length === 0 ? (
        <div className="rounded-xl border border-hair bg-white p-12 text-center">
          <PhoneCall size={48} className="text-black/10 mx-auto mb-4" />
          <p className="text-lg font-display font-bold text-black/60">No calls found</p>
          <p className="text-sm text-black/40 mt-1">
            {activeTab === "all"
              ? "No calls have been made yet. Connect telephony to start making calls."
              : `No ${activeTab} calls match this filter.`}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-hair bg-white overflow-hidden">
          <table className="w-full">
            <thead className="bg-mist border-b border-hair">
              <tr>
                <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Call ID</th>
                <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Direction</th>
                <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Agent</th>
                <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">From</th>
                <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">To</th>
                <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Duration</th>
                <th className="text-left px-4 py-3 text-[10px] font-display font-bold uppercase tracking-widest text-black/35">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.map((call) => (
                <tr key={call.id} className="border-b border-hair hover:bg-mist/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/workspace/calls/${call.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                      {call.id.substring(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {call.direction === "INBOUND" ? (
                        <PhoneIncoming size={14} className="text-green-600" />
                      ) : (
                        <PhoneOutgoing size={14} className="text-blue-600" />
                      )}
                      <span className="text-xs">{call.direction}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{call.agentName || "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono">{call.fromNumber || "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono">{call.toNumber || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded-full text-[10px] font-medium",
                        call.status === "COMPLETED" && "bg-green-50 text-green-700",
                        call.status === "FAILED" && "bg-red-50 text-red-700",
                        call.status === "ACTIVE" && "bg-blue-50 text-blue-700",
                        call.status === "RINGING" && "bg-yellow-50 text-yellow-700",
                        call.status === "ANSWERED" && "bg-blue-50 text-blue-700",
                        call.status === "INITIATED" && "bg-gray-50 text-gray-700",
                        call.status === "CANCELLED" && "bg-gray-50 text-gray-700"
                      )}
                    >
                      {call.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{call.durationSeconds ? `${call.durationSeconds}s` : "—"}</td>
                  <td className="px-4 py-3 text-xs text-black/45">
                    {new Date(call.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
