import { Link } from "react-router-dom";
import { ArrowRight, Bot, CircleDashed, PhoneCall, Sparkles } from "lucide-react";
import { DemoBadge, Panel, PanelHeader, SkeletonRows } from "../components/primitives";
import { StatCard } from "../components/StatCard";
import { SessionTable } from "../components/SessionTable";
import { RealVoicePanel } from "../components/RealVoicePanel";
import { VoiceBars } from "@/components/ui/VoiceBars";
import { formatNumber, demoSpark } from "../data/demoWorkspace";
import { useStudio } from "../StudioProvider";

const USAGE_ROWS: Array<{ key: string; label: string }> = [
  { key: "voice_session", label: "Sessions metered" },
  { key: "message", label: "Messages" },
  { key: "ai_request", label: "AI requests" },
  { key: "characters", label: "Characters generated" },
  { key: "audio_seconds", label: "Audio seconds (estimated)" },
];

export function OverviewPage() {
  const { agents, totals, origin, originNote, demoNotice, performance, sessions } = useStudio();
  const loading = origin === "loading";

  const usageMax = Math.max(
    1,
    ...USAGE_ROWS.map((row) => {
      const value =
        row.key === "characters"
          ? totals.turns * 62
          : row.key === "audio_seconds"
            ? totals.minutes * 60
            : row.key === "message"
              ? totals.turns
              : row.key === "ai_request"
                ? totals.turns
                : totals.sessions;
      return value;
    })
  );

  const usageValue = (key: string) =>
    key === "characters"
      ? totals.turns * 62
      : key === "audio_seconds"
        ? totals.minutes * 60
        : key === "message" || key === "ai_request"
          ? totals.turns
          : totals.sessions;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <Panel dark className="flex flex-col justify-between gap-6 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">
                Demo Workspace · Amman
              </p>
              <DemoBadge live={false} note={originNote} />
            </div>
            <h2 className="mt-4 text-[1.9rem] leading-[1.05] font-medium sm:text-[2.15rem]">
              Voice agents, ready to
                <br className="hidden sm:block" /> configure — not yet dialling.
            </h2>
            <p className="mt-3.5 max-w-md text-[14px] leading-relaxed text-white/55">
              {origin === "live"
                ? `Agents are persisted to your organization through the API. Session, campaign and analytics figures remain generated until their production engines land.`
                : `Agent configuration is held in this browser session. Sessions, campaigns and analytics are generated demo rows.`}{" "}
              Telephony, recording and billing are separate phases.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[10.5px]">
              <span className="rounded-full bg-white/10 px-2.5 py-1 font-display font-bold tracking-[0.14em] uppercase">
                Real · agents {origin === "live" ? "(API)" : "(this tab)"}
              </span>
              <span className="rounded-full border border-white/15 px-2.5 py-1 font-display font-bold tracking-[0.14em] text-white/45 uppercase">
                Demo · sessions, minutes, campaigns, analytics
              </span>
            </div>
          </div>

          <div>
            <div className="h-12 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white/60">
              <VoiceBars count={30} intensity={0.4} className="h-full w-full" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link
                to="/studio/agents"
                className="btn-primary inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-display text-[13px] font-semibold text-black"
              >
                <Bot size={14} />
                Create an agent
              </Link>
              <Link
                to="/studio/sessions"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 font-display text-[13px] font-semibold text-white/70 transition-colors hover:border-white/45 hover:bg-white/10 hover:text-white"
              >
                <PhoneCall size={14} />
                Voice sessions
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </Panel>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7 lg:gap-5">
          <StatCard
            label="Total voice sessions"
            value={loading ? "—" : formatNumber(totals.sessions)}
            note="Rows in the demo session ledger. Live mode reads voice_sessions from the API."
            series={demoSpark("sessions")}
            status={origin === "live" ? "live" : "draft"}
            statusLabel={origin === "live" ? "API" : "Demo"}
          />
          <StatCard
            label="Total conversation minutes"
            value={loading ? "—" : formatNumber(totals.minutes)}
            unit="min"
            note="Sum of generated durations — not billed, not measured."
            series={demoSpark("minutes")}
          />
          <StatCard
            label="Active AI agents"
            value={`${totals.activeAgents} / ${agents.length}`}
            tone="dark"
            note="Agents marked live in this workspace. Marking does not connect a number."
          />
          <Panel as="article" className="flex flex-col gap-3 sm:col-span-2">
            <PanelHeader
              eyebrow="Usage overview"
              title="Metered events in this workspace"
              aside={<DemoBadge live={false} />}
            />
            <ul className="space-y-2.5">
              {USAGE_ROWS.map((row) => {
                const value = usageValue(row.key);
                return (
                  <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="numeral truncate text-[11.5px] text-black/50">{row.key}</span>
                        <span className="numeral text-[13px] font-bold">{formatNumber(value)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-mist">
                        <div
                          className="h-full rounded-full bg-ink transition-[width] duration-[900ms] ease-smooth"
                          style={{ width: `${Math.round((value / usageMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] leading-relaxed text-black/40">
              {demoNotice}
            </p>
          </Panel>
        </div>
      </div>

      <RealVoicePanel dense />

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="lg:col-span-8">
          {loading ? (
            <Panel>
              <SkeletonRows rows={4} />
            </Panel>
          ) : (
            <SessionTable compact />
          )}
        </div>

        <div className="grid gap-4 lg:col-span-4 lg:gap-5">
          <Panel as="article" className="space-y-4">
            <PanelHeader eyebrow="Agent performance" title="Demo ledger roll-up" />
            <ul className="space-y-3">
              {performance.slice(0, 4).map((row) => (
                <li key={row.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[13px] font-medium">{row.name}</span>
                    <span className="numeral shrink-0 text-[12px] font-bold">{row.resolutionRate}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-mist">
                    <div
                      className="h-full rounded-full bg-ink transition-[width] duration-700 ease-smooth"
                      style={{ width: `${Math.max(6, row.resolutionRate)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-black/40">
                    {row.sessions} sessions · {row.minutes} min
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-relaxed text-black/40">
              Resolution rate is the share of generated rows marked completed — a layout figure, not a
              containment metric.
            </p>
          </Panel>

          <Panel as="article" className="space-y-3.5">
            <PanelHeader eyebrow="Path to real data" title="What this workspace still needs" />
            <ul className="space-y-2.5 text-[13px] leading-relaxed text-black/60">
              {[
                "A configured API base URL (VITE_API_BASE_URL) for live rows",
                "Realtime voice credential present server-side (OPENAI_API_KEY)",
                "Postgres repository + migrations for durability",
                "Telephony layer for numbers, routing and recording",
                "Production authentication for multi-tenant access",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CircleDashed size={13} className="mt-0.5 shrink-0 text-black/30" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              to="/studio/settings"
              className="inline-flex items-center gap-1.5 font-display text-[12.5px] font-semibold text-black/60 transition-colors hover:text-black"
            >
              <Sparkles size={13} />
              Environment & settings
              <ArrowRight size={12} />
            </Link>
          </Panel>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-black/35">
        {sessions.length} generated session rows back this page. Switching a KPI to real data requires the
        API foundation to return rows — no figure here is inferred or estimated silently.
      </p>
    </div>
  );
}
