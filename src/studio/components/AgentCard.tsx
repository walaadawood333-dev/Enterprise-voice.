import { useState } from "react";
import { Pencil, PlayCircle, Trash2, Volume2 } from "lucide-react";
import { Labeled, Sheet, StatusChip, fieldClass } from "./primitives";
import { LANGUAGE_LABEL, type StudioAgent } from "../data/demoWorkspace";
import { useStudio } from "../StudioProvider";
import { cn } from "@/utils/cn";

export function AgentCard({
  agent,
  sessions,
  minutes,
  onEdit,
  highlight,
}: {
  agent: StudioAgent;
  sessions: number;
  minutes: number;
  onEdit: (agent: StudioAgent) => void;
  highlight?: boolean;
}) {
  const { setAgentStatus, deleteAgent, pushToast, origin } = useStudio();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const live = agent.status === "active";
  const persisted = agent.recordSource === "server" || origin === "live";

  const remove = async () => {
    setBusy(true);
    await deleteAgent(agent.id);
    setBusy(false);
    setConfirmDelete(false);
    setConfirmText("");
  };

  return (
    <>
      <article
        className={cn(
          "group flex h-full flex-col justify-between rounded-3xl border bg-white p-5 transition-all duration-500 ease-smooth hover:border-black/20 hover:shadow-[0_26px_60px_-46px_rgba(0,0,0,0.45)]",
          highlight ? "border-black/35" : "border-hair"
        )}
      >
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-display text-[1.15rem] leading-tight font-bold tracking-tight">
                {agent.name}
              </h3>
              <p className="mt-1 truncate text-[11.5px] text-black/45">
                {agent.industry} · {minutes} min handled
                <span
                  className={cn(
                    "ms-2 rounded-full px-1.5 py-0.5 font-display text-[9px] font-bold tracking-[0.14em] uppercase",
                    persisted ? "bg-ink text-white" : "bg-black/[0.06] text-black/45"
                  )}
                  title={persisted ? "Persisted through the API for your organization" : "Held in this browser session only"}
                >
                  {persisted ? "Real" : "Demo"}
                </span>
              </p>
            </div>
            <StatusChip status={agent.status} />
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-mist/70 p-3.5">
            {[
              ["Language", LANGUAGE_LABEL[agent.language]],
              ["Voice", agent.voice.split("-")[0] ?? agent.voice],
              ["Sessions", String(sessions)],
            ].map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="font-display text-[9px] font-bold tracking-[0.16em] text-black/40 uppercase">
                  {key}
                </dt>
                <dd className={cn("mt-1 truncate text-[13px] font-semibold", agent.language !== "en" && key === "Language" && "font-arabic")}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-3.5 line-clamp-2 text-[13px] leading-relaxed text-black/55">
            {agent.welcomeMessage.trim() || "No welcome message set — the agent opens with your prompt default."}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-hair pt-4">
          <button
            type="button"
            onClick={() => onEdit(agent)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-hair px-3 py-1.5 font-display text-[11px] font-semibold text-black/60 transition-colors hover:border-black/25 hover:bg-mist hover:text-black"
          >
            <Pencil size={12} />
            Edit
          </button>
          <button
            type="button"
            onClick={() =>
              pushToast(
                "Testing opens from the Agent builder — it runs the same voice console as the public site.",
                "info"
              )
            }
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-hair px-3 py-1.5 font-display text-[11px] font-semibold text-black/60 transition-colors hover:border-black/25 hover:bg-mist hover:text-black"
          >
            <PlayCircle size={12} />
            Test
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-hair px-3 py-1.5 font-display text-[11px] font-semibold text-black/45 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 size={12} />
            Delete
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setAgentStatus(agent.id, live ? "paused" : "active")}
            className={cn(
              "ms-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-[11px] font-semibold transition-colors disabled:opacity-50",
              live ? "bg-black/[0.06] text-black/65 hover:bg-black/10" : "bg-ink text-white hover:opacity-90"
            )}
          >
            <Volume2 size={12} />
            {live ? "Pause" : "Mark live"}
          </button>
        </div>
      </article>

      <Sheet
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false);
          setConfirmText("");
        }}
        width="max-w-lg"
        title="Delete this agent?"
        description={
          persisted
            ? "This removes the row from your organization through the API. Session history is kept for metering."
            : "This removes the row from this browser session only."
        }
        footer={
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={confirmText.trim() !== agent.name || busy}
              onClick={() => void remove()}
              className="btn-primary inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 font-display text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={14} />
              {busy ? "Deleting…" : "Delete agent"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="cursor-pointer rounded-full border border-hair bg-white px-5 py-2.5 font-display text-sm font-semibold text-black/60 transition-colors hover:border-black/25 hover:text-black"
            >
              Keep it
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-[13.5px] leading-relaxed text-black/60">
            Type the agent name exactly to confirm: <span className="font-semibold text-black">{agent.name}</span>
          </p>
          <Labeled htmlFor="confirm-delete" label="Confirmation">
            <input
              id="confirm-delete"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={agent.name}
              className={cn(fieldClass, confirmText && confirmText.trim() !== agent.name && fieldClass)}
            />
          </Labeled>
        </div>
      </Sheet>
    </>
  );
}
