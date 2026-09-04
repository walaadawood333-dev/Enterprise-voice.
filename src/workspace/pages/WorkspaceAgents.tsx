import { useEffect, useState } from "react";
import { Bot, Loader2, Plus } from "lucide-react";
import type { AgentDto } from "../../../shared/contracts";
import { apiFetch } from "@/api";
import { useAuth } from "@/hooks/useAuth";

export function WorkspaceAgents() {
  const { session } = useAuth();
  const [agents, setAgents] = useState<AgentDto[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManage = session?.role === "owner" || session?.role === "admin";

  const load = async () => {
    setError(null);
    const response = await apiFetch("/api/agents");
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error?.message ?? "Agents could not be loaded.");
      setLoading(false);
      return;
    }
    const payload = await response.json();
    setAgents(Array.isArray(payload) ? payload : []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!canManage || name.trim().length < 2) return;
    setSaving(true);
    setError(null);
    const response = await apiFetch("/api/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), language: "en", status: "draft" }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error?.message ?? "Agent creation failed.");
    } else {
      setName("");
      await load();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 p-8">
      <div>
        <p className="font-display text-[10px] uppercase tracking-[0.2em] text-black/35">Agent operations</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">AI Agents</h2>
        <p className="mt-2 text-sm text-black/45">Rows on this page come from the tenant-scoped agents API.</p>
      </div>

      {canManage ? (
        <div className="flex max-w-2xl gap-2 rounded-xl border border-hair bg-white p-4">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="New agent name"
            className="min-w-0 flex-1 rounded-lg border border-hair px-3 py-2 text-sm outline-none focus:border-black/30"
          />
          <button
            type="button"
            disabled={saving || name.trim().length < 2}
            onClick={() => void create()}
            className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create draft
          </button>
        </div>
      ) : (
        <p className="rounded-xl border border-hair bg-white p-4 text-sm text-black/50">Your role has read-only access to agents.</p>
      )}

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-black/45"><Loader2 size={14} className="animate-spin" /> Loading agents…</p>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 bg-white p-10 text-center">
          <Bot className="mx-auto text-black/15" />
          <p className="mt-3 text-sm text-black/45">No agents exist in this organization.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <article key={agent.id} className="rounded-xl border border-hair bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold">{agent.name}</h3>
                  <p className="mt-1 text-xs text-black/45">{agent.language.toUpperCase()} · {agent.industry}</p>
                </div>
                <span className="rounded-full bg-mist px-2 py-1 text-[10px] font-semibold uppercase text-black/50">{agent.status}</span>
              </div>
              <p className="mt-4 line-clamp-2 text-sm text-black/50">{agent.description || "No description"}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
