import { useCallback, useState } from "react";
import { ArrowUpRight, Gauge, PlayCircle, Radio, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Placeholder";
import { Reveal } from "@/components/ui/Reveal";
import { VoiceDemo } from "@/components/voice/VoiceDemo";
import { useUI } from "@/context/UIProvider";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { scrollToId } from "@/utils/scroll";
import type { VoiceState } from "@/lib/voiceProvider";
import { cn } from "@/utils/cn";

const PIPELINE = [
  { key: "in", label: "Caller speaks", sub: "Audio in · VAD" },
  { key: "asr", label: "Speech recognition", sub: "Arabic & English" },
  { key: "intent", label: "Intent & policy", sub: "Your rules, your data" },
  { key: "act", label: "Answer & action", sub: "Tools + handover" },
  { key: "tts", label: "Voice synthesis", sub: "Expressive output" },
];

const STAGE_AT: Record<VoiceState, number> = {
  ready: -1,
  stopped: -1,
  error: -1,
  listening: 1,
  thinking: 2,
  speaking: 4,
  completed: 5,
};

const STATE_COPY: Record<VoiceState, string> = {
  error: "The live session could not be held. The console has stayed usable in demo form.",
  ready: "Idle — press Start Demo to open a voice session.",
  listening: "Capturing the caller turn (simulated audio, no microphone).",
  thinking: "Resolving intent against the configured policy.",
  speaking: "Streaming the agent reply (visual only, no audio).",
  completed: "Both turns delivered. Reset or replay in another language.",
  stopped: "Stopped mid-demo — the transcript stays until you reset or replay.",
};

export function VoiceDemoSection() {
  const { openDemo } = useUI();
  const backend = useBackendStatus();
  const [state, setState] = useState<VoiceState>("ready");

  const backendLabel =
    backend.state === "connected"
      ? "Connected"
      : backend.state === "local"
        ? "Local handlers"
        : backend.state === "probing"
          ? "Detecting…"
          : "Unavailable → demo";
  const handleState = useCallback((next: VoiceState) => setState(next), []);
  const stage = STAGE_AT[state];

  return (
    <section
      id="voice-demo"
      aria-label="Interactive voice demo"
      className="grain relative overflow-hidden bg-mist py-24 sm:py-28 lg:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px] opacity-70 [background:radial-gradient(60%_100%_at_50%_0%,rgba(255,255,255,0.9),transparent_70%)]"
      />

      <div className="relative mx-auto max-w-[1200px] px-5 sm:px-6">
        <Reveal className="mb-12 flex flex-col gap-6 md:mb-16 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="eyebrow text-black/40">Interactive voice experience</span>
            <h2 className="text-section mt-4 mb-5 font-medium">Talk to CenterAI.</h2>
            <p className="text-lg leading-relaxed text-black/50 sm:text-xl">
              Experience an AI voice agent designed for real enterprise conversations.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-black/50 md:self-auto">
            <ShieldQuestion size={13} className="text-black/40" />
            Scripted frontend demo · no phone line, no microphone
          </div>
        </Reveal>

        <div className="grid items-stretch gap-5 lg:grid-cols-12 lg:gap-6">
          <Reveal className="lg:col-span-8">
            <VoiceDemo onStateChange={handleState} />
          </Reveal>

          <div className="grid gap-5 lg:col-span-4">
            <Reveal delay={80}>
              <div className="flex h-full flex-col justify-between rounded-3xl border border-black/8 bg-white p-6">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Gauge size={15} className="text-black" />
                    <span className="font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
                      Agent status
                    </span>
                  </div>
                  <p
                    key={state}
                    className="mt-4 text-[1.7rem] leading-[1.05] font-medium"
                    style={{ animation: "popIn .4s var(--ease-smooth) both" }}
                  >
                    {STATE_COPY[state]}
                  </p>
                </div>

                <dl className="mt-7 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-hair pt-5 text-start">
                  {[
                    [
                      "Mode",
                      backend.realtime
                        ? "Live voice · WebRTC"
                        : backend.mode === "production"
                          ? "Production engine"
                          : "Demo mode · no credentials",
                    ],
                    ["Backend", backendLabel],
                    ["PSTN", "Not connected"],
                    ["Audio out", "Muted by design"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="font-display text-[9px] tracking-[0.16em] text-black/35 uppercase">
                        {k}
                      </dt>
                      <dd className="mt-1 text-[13px] font-medium text-black/65">{v}</dd>
                    </div>
                  ))}
                </dl>
                <Disclosure className="mt-4">
                  One interface, two providers: the console switches to a live realtime session only when
                  the server can authorize one, and returns to the simulator on any failure.
                </Disclosure>
              </div>
            </Reveal>

            <Reveal delay={140}>
              <div className="rounded-3xl border border-black/8 bg-ink p-6 text-white">
                <div className="flex items-center gap-2.5">
                  <PlayCircle size={15} className="text-white/60" />
                  <span className="font-display text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">
                    Next step
                  </span>
                </div>
                <p className="mt-4 text-lg leading-snug font-medium">
                  Heard the shape of it? Run the same flow against your own scripts.
                </p>
                <div className="mt-5 flex flex-col gap-2.5">
                  <Button variant="onDark" size="md" onClick={() => openDemo("voice demo")}>
                    Book a demo
                  </Button>
                  <Button
                    variant="outlineDark"
                    size="md"
                    onClick={() => scrollToId("solutions")}
                    iconRight={<ArrowUpRight size={14} />}
                  >
                    See sector playbooks
                  </Button>
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        {/* pipeline strip — mirrors what the console is doing */}
        <Reveal delay={60} className="mt-5 lg:mt-6">
          <div className="rounded-3xl border border-black/8 bg-white p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Radio size={15} className="text-black" />
                <span className="font-display text-[10px] font-bold tracking-[0.2em] text-black/40 uppercase">
                  What happens when you press Start
                </span>
              </div>
              <span className="text-[11px] text-black/35">
                Stages light up with the simulated turn — the platform wiring is described in
                Infrastructure.
              </span>
            </div>

            <ol className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              {PIPELINE.map((step, i) => {
                const active = stage === i;
                const done = stage > i;
                return (
                  <li
                    key={step.key}
                    className={cn(
                      "relative overflow-hidden rounded-2xl border px-4 py-3.5 transition-all duration-500 ease-smooth",
                      active
                        ? "border-black bg-ink text-white"
                        : done
                          ? "border-black/20 bg-mist text-black/70"
                          : "border-hair bg-white text-black/45"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="numeral text-[10px] font-bold tracking-[0.16em] uppercase opacity-60">
                        0{i + 1}
                      </span>
                      {active ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" />
                      ) : done ? (
                        <span className="font-display text-[10px]">✓</span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 font-display text-[15px] leading-tight font-bold">
                      {step.label}
                    </p>
                    <p className={cn("mt-0.5 text-[11px]", active ? "text-white/60" : "opacity-70")}>
                      {step.sub}
                    </p>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute bottom-0 start-0 h-[3px] bg-current transition-all duration-700 ease-smooth",
                        active ? "w-full opacity-100" : "w-0 opacity-0"
                      )}
                    />
                  </li>
                );
              })}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
