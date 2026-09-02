import { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";

interface ActiveSession {
  id: string;
  organizationId: string;
  agentId: string;
  agentName: string | null;
  userId: string | null;
  language: string;
  status: string;
  mode: string;
  engine: string;
  testMode: boolean;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  turnCount: number;
  messageCount: number;
}

export function LiveActivity() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchSessions = () => {
    fetch("/api/workspace/live")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setSessions(data);
        setLastRefresh(new Date());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchSessions();
    // Poll every 5 seconds for live updates
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.2em] text-black/35 mb-1">Operations</p>
          <h2 className="text-2xl font-display font-bold tracking-tight">Live Activity</h2>
          <p className="text-xs text-black/40 mt-1">Auto-refreshes every 5 seconds</p>
        </div>
        <button
          onClick={fetchSessions}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-hair bg-white hover:bg-mist transition-colors text-sm"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-hair bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-display font-bold">Active Sessions</span>
          <span className="px-2 py-0.5 rounded-full bg-mist text-[10px] font-bold">
            {sessions.length}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-black/50">Loading...</p>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8">
            <Activity size={48} className="text-black/10 mx-auto mb-4" />
            <p className="text-lg font-display font-bold text-black/60">No active sessions</p>
            <p className="text-sm text-black/40 mt-1">
              Active voice sessions will appear here in real-time.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-4 p-4 rounded-lg border border-hair bg-mist/30"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold">Session {session.id.substring(0, 8)}</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-medium">
                      {session.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-black/35">Agent:</span>{" "}
                      <span className="font-medium">{session.agentName || session.agentId}</span>
                    </div>
                    <div>
                      <span className="text-black/35">Language:</span>{" "}
                      <span className="font-medium">{session.language}</span>
                    </div>
                    <div>
                      <span className="text-black/35">Mode:</span>{" "}
                      <span className="font-medium">{session.mode}</span>
                    </div>
                    <div>
                      <span className="text-black/35">Messages:</span>{" "}
                      <span className="font-medium">{session.messageCount}</span>
                    </div>
                    <div>
                      <span className="text-black/35">Turns:</span>{" "}
                      <span className="font-medium">{session.turnCount}</span>
                    </div>
                    <div>
                      <span className="text-black/35">Duration:</span>{" "}
                      <span className="font-medium">{session.durationSeconds ? `${session.durationSeconds}s` : "—"}</span>
                    </div>
                    <div>
                      <span className="text-black/35">Engine:</span>{" "}
                      <span className="font-medium">{session.engine}</span>
                    </div>
                    <div>
                      <span className="text-black/35">Started:</span>{" "}
                      <span className="font-medium">{new Date(session.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
                {session.testMode && (
                  <span className="px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 text-[10px] font-medium">
                    TEST
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] text-black/30 text-center">
        Last updated: {lastRefresh.toLocaleTimeString()}
      </p>
    </div>
  );
}
