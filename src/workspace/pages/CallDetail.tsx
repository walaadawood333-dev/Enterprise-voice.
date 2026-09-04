import { apiFetch } from "@/api";
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, PhoneCall, PhoneIncoming, PhoneOutgoing, Clock, MessageSquare } from "lucide-react";

interface CallDetailData {
  call: {
    id: string;
    agentId: string | null;
    agentName: string | null;
    voiceSessionId: string | null;
    provider: string;
    providerCallId: string;
    direction: "INBOUND" | "OUTBOUND";
    status: string;
    fromNumber: string | null;
    toNumber: string | null;
    createdAt: string;
    answeredAt: string | null;
    endedAt: string | null;
    durationSeconds: number | null;
    metadata: Record<string, any>;
  };
  events: Array<{
    id: string;
    callId: string;
    provider: string;
    eventType: string;
    occurredAt: string;
    providerEventId: string | null;
    payload: Record<string, any> | null;
  }>;
  messages: Array<{
    id: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
    metadata: Record<string, any>;
  }>;
}

export function CallDetail() {
  const { callId } = useParams<{ callId: string }>();
  const [data, setData] = useState<CallDetailData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!callId) return;
    apiFetch(`/api/workspace/calls/${callId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError(true));
  }, [callId]);

  if (error) {
    return (
      <div className="p-8">
        <Link to="/workspace/calls" className="inline-flex items-center gap-1.5 text-sm text-black/50 hover:text-black mb-4">
          <ArrowLeft size={14} /> Back to Calls
        </Link>
        <div className="rounded-xl border border-hair bg-white p-12 text-center">
          <p className="text-lg font-display font-bold text-black/60">Call not found</p>
          <p className="text-sm text-black/40 mt-1">This call may belong to another organization or no longer exists.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <p className="text-sm text-black/50">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <Link to="/workspace/calls" className="inline-flex items-center gap-1.5 text-sm text-black/50 hover:text-black mb-4">
          <ArrowLeft size={14} /> Back to Calls
        </Link>
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-black/35 mb-1">Call Detail</p>
        <h2 className="text-2xl font-display font-bold tracking-tight font-mono">{callId}</h2>
      </div>

      <div className="rounded-xl border border-hair bg-white p-5">
        <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35 mb-4">Call Information</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Direction</p>
            <div className="flex items-center gap-1.5">
              {data.call.direction === "INBOUND" ? (
                <PhoneIncoming size={14} className="text-green-600" />
              ) : (
                <PhoneOutgoing size={14} className="text-blue-600" />
              )}
              <span className="font-display font-bold">{data.call.direction}</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Status</p>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                data.call.status === "COMPLETED" ? "bg-green-50 text-green-700" :
                data.call.status === "FAILED" ? "bg-red-50 text-red-700" :
                data.call.status === "ACTIVE" ? "bg-blue-50 text-blue-700" :
                "bg-gray-50 text-gray-700"
              }`}
            >
              {data.call.status}
            </span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Agent</p>
            <p className="font-display font-bold">{data.call.agentName || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Duration</p>
            <p className="font-display font-bold">
              {data.call.durationSeconds ? `${data.call.durationSeconds}s` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">From</p>
            <p className="font-mono text-sm">{data.call.fromNumber || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">To</p>
            <p className="font-mono text-sm">{data.call.toNumber || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Provider</p>
            <p className="font-mono text-sm">{data.call.provider}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-black/35 mb-1">Created</p>
            <p className="text-sm">{new Date(data.call.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {data.events.length > 0 && (
        <div className="rounded-xl border border-hair bg-white p-5">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35 mb-4">
            Events ({data.events.length})
          </h3>
          <div className="space-y-2">
            {data.events.map((event) => (
              <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg bg-mist">
                <Clock size={14} className="text-black/30 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium">{event.eventType}</span>
                    <span className="text-[10px] text-black/30">
                      {new Date(event.occurredAt).toLocaleTimeString()}
                    </span>
                  </div>
                  {event.payload && Object.keys(event.payload).length > 0 && (
                    <pre className="text-[10px] text-black/40 mt-1 overflow-x-auto">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.messages.length > 0 && (
        <div className="rounded-xl border border-hair bg-white p-5">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-black/35 mb-4">
            Conversation Transcript ({data.messages.length} messages)
          </h3>
          <div className="space-y-3">
            {data.messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-lg ${
                  msg.role === "assistant" ? "bg-blue-50" : msg.role === "user" ? "bg-green-50" : "bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={12} className="text-black/30" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-black/40">
                    {msg.role}
                  </span>
                  <span className="text-[10px] text-black/30">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm">{msg.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.events.length === 0 && data.messages.length === 0 && (
        <div className="rounded-xl border border-hair bg-white p-8 text-center">
          <PhoneCall size={32} className="text-black/10 mx-auto mb-2" />
          <p className="text-sm text-black/40">No events or transcript available for this call.</p>
        </div>
      )}
    </div>
  );
}
