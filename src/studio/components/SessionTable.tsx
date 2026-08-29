import { useMemo, useState } from "react";
import { Download, Waves } from "lucide-react";
import { DataTable, type Column } from "./DataTable";
import { Labeled, Panel, Sheet, StatusChip, fieldClass, SkeletonRows } from "./primitives";
import {
  LANGUAGE_LABEL,
  formatDateTime,
  formatDuration,
  type StudioSession,
} from "../data/demoWorkspace";
import { useFilteredSessions, useStudio } from "../StudioProvider";

const SESSION_STATUS_LABEL: Record<StudioSession["status"], string> = {
  created: "Created",
  active: "In progress",
  completed: "Completed",
  handover: "Handed to human",
  failed: "Failed",
};

const TURNS = [
  {
    role: "Caller",
    text: "I need the status of a transfer I made this morning.",
  },
  {
    role: "Agent",
    text: "The transfer is still in processing. I can send a written confirmation to your phone.",
  },
  {
    role: "Caller",
    text: "Please do.",
  },
];

export function SessionTable({
  compact = false,
  agentId,
  onOpen = true,
}: {
  compact?: boolean;
  agentId?: string;
  onOpen?: boolean;
}) {
  const { agents, origin, pushToast, sessions } = useStudio();
  const rows = useFilteredSessions(agentId);
  const [selected, setSelected] = useState<StudioSession | null>(null);
  const [status, setStatus] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (row) => (status === "all" || row.status === status) && (agentFilter === "all" || row.agentId === agentFilter)
    );
    return compact ? filtered.slice(0, 6) : filtered;
  }, [rows, status, agentFilter, compact]);

  const columns = useMemo<Column<StudioSession>[]>(
    () => [
      {
        key: "id",
        header: "Session ID",
        sortValue: (row) => row.id,
        render: (row) => (
          <span className="numeral text-[12.5px] font-semibold tracking-tight text-black/70">
            {row.id}
          </span>
        ),
      },
      {
        key: "agent",
        header: "Agent",
        sortValue: (row) => row.agentName,
        render: (row) => (
          <span className="block max-w-[220px] truncate">{row.agentName}</span>
        ),
      },
      {
        key: "language",
        header: "Language",
        sortValue: (row) => row.language,
        render: (row) => (
          <span className={row.language === "en" ? "" : "font-arabic"}>
            {LANGUAGE_LABEL[row.language]}
          </span>
        ),
      },
      {
        key: "duration",
        header: "Duration",
        align: "end",
        sortValue: (row) => row.durationSeconds,
        render: (row) => (
          <span className="numeral font-semibold">{formatDuration(row.durationSeconds)}</span>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortValue: (row) => row.status,
        render: (row) => (
          <StatusChip status={row.status} label={SESSION_STATUS_LABEL[row.status]} />
        ),
      },
      {
        key: "startedAt",
        header: "Started at",
        sortValue: (row) => row.startedAt,
        render: (row) => <span className="text-black/55">{formatDateTime(row.startedAt)}</span>,
      },
    ],
    []
  );

  const exportCsv = () => {
    const header = "session_id,agent,language,duration_seconds,turns,status,started_at";
    const body = visible
      .map((row) =>
        [
          row.id,
          `"${row.agentName.replace(/"/g, '""')}"`,
          LANGUAGE_LABEL[row.language],
          row.durationSeconds,
          row.turns,
          row.status,
          row.startedAt,
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `centerai-demo-sessions-${visible.length}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    pushToast(`Exported ${visible.length} demo rows as CSV.`, "info");
  };

  return (
    <>
      <Panel as="section" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
              Voice sessions
            </p>
            <h2 className="mt-1.5 font-display text-xl leading-tight font-medium">
              {visible.length} of {sessions.length} rows
              <span className="ms-2 text-[12px] font-normal text-black/40">
                {origin === "live" ? "from the API" : "demo data"}
              </span>
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Labeled htmlFor="session-agent-filter" label="">
              <select
                id="session-agent-filter"
                value={agentFilter}
                onChange={(event) => setAgentFilter(event.target.value)}
                aria-label="Filter sessions by agent"
                className={cnSelect("lg:w-[190px]")}
              >
                <option value="all">All agents</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled htmlFor="session-status-filter" label="">
              <select
                id="session-status-filter"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label="Filter sessions by status"
                className={cnSelect()}
              >
                <option value="all">All statuses</option>
                {Object.entries(SESSION_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Labeled>
            <button
              type="button"
              onClick={exportCsv}
              disabled={visible.length === 0}
              className="inline-flex cursor-pointer items-center gap-1.5 self-end rounded-full border border-hair bg-white px-3.5 py-2 font-display text-[12px] font-semibold text-black/60 transition-colors hover:border-black/25 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>

        <DataTable
          label="Voice sessions"
          rows={visible}
          columns={columns}
          onOpenRow={onOpen ? (row) => setSelected(row) : undefined}
          emptyTitle={rows.length === 0 ? "No sessions match" : "No sessions yet"}
          emptyBody={
            rows.length === 0
              ? "Clear the search or status filter to see the rest of the demo workspace."
              : "Sessions appear here once a voice line is connected. Nothing is generated automatically."
          }
        />

        {!compact ? (
          <p className="text-[11px] leading-relaxed text-black/40">
            Durations and turn counts are generated for layout. No audio is stored, and no recording
            feature exists in this build.
          </p>
        ) : null}
      </Panel>

      <Sheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.id ?? "Session"}
        description="Demo session detail — transcript text is generated sample copy, not a recording."
      >
        {selected ? (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                ["Agent", selected.agentName],
                ["Language", LANGUAGE_LABEL[selected.language]],
                ["Duration", formatDuration(selected.durationSeconds)],
                ["Turns", String(selected.turns)],
                ["Started", formatDateTime(selected.startedAt)],
                ["Status", SESSION_STATUS_LABEL[selected.status]],
              ].map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="font-display text-[9px] font-bold tracking-[0.16em] text-black/40 uppercase">
                    {key}
                  </dt>
                  <dd className="mt-1 truncate text-[13.5px] font-medium">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="mb-3 flex items-center gap-2 font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
                <Waves size={12} />
                Transcript excerpt (sample)
              </p>
              <ul className="space-y-2.5">
                {TURNS.map((line, index) => (
                  <li
                    key={`${line.role}-${index}`}
                    className={
                      line.role === "Agent"
                        ? "me-auto max-w-[92%] rounded-2xl border border-hair bg-mist/60 px-4 py-2.5 text-[13.5px] leading-relaxed text-black/70"
                        : "ms-auto max-w-[92%] rounded-2xl bg-ink px-4 py-2.5 text-[13.5px] leading-relaxed text-white"
                    }
                  >
                    <span className="mb-1 block font-display text-[9px] tracking-[0.18em] uppercase opacity-55">
                      {line.role}
                    </span>
                    {line.text}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-hair bg-mist/60 px-4 py-3.5">
              <p className="font-display text-[10px] font-bold tracking-[0.18em] text-black/45 uppercase">
                Usage events
              </p>
              <ul className="mt-2.5 grid gap-2 text-[13px] sm:grid-cols-3">
                {[
                  ["session_started", "1"],
                  ["messages", String(selected.turns)],
                  ["audio_seconds", String(selected.durationSeconds)],
                ].map(([key, value]) => (
                  <li key={key} className="flex items-baseline justify-between gap-3">
                    <span className="numeral text-black/45">{key}</span>
                    <span className="numeral font-bold">{value}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] leading-relaxed text-black/40">
                Counters above are derived from the same generated row as the table — they are not
                provider telemetry.
              </p>
            </div>
          </div>
        ) : (
          <SkeletonRows rows={3} />
        )}
      </Sheet>
    </>
  );
}

const cnSelect = (extra?: string) =>
  `${fieldClass} cursor-pointer appearance-none py-2 text-[13px] ${extra ?? "lg:w-[172px]"}`;
