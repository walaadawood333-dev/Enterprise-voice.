import { useMemo } from "react";
import { BarChart3, CircleDashed, Database } from "lucide-react";
import { AnalyticsChart } from "../components/AnalyticsChart";
import { RealVoicePanel } from "../components/RealVoicePanel";
import { DemoBadge, Panel, PanelHeader } from "../components/primitives";
import { formatNumber, LANGUAGE_LABEL } from "../data/demoWorkspace";
import { useStudio } from "../StudioProvider";
import { cn } from "@/utils/cn";

export function AnalyticsPage() {
  const { series, languages, performance, totals, origin, originNote, demoNotice } = useStudio();

  const labels = useMemo(() => series.map((point) => point.label), [series]);

  const sessionsChart = useMemo(
    () => ({
      labels,
      datasets: [
        { label: "Voice sessions", data: series.map((point) => point.sessions) },
        { label: "Handovers", data: series.map((_point, index) => (index % 3 === 1 ? 1 : 0)) },
      ],
    }),
    [labels, series]
  );

  const minutesChart = useMemo(
    () => ({
      labels,
      datasets: [{ label: "Conversation minutes", data: series.map((point) => point.minutes) }],
    }),
    [labels, series]
  );

  const languageChart = useMemo(
    () => ({
      labels: languages.map((row) => LANGUAGE_LABEL[row.language]),
      datasets: [{ label: "Sessions", data: languages.map((row) => row.sessions) }],
    }),
    [languages]
  );

  const performanceChart = useMemo(
    () => ({
      labels: performance.map((row) => row.name.split("—")[0]!.trim()),
      datasets: [{ label: "Sessions handled", data: performance.map((row) => row.sessions) }],
    }),
    [performance]
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <Panel as="section" className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-[1.6rem] leading-none font-medium sm:text-[1.85rem]">
              Analytics
            </h2>
            <DemoBadge live={origin === "live"} note={originNote} />
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-black/50">
            {demoNotice} Every chart below is drawn from the same generated rows the tables show, so the
            surfaces agree — none of it is measured from a real call.
          </p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Analytics source">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-black bg-ink px-3.5 py-1.5 font-display text-[11.5px] font-semibold text-white">
            <BarChart3 size={12} />
            Demo analytics
          </span>
          <span
            title={origin === "live" ? undefined : "Unavailable: no configured API is returning rows."}
            aria-disabled="true"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-display text-[11.5px] font-semibold",
              origin === "live"
                ? "border-black/25 bg-white text-black/70"
                : "cursor-not-allowed border-hair bg-mist text-black/30"
            )}
          >
            <Database size={12} />
            Connected analytics
          </span>
        </div>
      </Panel>

      <RealVoicePanel />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <AnalyticsChart
          kind="line"
          eyebrow="Volume"
          title="Voice sessions per day"
          series={sessionsChart}
          caption="14 days of generated session rows, bucketed by started_at."
        />
        <AnalyticsChart
          kind="bar"
          eyebrow="Consumption"
          title="Conversation minutes"
          unit="min"
          series={minutesChart}
          caption="Derived from the same rows' durations — minutes are sums of generated seconds, not metered audio."
        />
        <AnalyticsChart
          kind="doughnut"
          eyebrow="Coverage"
          title="Language mix"
          series={languageChart}
          caption={`English ${languages[0]?.sessions ?? 0} · Arabic ${languages[1]?.sessions ?? 0} · Jordanian ${languages[2]?.sessions ?? 0}`}
        />
        <AnalyticsChart
          kind="performance"
          eyebrow="Agents"
          title="Sessions handled per agent"
          series={performanceChart}
          caption="Roll-up of generated rows per agent. A production report would add containment, handover and cost per resolved contact."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {[
          ["Sessions", formatNumber(totals.sessions)],
          ["Minutes", formatNumber(totals.minutes)],
          ["Turns", formatNumber(totals.turns)],
          ["Handovers", formatNumber(totals.handovers)],
        ].map(([label, value]) => (
          <Panel key={label} as="article">
            <PanelHeader eyebrow={label} title={value} />
          </Panel>
        ))}
      </div>

      <Panel as="section" className="space-y-3.5">
        <PanelHeader eyebrow="Definitions" title="What becomes real, and when" />
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            ["Voice sessions", "voice_sessions rows returned by the API — already wired, shown when live"],
            ["Conversation minutes", "usage_events.audio_seconds, measured server-side rather than summed from a script"],
            ["Language mix", "session.language across real tenants; needs production data volume"],
            ["Agent performance", "requires a defined outcome schema (resolved / handed over / abandoned)"],
          ].map(([title, body]) => (
            <li
              key={title}
              className="flex items-start gap-2.5 rounded-2xl border border-hair bg-mist/50 px-4 py-3.5 text-[12.5px] leading-relaxed text-black/55"
            >
              <CircleDashed size={13} className="mt-0.5 shrink-0 text-black/30" />
              <span>
                <span className="font-display block text-[13px] font-bold text-black/75">{title}</span>
                {body}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
