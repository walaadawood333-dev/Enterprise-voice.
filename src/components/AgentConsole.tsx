import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, PhoneCall, Radio } from "lucide-react";
import { consoleLanguages } from "@/content/site";
import { VoiceBars } from "./ui/VoiceBars";
import { cn } from "@/utils/cn";

type Phase = "idle" | "listening" | "thinking" | "speaking" | "ended";

const phaseMeta: Record<Phase, { label: string; hint: string }> = {
  idle: { label: "Agent configured for this flow", hint: "Simulation idle · no live line connected" },
  listening: { label: "Caller speaking", hint: "Streaming audio → ASR (simulated)" },
  thinking: { label: "Reasoning", hint: "Intent · policy · tools (simulated)" },
  speaking: { label: "Agent speaking", hint: "TTS streaming · barge-in armed (simulated)" },
  ended: { label: "Call dispositioned", hint: "Transcript + action logged (simulated)" },
};

/**
 * Visual walkthrough of one agent turn. No audio, no telephony and no live telemetry:
 * every label in here is marked as simulated so it cannot read as production data.
 */
export function AgentConsole() {
  const [langIndex, setLangIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [revealed, setRevealed] = useState(0);
  const timers = useRef<number[]>([]);

  const lang = consoleLanguages[langIndex];

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  useEffect(() => {
    if (phase !== "idle") return;
    setRevealed(0);
  }, [phase, langIndex]);

  const simulate = useCallback(() => {
    clearTimers();
    setRevealed(0);
    const steps: [Phase, number, number][] = [
      ["listening", 0, 1],
      ["thinking", 1900, 1],
      ["speaking", 2500, 2],
      ["ended", 5400, 2],
      ["idle", 7600, 2],
    ];
    steps.forEach(([next, delay, lines]) => {
      timers.current.push(
        window.setTimeout(() => {
          setPhase(next);
          setRevealed(lines);
        }, delay)
      );
    });
  }, []);

  const intensity =
    phase === "listening" ? 0.95 : phase === "speaking" ? 0.8 : phase === "thinking" ? 0.35 : 0.16;

  return (
    <div className="grain relative overflow-hidden rounded-[20px] border border-hair-dark/70 bg-graphite text-white shadow-[0_50px_120px_-60px_rgba(0,0,0,0.85)] sm:rounded-3xl">
      {/* top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Radio size={13} className="text-white/45" />
          <span className="font-display text-[11px] font-bold tracking-[0.18em] text-white/50 uppercase">
            Simulated agent console
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80" />
          Demonstration only · no live line, no live metrics
        </div>
      </div>

      <div className="grid gap-px bg-white/8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* left: waveform + controls */}
        <div className="bg-graphite p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-display text-[10px] font-bold tracking-[0.18em] text-white/40 uppercase">
                {phaseMeta[phase].hint}
              </div>
              <div className="mt-1.5 text-lg leading-tight font-medium">{phaseMeta[phase].label}</div>
            </div>
            <div className="text-right">
              <div className="numeral text-3xl leading-none font-bold text-white/70">—</div>
              <div className="font-display mt-1 text-[9px] leading-tight tracking-[0.14em] text-white/35 uppercase">
                ms · not instrumented
                <br />
                in this build
              </div>
            </div>
          </div>

          <div className="relative mt-6 h-24 rounded-2xl border border-white/10 bg-black/35 px-3">
            <VoiceBars
              count={40}
              intensity={intensity}
              className="absolute inset-0 p-3 text-white"
              barClassName="min-w-[2px]"
            />
            {phase === "thinking" ? (
              <div
                aria-hidden="true"
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/12 to-transparent"
                style={{ animation: "sweep 1.1s linear infinite" }}
              />
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {consoleLanguages.map((l, i) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setLangIndex(i);
                  setPhase("idle");
                }}
                aria-pressed={i === langIndex}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300",
                  i === langIndex
                    ? "border-white bg-white text-black"
                    : "border-white/15 text-white/60 hover:border-white/40 hover:text-white"
                )}
              >
                {l.chip}
              </button>
            ))}
            <span className="ml-auto font-display text-[10px] tracking-[0.14em] text-white/35 uppercase">
              {lang.dialect}
            </span>
          </div>

          <button
            type="button"
            onClick={simulate}
            className="btn-primary mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
          >
            <PhoneCall size={15} />
            {phase === "idle" ? "Play the scripted turn" : "Replay the scripted turn"}
          </button>
        </div>

        {/* right: transcript */}
        <div className="bg-graphite p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <span className="font-display text-[10px] font-bold tracking-[0.18em] text-white/40 uppercase">
              Scripted transcript
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-white/40">
              <Mic size={12} /> {lang.id === "ar" ? "عربي" : lang.id === "fr" ? "FR" : "EN"}
            </span>
          </div>

          <div className="mt-4 space-y-3" dir={lang.direction}>
            <TranscriptLine
              role="Caller"
              text={lang.caller}
              show={revealed >= 1}
              rtl={lang.direction === "rtl"}
            />
            <TranscriptLine
              role="Agent"
              text={lang.agent}
              show={revealed >= 2}
              rtl={lang.direction === "rtl"}
            />
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-white/8 pt-4 text-left">
            {[
              ["Barge-in", "Configurable"],
              ["Emotion tag", "Example"],
              ["Action", "Sample step"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-display text-[9px] tracking-[0.14em] text-white/35 uppercase">{k}</dt>
                <dd className="mt-1 text-sm font-medium text-white/70">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-[11px] leading-relaxed text-white/35">
            Dialogue lines are illustrative scripts used to show the interface. They are not recorded
            calls, and transcription or match quality is not asserted here.
          </p>
        </div>
      </div>
    </div>
  );
}

function TranscriptLine({
  role,
  text,
  show,
  rtl,
}: {
  role: "Caller" | "Agent";
  text: string;
  show: boolean;
  rtl: boolean;
}) {
  return (
    <div
      className={cn(
        "transition-all duration-500 ease-smooth",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      )}
    >
      <div
        className={cn(
          "mb-1.5 flex items-center gap-2 font-display text-[9px] font-bold tracking-[0.18em] text-white/45 uppercase",
          rtl && "flex-row-reverse"
        )}
      >
        <span
          className={cn("h-1.5 w-1.5 rounded-full", role === "Agent" ? "bg-white" : "bg-white/35")}
        />
        {role}
      </div>
      <p
        className={cn(
          "rounded-2xl border border-white/10 px-4 py-3 text-[15px] leading-relaxed",
          role === "Agent" ? "bg-white text-black" : "bg-white/5 text-white/85",
          rtl && "font-arabic text-right"
        )}
      >
        {text}
      </p>
    </div>
  );
}
