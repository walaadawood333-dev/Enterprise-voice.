import { useMemo, useState } from "react";
import { CircleAlert, Plus, RefreshCw } from "lucide-react";
import { AgentCard } from "../components/AgentCard";
import { AgentBuilder } from "../components/AgentBuilder";
import { DemoBadge, EmptyState, Panel, SkeletonRows } from "../components/primitives";
import { useStudio, type AgentDraft } from "../StudioProvider";
import type { StudioAgent } from "../data/demoWorkspace";
import { cn } from "@/utils/cn";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "draft", label: "Drafts" },
  { key: "paused", label: "Paused" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

export function AgentsPage() {
  const {
    agents,
    sessions,
    origin,
    agentsLoading,
    agentsError,
    query,
    demoNotice,
    reloadAgents,
    createAgent,
    updateAgent,
  } = useStudio();
  const [filter, setFilter] = useState<Filter>("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<StudioAgent | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return agents.filter((agent) => {
      if (filter !== "all" && agent.status !== filter) return false;
      if (!needle) return true;
      return (
        agent.name.toLowerCase().includes(needle) ||
        agent.industry.toLowerCase().includes(needle) ||
        agent.voice.includes(needle)
      );
    });
  }, [agents, filter, query]);

  const counts = useMemo(() => {
    const map: Record<string, { sessions: number; minutes: number }> = {};
    for (const session of sessions) {
      const bucket = map[session.agentId] ?? { sessions: 0, minutes: 0 };
      bucket.sessions += 1;
      bucket.minutes += Math.round(session.durationSeconds / 60);
      map[session.agentId] = bucket;
    }
    return map;
  }, [sessions]);

  const persisted = origin === "live";

  const handleSave = async (draft: AgentDraft, publish: boolean) => {
    setSaving(true);
    const status = publish ? "active" : draft.status ?? "draft";
    const ok = editing
      ? await updateAgent(editing.id, { ...draft, status })
      : await createAgent({ ...draft, status });
    setSaving(false);
    if (ok) {
      setBuilderOpen(false);
      setEditing(null);
      if (!editing) {
        // Newest row is unknown until reload resolves; highlight by name instead.
        setHighlight(null);
      }
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <Panel as="section" className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-[1.6rem] leading-none font-medium sm:text-[1.85rem]">
              {agents.length} agents
            </h2>
            <DemoBadge
              live={persisted}
              note={
                persisted
                  ? "Rows come from /api/agents, scoped to your organization by the session."
                  : "No API base URL configured, so agent edits live in this browser tab only."
              }
            />
          </div>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-black/50">
            {persisted
              ? "Agents are persisted through the API and isolated to your organization."
              : demoNotice}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void reloadAgents()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-hair bg-white px-3.5 py-2 font-display text-[12.5px] font-semibold text-black/55 transition-colors hover:border-black/25 hover:text-black"
          >
            <RefreshCw size={13} className={agentsLoading ? "animate-spin" : undefined} />
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setBuilderOpen(true);
            }}
            className="btn-primary inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-display text-sm font-semibold text-white"
          >
            <Plus size={15} />
            Create Agent
          </button>
        </div>
      </Panel>

      {agentsError ? (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-900"
        >
          <CircleAlert size={14} className="mt-0.5 shrink-0" />
          The API returned an error while loading agents ({agentsError}). Showing the seeded demo set
          so the workspace stays usable.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter agents by status">
        {FILTERS.map((item) => {
          const active = filter === item.key;
          const count =
            item.key === "all" ? agents.length : agents.filter((agent) => agent.status === item.key).length;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              aria-pressed={active}
              className={cn(
                "cursor-pointer rounded-full border px-3.5 py-1.5 font-display text-[12px] font-semibold transition-all duration-300",
                active
                  ? "border-black bg-black text-white"
                  : "border-hair bg-white text-black/55 hover:border-black/25 hover:text-black"
              )}
            >
              {item.label}
              <span className={cn("numeral ms-1.5 text-[11px]", active ? "text-white/55" : "text-black/35")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {agentsLoading && agents.length === 0 ? (
        <SkeletonRows rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No agents match this view"
          body="Adjust the status filter or clear the search to see the rest of the workspace."
          action={
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="cursor-pointer rounded-full border border-hair bg-white px-4 py-2 font-display text-[13px] font-semibold transition-colors hover:border-black/25"
            >
              Show all agents
            </button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          {rows.map((agent) => (
            <li key={agent.id}>
              <AgentCard
                agent={agent}
                sessions={counts[agent.id]?.sessions ?? 0}
                minutes={counts[agent.id]?.minutes ?? 0}
                onEdit={(target) => {
                  setEditing(target);
                  setBuilderOpen(true);
                  setHighlight(target.id);
                }}
                highlight={highlight === agent.id}
              />
            </li>
          ))}
        </ul>
      )}

      {builderOpen ? (
        <AgentBuilder
          open={builderOpen}
          existing={editing}
          saving={saving}
          persisted={persisted}
          onClose={() => {
            setBuilderOpen(false);
            setHighlight(null);
          }}
          onSave={handleSave}
        />
      ) : null}
    </div>
  );
}
