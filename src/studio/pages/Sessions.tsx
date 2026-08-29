import { useMemo } from "react";
import { DemoBadge, Panel, PanelHeader } from "../components/primitives";
import { RealVoicePanel } from "../components/RealVoicePanel";
import { SessionTable } from "../components/SessionTable";
import { formatDuration } from "../data/demoWorkspace";
import { useStudio } from "../StudioProvider";

export function SessionsPage() {
  const { sessions, origin, originNote } = useStudio();

  const summary = useMemo(() => {
    const total = sessions.length || 1;
    const seconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
    return {
      rows: sessions.length,
      active: sessions.filter((session) => session.status === "active").length,
      handover: sessions.filter((session) => session.status === "handover").length,
      failed: sessions.filter((session) => session.status === "failed").length,
      avg: Math.round(seconds / total),
      minutes: Math.round(seconds / 60),
    };
  }, [sessions]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {[
          ["Rows in ledger", String(summary.rows), "Generated demo sessions"],
          ["In progress now", String(summary.active), "One row is live-state for UI testing"],
          ["Handed to human", `${Math.round((summary.handover / summary.rows) * 100)}%`, `${summary.handover} of ${summary.rows} rows`],
          ["Average duration", formatDuration(summary.avg), `${summary.minutes} min total`],
        ].map(([label, value, note], index) => (
          <Panel
            key={label}
            as="article"
            className={index === 0 ? "lg:col-span-1" : undefined}
          >
            <PanelHeader
              eyebrow={label}
              title={value}
              aside={index === 0 ? <DemoBadge live={origin === "live"} note={originNote} /> : undefined}
            />
            <p className="mt-2 text-[11.5px] leading-snug text-black/40">{note}</p>
          </Panel>
        ))}
      </div>

      <RealVoicePanel />

      <Panel as="section" className="space-y-2">
        <PanelHeader
          eyebrow="Demo ledger"
          title="Generated session rows"
          aside={<DemoBadge live={false} />}
        />
        <p className="text-[12px] leading-relaxed text-black/45">
          These exist only to design and test this surface. They are never mixed into the production
          panel above.
        </p>
      </Panel>

      <SessionTable />

      <Panel as="section" className="space-y-2.5">
        <PanelHeader eyebrow="Data handling" title="What a session row contains" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Identifiers", "session id, agent id, organization id — tenant-scoped at the repository layer"],
            ["Timing", "started_at, duration, turn count; audio_seconds is estimated, never measured"],
            ["Outcome", "completed / active / handover / failed — a state label, not a quality score"],
            ["Media", "nothing. No audio file, no recording and no transcript archive is stored in this build"],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-hair bg-mist/50 px-4 py-3.5">
              <p className="font-display text-[12px] font-bold tracking-wide">{title}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-black/50">{body}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
