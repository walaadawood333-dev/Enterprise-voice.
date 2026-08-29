import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CircleAlert,
  FlaskConical,
  Pencil,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { Panel, Sheet, SkeletonRows, StatusChip, fieldClass } from "../components/primitives";
import { AgentBuilder } from "../components/AgentBuilder";
import { useStudio } from "../StudioProvider";
import { LANGUAGE_LABEL, type AgentStatus } from "../data/demoWorkspace";
import { cn } from "@/utils/cn";

const STATUS_OPTIONS: Array<{ value: AgentStatus; label: string; hint: string }> = [
  { value: "draft", label: "Draft", hint: "Testable in Studio Test Mode only" },
  { value: "active", label: "Active", hint: "Available for sessions" },
  { value: "paused", label: "Paused", hint: "Temporarily unavailable" },
  { value: "archived", label: "Archived", hint: "Preserved, never used" },
];

/**
 * Agent detail + lifecycle control for one persisted agent: read, edit, change status, delete,
 * and open the Test environment. Every action is scoped to the signed-in organization by the API.
 */
export function AgentDetailPage() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const { agents, updateAgent, deleteAgent, origin, agentsLoading, reloadAgents } = useStudio();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Fetch directly so a deep link works even before the list has been paged in.
    if (!agents.some((agent) => agent.id === agentId) && origin === "live") void reloadAgents();
  }, [agentId, agents, origin, reloadAgents]);

  const agent = useMemo(() => agents.find((item) => item.id === agentId), [agents, agentId]);

  if (agentsLoading && !agent) {
    return (
      <Panel as="section" className="space-y-3">
        <SkeletonRows rows={3} />
      </Panel>
    );
  }

  if (!agent) {
    return (
      <Panel as="section" className="space-y-4">
        <div className="flex items-center gap-2.5 text-black/60">
          <CircleAlert size={16} />
          <h2 className="font-display text-xl font-medium">Agent not found in this workspace</h2>
        </div>
        <p className="max-w-xl text-[13px] leading-relaxed text-black/50">
          Either it was deleted, or it belongs to another organization — cross-tenant rows are never
          readable, so they look identical to missing ones.
        </p>
        <Link
          to="/studio/agents"
          className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-white px-4 py-2 font-display text-[13px] font-semibold text-black/65 transition-colors hover:border-black/25 hover:text-black"
        >
          <ArrowLeft size={13} />
          Back to agents
        </Link>
      </Panel>
    );
  }

  const changeStatus = async (status: AgentStatus) => {
    if (status === agent.status) return;
    setBusy(true);
    await updateAgent(agent.id, { status });
    setBusy(false);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/studio/agents"
          className="inline-flex items-center gap-1.5 font-display text-[12px] font-semibold tracking-wide text-black/45 transition-colors hover:text-black"
        >
          <ArrowLeft size={13} />
          AI Agents
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-hair bg-white px-3.5 py-2 font-display text-[12.5px] font-semibold text-black/60 transition-colors hover:border-black/25 hover:text-black"
          >
            <Pencil size={13} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-hair bg-white px-3.5 py-2 font-display text-[12.5px] font-semibold text-black/45 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 size={13} />
            Delete
          </button>
          <Link
            to={`/studio/agents/${agent.id}/test`}
            className="btn-primary inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 font-display text-[13px] font-semibold text-white"
          >
            <FlaskConical size={14} />
            Test Agent
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <Panel as="section" className="lg:col-span-7 space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-[1.8rem] leading-tight font-medium tracking-tight">
                {agent.name}
              </h2>
              <StatusChip status={agent.status} />
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-black/55">
              {agent.description?.trim() || "No description set."}
            </p>
          </div>

          <dl className="grid gap-4 border-y border-hair py-5 sm:grid-cols-3">
            {[
              ["Industry", agent.industry],
              ["Language", LANGUAGE_LABEL[agent.language]],
              ["Voice", agent.voice],
              ["Created", new Date(agent.createdAt).toLocaleString("en-GB")],
              ["Updated", new Date(agent.updatedAt).toLocaleString("en-GB")],
              [
                "Storage",
                agent.recordSource === "server" || origin === "live" ? "PostgreSQL (this org)" : "This tab only",
              ],
            ].map(([key, value]) => (
              <div key={key as string} className="min-w-0">
                <dt className="font-display text-[9px] font-bold tracking-[0.16em] text-black/40 uppercase">
                  {key}
                </dt>
                <dd className="mt-1 truncate text-[13px] font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-4">
            <div>
              <p className="font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
                Welcome message
              </p>
              <p
                dir={agent.language === "en" ? "ltr" : "rtl"}
                className={cn(
                  "mt-2 rounded-2xl border border-hair bg-mist/60 px-4 py-3 text-[13.5px] leading-relaxed",
                  agent.language !== "en" && "font-arabic text-end"
                )}
              >
                {agent.welcomeMessage.trim() || "Not set — the agent opens with the engine default."}
              </p>
            </div>
            <div>
              <p className="font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
                System prompt
              </p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl border border-hair bg-white p-4 font-sans text-[12.5px] leading-relaxed text-black/65">
                {agent.instructions.trim() || "No custom instructions — the CenterAI guardrails apply."}
              </pre>
            </div>
          </div>
        </Panel>

        <div className="space-y-4 lg:col-span-5">
          <Panel as="section" className="space-y-3.5">
            <p className="font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
              Status management
            </p>
            <div className="grid gap-2" role="group" aria-label="Change agent status">
              {STATUS_OPTIONS.map((option) => {
                const active = agent.status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={busy}
                    onClick={() => void changeStatus(option.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-start transition-all duration-300 disabled:opacity-60",
                      active
                        ? "border-black bg-ink text-white"
                        : "border-hair bg-white hover:border-black/25 hover:bg-mist"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-display text-[14px] font-bold tracking-tight">
                        {option.label}
                      </span>
                      <span className={cn("block text-[11.5px]", active ? "text-white/60" : "text-black/45")}>
                        {option.hint}
                      </span>
                    </span>
                    {active ? <PlayCircle size={15} /> : null}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] leading-relaxed text-black/40">
              Status changes write through the API and persist for your organization. Only an
              <span className="font-semibold text-black/60"> active </span>
              agent takes normal sessions; a draft runs only in Studio Test Mode.
            </p>
          </Panel>

          <Panel dark as="section" className="space-y-3">
            <p className="font-display text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">
              Test environment
            </p>
            <p className="text-[13.5px] leading-relaxed text-white/55">
              Runs the real orchestration layer: a VoiceSession row is created, your messages and the
              agent's replies are persisted as transcript text, and usage events are recorded. No audio
              is stored, and no phone call is placed.
            </p>
            <Link
              to={`/studio/agents/${agent.id}/test`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-display text-[13px] font-semibold text-black transition-opacity hover:opacity-90"
            >
              <FlaskConical size={14} />
              Open Test Mode
            </Link>
          </Panel>
        </div>
      </div>

      {editing ? (
        <AgentBuilder
          open={editing}
          existing={agent}
          persisted={agent.recordSource === "server" || origin === "live"}
          onClose={() => setEditing(false)}
          onSave={async (draft, publish) => {
            await updateAgent(agent.id, { ...draft, status: publish ? "active" : agent.status });
            setEditing(false);
          }}
        />
      ) : null}

      <Sheet
        open={confirm}
        onClose={() => {
          setConfirm(false);
          setConfirmText("");
        }}
        width="max-w-lg"
        title={`Delete “${agent.name}”?`}
        description="Sessions and usage already recorded for this agent stay in your organization's history."
        footer={
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={confirmText.trim() !== agent.name || busy}
              onClick={async () => {
                setBusy(true);
                const ok = await deleteAgent(agent.id);
                setBusy(false);
                setConfirm(false);
                setConfirmText("");
                if (ok) navigate("/studio/agents");
              }}
              className="btn-primary inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-display text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={14} />
              {busy ? "Deleting…" : "Confirm Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="cursor-pointer rounded-full border border-hair bg-white px-5 py-2.5 font-display text-sm font-semibold text-black/60 transition-colors hover:border-black/25 hover:text-black"
            >
              Cancel
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-[13.5px] leading-relaxed text-black/60">
            This removes the agent from <span className="font-semibold text-black">{agent.industry}</span>{" "}
            configuration for your organization. Type the name exactly to continue.
          </p>
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={agent.name}
            aria-label="Type the agent name to confirm deletion"
            className={fieldClass}
          />
        </div>
      </Sheet>
    </div>
  );
}
