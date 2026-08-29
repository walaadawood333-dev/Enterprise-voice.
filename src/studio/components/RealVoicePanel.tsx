import { Link } from "react-router-dom";
import { Database, FlaskConical, RefreshCw } from "lucide-react";
import { DemoBadge, Panel, PanelHeader, StatusChip } from "./primitives";
import { useVoiceData } from "../hooks/useVoiceEngine";
import { LANGUAGE_LABEL } from "../data/demoWorkspace";
import { cn } from "@/utils/cn";

const formatDuration = (seconds: number) => {
  if (!seconds) return "0s";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest.toString().padStart(2, "0")}s` : `${rest}s`;
};

/**
 * Production voice-session metrics, computed only from persisted rows for this organization.
 * When there are none it says so plainly — this surface never fills itself with generated data.
 */
export function RealVoicePanel({ dense = false }: { dense?: boolean }) {
  const { sessions, analytics, status, reload } = useVoiceData();

  const total = analytics?.totalSessions ?? sessions.length;
  const empty = total === 0;

  const cells: Array<[string, string]> = [
    ["Total sessions", String(total)],
    ["Completed", String(analytics?.completedSessions ?? 0)],
    ["Failed", String(analytics?.failedSessions ?? 0)],
    ["Active now", String(analytics?.activeSessions ?? 0)],
    ["Transcript messages", String(analytics?.totalMessages ?? 0)],
    ["Total conversation time", formatDuration(analytics?.totalDurationSeconds ?? 0)],
  ];

  return (
    <Panel as="section" className="space-y-4">
      <PanelHeader
        eyebrow="Production data"
        title="Voice sessions from this organization"
        aside={
          <div className="flex items-center gap-2">
            <DemoBadge live note="Real rows from the Voice Execution Engine — no generated figures." />
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-hair bg-white px-3 py-1.5 font-display text-[11.5px] font-semibold text-black/55 transition-colors hover:border-black/25 hover:text-black"
            >
              <RefreshCw size={12} className={status === "loading" ? "animate-spin" : undefined} />
              Refresh
            </button>
          </div>
        }
      />

      {status === "unavailable" ? (
        <p className="rounded-2xl border border-hair bg-mist/60 px-4 py-3 text-[12.5px] leading-relaxed text-black/50">
          The API did not return session data, so no numbers are shown. Start an agent session from the
          Agent Studio, or connect an API base URL.
        </p>
      ) : null}

      {empty ? (
        <div className="rounded-2xl border border-dashed border-black/20 bg-mist/50 px-5 py-8 text-center">
          <p className="flex items-center justify-center gap-2 font-display text-[1.05rem] font-medium">
            <Database size={15} className="text-black/40" />
            No production session data yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-black/45">
            Nothing has been fabricated for this view. Run a test session against an agent and the
            counts, transcripts and usage events will appear here — persisted to PostgreSQL when one is
            configured.
          </p>
          <Link
            to="/studio/agents"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 font-display text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <FlaskConical size={13} />
            Test an agent
          </Link>
        </div>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cells.map(([label, value], index) => (
              <div
                key={label}
                className={cn(
                  "rounded-2xl border border-hair px-3.5 py-3 transition-colors duration-300 hover:border-black/20",
                  index === 0 ? "bg-ink text-white" : "bg-white"
                )}
              >
                <dt
                  className={cn(
                    "font-display text-[9px] font-bold tracking-[0.16em] uppercase",
                    index === 0 ? "text-white/45" : "text-black/40"
                  )}
                >
                  {label}
                </dt>
                <dd className="numeral mt-1.5 text-[1.35rem] leading-none font-bold">{value}</dd>
              </div>
            ))}
          </dl>

          {!dense ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
                  By agent
                </p>
                <ul className="space-y-2">
                  {(analytics?.byAgent ?? []).slice(0, 6).map((row) => (
                    <li key={row.agentId} className="rounded-2xl border border-hair bg-white px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[13px] font-semibold">
                          {row.agentName}
                        </span>
                        <span className="numeral shrink-0 text-[12px] text-black/50">
                          {row.sessions} sessions · {row.messages} msgs
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist">
                        <div
                          className="h-full rounded-full bg-ink transition-[width] duration-700 ease-smooth"
                          style={{
                            width: `${Math.min(100, Math.round((row.sessions / Math.max(1, total)) * 100))}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="mb-2 font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
                    By language
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {Object.entries(analytics?.byLanguage ?? {}).map(([language, count]) => (
                      <li
                        key={language}
                        className="rounded-full border border-hair bg-white px-3 py-1.5 text-[12px]"
                      >
                        <span className={cn("font-medium", language !== "en" && "font-arabic")}>
                          {LANGUAGE_LABEL[language as "en" | "ar" | "jo"] ?? language}
                        </span>
                        <span className="numeral ms-2 text-black/45">{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
                    Recent sessions
                  </p>
                  <ul className="space-y-1.5">
                    {sessions.slice(0, 5).map((session) => (
                      <li key={session.id} className="flex items-center justify-between gap-3 text-[12px]">
                        <span className="numeral min-w-0 truncate text-black/55">{session.id}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {session.testMode ? (
                            <span className="font-display text-[9px] font-bold tracking-[0.14em] uppercase text-black/40">
                              test mode
                            </span>
                          ) : null}
                          <StatusChip status={session.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
