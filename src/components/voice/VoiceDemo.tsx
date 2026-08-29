import { useEffect, useRef } from "react";
import { CircleDashed, Mic, PhoneOff, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { VoiceBars } from "@/components/ui/VoiceBars";
import { WaveformMeter } from "./WaveformMeter";
import { useVoiceDemo } from "@/hooks/useVoiceDemo";
import { chromeFor } from "@/content/voiceDemo";
import type { VoiceState } from "@/lib/voiceProvider";
import { cn } from "@/utils/cn";

type Props = {
  className?: string;
  initialLanguage?: "en" | "ar" | "jo";
  onStateChange?: (state: VoiceState) => void;
};

const dotTone: Record<VoiceState, string> = {
  ready: "bg-white/45",
  listening: "bg-green-400",
  thinking: "bg-amber-300",
  speaking: "bg-white",
  completed: "bg-green-400",
  stopped: "bg-white/35",
  error: "bg-red-400",
};

/**
 * Reusable voice console. Which engine answers is decided by the provider negotiation
 * (DemoVoiceProvider by default; a live realtime session when the server authorizes one),
 * so this component never imports provider-specific code.
 * No telephony, no call recording, no CRM — see server/README.md for scope.
 */
export function VoiceDemo({ className, initialLanguage = "en", onStateChange }: Props) {
  const demo = useVoiceDemo(initialLanguage);
  const logRef = useRef<HTMLDivElement | null>(null);
  const t = chromeFor(demo.languageId);
  const rtl = demo.language.dir === "rtl";
  const lastLine = demo.lines[demo.lines.length - 1];

  useEffect(() => onStateChange?.(demo.state), [demo.state, onStateChange]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [demo.lines.length]);

  const running = demo.busy;

  return (
    <div
      dir={demo.language.dir}
      lang={rtl ? "ar" : "en"}
      className={cn(
        "grain relative overflow-hidden rounded-3xl border border-white/10 bg-graphite text-white",
        rtl && "font-arabic",
        className
      )}
    >
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors duration-500",
              demo.state === "speaking"
                ? "bg-white text-black"
                : demo.state === "listening"
                  ? "bg-white/15 text-white"
                  : "bg-white/8 text-white/70"
            )}
          >
            <Mic size={15} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-bold tracking-tight">
              {t.agent}
            </span>
            <span className="block truncate text-[11px] text-white/40">{demo.title}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 font-display text-[9px] font-bold tracking-[0.16em] uppercase",
              demo.live
                ? "border-white/40 bg-white/12 text-white"
                : "border-white/15 text-white/50"
            )}
          >
            {demo.live ? t.liveTag : t.demoTag}
          </span>
          <span
            className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-[11px] text-white/70"
            role="status"
            aria-live="polite"
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", dotTone[demo.state], running && "animate-pulse-dot")} />
            {t.states[demo.state]}
          </span>
        </div>
      </div>

      <div className="grid gap-px bg-white/10 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,1fr)]">
        {/* left: status, waveform, controls */}
        <div className="bg-graphite p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-display text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">
                {t.status}
              </p>
              <p
                key={demo.state}
                className="mt-2 text-2xl leading-tight font-medium sm:text-[1.7rem]"
                style={{ animation: "popIn .4s var(--ease-smooth) both" }}
              >
                {demo.state === "ready" ? t.readyToStart : t.states[demo.state]}
              </p>
            </div>
            <div className="text-end">
              <p className="font-display text-[9px] tracking-[0.18em] text-white/35 uppercase">
                {t.turn}
              </p>
              <p className="numeral text-xl font-bold leading-none">
                {demo.turnCount}
                <span className="text-white/35">/{demo.total}</span>
              </p>
            </div>
          </div>

          {/* state rail */}
          <ol className="mt-5 flex flex-wrap gap-1.5" aria-label={t.steps.join(" → ")}>
            {t.steps.map((label, i) => {
              const active = demo.step === i;
              const done = demo.step > i;
              return (
                <li
                  key={label}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] transition-all duration-500 ease-smooth",
                    active
                      ? "border-white bg-white text-black"
                      : done
                        ? "border-white/30 text-white/70"
                        : "border-white/12 text-white/35"
                  )}
                >
                  <span className="numeral text-[9px] font-bold">{done ? "✓" : i + 1}</span>
                  <span className="font-display font-semibold tracking-wide">{label}</span>
                </li>
              );
            })}
          </ol>

          {/* visualization */}
          <figure className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-3">
            <div className="relative h-24 sm:h-28">
              <WaveformMeter
                state={demo.state}
                bars={44}
                mirrored={rtl}
                levelSource={demo.live ? demo.getLevel : undefined}
                className="text-white"
              />
              {demo.state === "thinking" ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  style={{ animation: "sweep 1.15s linear infinite" }}
                />
              ) : null}
            </div>
            <figcaption className="mt-2.5 flex items-center justify-between gap-3 text-[10px] text-white/35">
              <span className="font-display tracking-[0.16em] uppercase">
                {t.waveform} · {t.signal}
              </span>
              <span className="flex items-center gap-1.5">
                <VoiceBars
                  count={7}
                  intensity={running ? 0.85 : 0.12}
                  className="h-3 w-14 text-white/60"
                />
                <span className="numeral">{demo.elapsed.toFixed(1)}s</span>
              </span>
            </figcaption>
          </figure>

          {/* language selector */}
          <fieldset className="mt-5" aria-describedby="voice-lang-note">
            <legend className="font-display text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">
              {t.language}
            </legend>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {demo.languages.map((l) => (
                <label key={l.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name="voice-demo-language"
                    value={l.id}
                    checked={demo.languageId === l.id}
                    onChange={() => demo.changeLanguage(l.id)}
                    className="peer sr-only"
                    aria-label={l.label}
                  />
                  <span
                    dir={l.dir}
                    className={cn(
                      "block rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all duration-300",
                      "peer-focus-visible:ring-2 peer-focus-visible:ring-white peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-graphite",
                      demo.languageId === l.id
                        ? "border-white bg-white text-black"
                        : "border-white/15 text-white/60 hover:border-white/40 hover:text-white"
                    )}
                  >
                    <span className={cn(l.dir === "rtl" && "font-arabic")}>{l.native}</span>
                  </span>
                </label>
              ))}
            </div>
            <p id="voice-lang-note" className="mt-2 text-[11px] text-white/35">
              {demo.language.note} · {demo.language.route} · {demo.language.voice}
            </p>
          </fieldset>

          {demo.notice || demo.state === "error" ? (
            <div
              role="alert"
              className="mt-5 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3"
            >
              <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-white/75">
                {demo.notice?.message ?? t.errorNote}
              </p>
              <Button variant="onDark" size="sm" onClick={demo.start}>
                <RotateCcw size={13} />
                {t.micCta}
              </Button>
            </div>
          ) : null}

          {/* controls */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {demo.state === "completed" || demo.state === "error" ? (
              <Button variant="onDark" size="md" onClick={demo.start}>
                <RotateCcw size={15} />
                {demo.state === "error" ? t.micCta : t.tryAgain}
              </Button>
            ) : (
              <Button variant="onDark" size="md" onClick={demo.start} disabled={running}>
                <Play size={15} />
                {t.start}
              </Button>
            )}

            <Button
              variant="outlineDark"
              size="md"
              onClick={demo.stop}
              disabled={!running}
              className="disabled:opacity-35"
            >
              <PhoneOff size={15} />
              {t.stop}
            </Button>

            <Button
              variant="ghost"
              size="md"
              onClick={demo.reset}
              className="text-white/55 hover:bg-white/8 hover:text-white disabled:opacity-30"
              disabled={demo.lines.length === 0 && demo.state === "ready"}
            >
              <CircleDashed size={15} />
              {t.reset}
            </Button>
          </div>

          <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-white/35">
            {demo.live ? t.liveNote : t.simulationNote}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-white/30">{t.consent}</p>
        </div>

        {/* right: transcript */}
        <div className="flex min-h-[320px] flex-col bg-graphite p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">
              {t.transcript}
            </p>
            <span className="numeral text-[10px] text-white/30">
              {lastLine ? `+${lastLine.at.toFixed(1)}s` : "0.0s"}
            </span>
          </div>

          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-atomic="false"
            aria-label={t.transcript}
            className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pe-1"
          >
            {demo.lines.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-[13px] leading-relaxed text-white/35">
                {t.emptyTranscript}
              </p>
            ) : null}

            {demo.lines.map((line, i) => {
              const isAgent = line.role === "agent";
              const isLast = i === demo.lines.length - 1;
              return (
                <div
                  key={line.id}
                  className={cn("flex", isAgent ? "justify-start" : "justify-end")}
                  style={isLast ? { animation: "popIn .45s var(--ease-smooth) both" } : undefined}
                >
                  <div
                    className={cn(
                      "max-w-[94%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed sm:max-w-[86%]",
                      isAgent ? "bg-white text-black" : "border border-white/12 bg-white/5 text-white/80"
                    )}
                  >
                    <span className="mb-1.5 flex items-center gap-1.5 font-display text-[9px] font-bold tracking-[0.18em] uppercase opacity-55">
                      <span className={cn("h-1.5 w-1.5 rounded-full", isAgent ? "bg-black" : "bg-white/40")} />
                      {isAgent ? "CenterAI" : rtl ? "المتصل" : "Caller"}
                    </span>
                    <p dir="auto">{line.text}</p>
                  </div>
                </div>
              );
            })}

            {running ? (
              <div className={cn("flex", demo.state === "listening" ? "justify-end" : "justify-start")}>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-white/45">
                  <VoiceBars
                    count={6}
                    intensity={demo.state === "thinking" ? 0.3 : 0.8}
                    className="h-3 w-10 text-white/70"
                  />
                  {t.states[demo.state]}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 text-[11px]">
            {[
              ["Provider", demo.providerInfo.label],
              ["Microphone", demo.providerInfo.microphone ? "Active" : "Not used"],
              ["Audio playback", demo.providerInfo.realtimeAudio ? "Streaming" : "None"],
              ["Telephony", demo.providerInfo.telephony ? "Connected" : "Not connected"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span className="font-display tracking-[0.12em] text-white/30 uppercase">{k}</span>
                <span className="truncate font-medium text-white/60">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
