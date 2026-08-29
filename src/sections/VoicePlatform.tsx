import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Clapperboard,
  Mic,
  PhoneIncoming,
  PhoneOutgoing,
  RadioTower,
  Waypoints,
} from "lucide-react";
import { dialects, voices } from "@/content/site";
import { Disclosure, PlaceholderTag } from "@/components/ui/Placeholder";
import { Reveal } from "@/components/ui/Reveal";
import { VoiceBars } from "@/components/ui/VoiceBars";
import { cn } from "@/utils/cn";

export function VoicePlatform() {
  return (
    <section
      id="platform"
      aria-label="Voice platform"
      className="grain relative overflow-hidden bg-ink py-20 text-white sm:py-28 lg:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-70 [background:radial-gradient(60%_100%_at_50%_0%,rgba(255,255,255,0.09),transparent_70%)]"
      />
      <div className="relative mx-auto max-w-[1200px] px-5 sm:px-6">
        <Reveal className="mb-12 flex flex-col gap-6 sm:mb-16 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="eyebrow text-white/35">The platform</span>
            <h2 className="text-section mt-4 mb-5 font-medium">Voice Platform</h2>
            <p className="text-lg leading-relaxed text-white/50 sm:text-xl">
              A proprietary cognitive engine that understands intent, context and emotion — then acts on
              your core systems inside a single phone turn.
            </p>
          </div>
          <div
            className="flex items-center gap-2 self-start rounded-full border border-white/12 px-4 py-2 text-xs text-white/45 md:self-auto"
            title="Architecture intent for the first deployment region. No live service status is published from this site."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80" />
            First target region: AMM · status not published
          </div>
        </Reveal>

        <div className="grid gap-5 md:grid-cols-12 lg:gap-6">
          <LatencyCard />
          <VoicesCard />
          <LanguagesCard />
          <CloningCard />
          <DirectionCard />
          <CampaignsCard />
          <PstnCard />
        </div>
      </div>
    </section>
  );
}

const cardBase =
  "bento-card relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-graphite p-7 hover:border-white/25 sm:p-9 lg:p-10";

/* ── 1. Latency ───────────────────────────────────────────── */
function LatencyCard() {
  return (
    <Reveal className="md:col-span-4" delay={0}>
      <article className={cn(cardBase, "min-h-[400px] justify-between")}>
        <div className="space-y-3">
          <span className="font-display text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">
            01 · Media engine
          </span>
          <h3 className="text-3xl leading-none font-medium sm:text-[2.1rem]">Ultra-Low Latency</h3>
          <p className="text-[15px] leading-relaxed text-white/45">
            Engineered for natural, real-time conversation — a sub-300ms response target per agent turn,
            streamed end to end.
          </p>
        </div>

        <div className="mt-8">
          <div className="numeral text-[3.4rem] leading-none font-bold tracking-tight">
            &lt;300
            <span className="text-2xl text-white/40">ms</span>
          </div>
          <div className="mt-1 font-display text-[10px] tracking-[0.18em] text-white/35 uppercase">
            design target · not a benchmark
          </div>
          <div className="mt-5 flex h-20 items-end gap-1.5">
            {[38, 52, 44, 61, 48, 70, 55, 62, 47, 58, 40, 66].map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-t-[3px] bg-white/25 transition-all duration-700 ease-smooth hover:bg-white"
                style={{ height: `${h}%`, transitionDelay: `${i * 30}ms` }}
              />
            ))}
          </div>
          <div className="mt-3 h-px w-full bg-white/15">
            <span className="block h-px w-[64%] bg-white/70" />
          </div>
          <div className="mt-2 flex justify-between font-display text-[9px] tracking-[0.14em] text-white/30 uppercase">
            <span>0ms</span>
            <span>300ms budget</span>
          </div>
          <div className="mt-5">
            <PlaceholderTag tone="dark" label="Design target" note="Latency envelope shown for layout. Verify against production telemetry before publication." />
          </div>
        </div>
      </article>
    </Reveal>
  );
}

/* ── 2. Voices ────────────────────────────────────────────── */
function VoicesCard() {
  const [selected, setSelected] = useState(0);
  const [tone, setTone] = useState(58);
  const [speed, setSpeed] = useState(46);
  const [emotion, setEmotion] = useState(70);

  const voice = voices[selected];
  const tempo = 1.25 - (speed / 100) * 0.7;

  return (
    <Reveal className="md:col-span-8" delay={60}>
      <article className={cn(cardBase, "min-h-[380px]")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-md">
            <span className="font-display text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">
              02 · Voice library
            </span>
            <h3 className="mt-3 text-3xl leading-none font-medium sm:text-[2.1rem]">
              10,000+ Expressive Voices
            </h3>
            <p className="mt-2.5 text-[15px] leading-relaxed text-white/45">
              Fine-tune tone, speed and emotion to match your brand voice — per language, per dialect.
            </p>
          </div>
          <span className="rounded-full bg-white/8 px-3.5 py-1.5 font-display text-[10px] tracking-[0.18em] text-white/55 uppercase">
            Multi-model
          </span>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-6">
          {voices.map((v, i) => (
            <button
              key={v.name}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={i === selected}
              className={cn(
                "group cursor-pointer rounded-2xl border p-3 text-left transition-all duration-400",
                i === selected
                  ? "border-white/70 bg-white text-black"
                  : "border-white/10 bg-white/5 hover:border-white/35 hover:bg-white/10"
              )}
            >
              <div className="h-7">
                <VoiceBars
                  count={7}
                  intensity={i === selected ? 0.9 : 0.35}
                  className="h-full w-full"
                  barClassName="min-w-[1.5px]"
                />
              </div>
              <div className="mt-2.5 font-display text-sm font-bold">{v.name}</div>
              <div
                className={cn(
                  "text-[10px] tracking-wide",
                  i === selected ? "text-black/55" : "text-white/40"
                )}
              >
                {v.locale}
              </div>
              <div
                className={cn(
                  "mt-1 text-[10px] leading-snug",
                  i === selected ? "text-black/45" : "text-white/30"
                )}
              >
                {v.style}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-7 grid gap-6 border-t border-white/10 pt-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:gap-8">
          <div className="space-y-4">
            <Slider label="Tone" value={tone} onChange={setTone} hint="bright" />
            <Slider label="Speed" value={speed} onChange={setSpeed} hint={`${tempo.toFixed(2)}×`} />
            <Slider label="Emotion" value={emotion} onChange={setEmotion} hint="warm" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="font-display text-[10px] tracking-[0.18em] text-white/35 uppercase">
              Rendered preview
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-white/80">
              {tone > 66 ? "Bright, forward" : tone > 33 ? "Balanced, close-mic" : "Low, measured"}{" "}
              {emotion > 60 ? "and warm" : emotion > 30 ? "and neutral" : "and procedural"} delivery for{" "}
              <span className="font-semibold text-white">{voice.name}</span> · {voice.locale} ·{" "}
              {voice.pitch} pitch · {(0.75 + (speed / 100) * 0.7).toFixed(2)} wpm ratio.
            </p>
            <p className="mt-3 text-[11px] text-white/35">
              Preview parameters are configuration state — audio synthesis runs inside your deployment.
            </p>
          </div>
        </div>
      </article>
    </Reveal>
  );
}

function Slider({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint: string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="font-display text-[10px] font-bold tracking-[0.18em] text-white/45 uppercase">
          {label}
        </span>
        <span className="text-[11px] text-white/35">{hint}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} parameter`}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white outline-offset-4"
      />
    </label>
  );
}

/* ── 3. Languages ─────────────────────────────────────────── */
function LanguagesCard() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % dialects.length), 2600);
    return () => window.clearInterval(id);
  }, []);

  const item = dialects[index];

  return (
    <Reveal className="md:col-span-7" delay={0}>
      <article className={cn(cardBase, "min-h-[300px]")}>
        <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
          <div className="max-w-sm space-y-3">
            <span className="font-display text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">
              03 · Language coverage
            </span>
            <h3 className="text-3xl leading-none font-medium sm:text-[2.1rem]">70+ Languages</h3>
            <p className="text-[15px] leading-relaxed text-white/45">
              Arabic-first across major dialects, plus English, French and the rest of the 70+ list —
              including code-switching inside a single sentence. Dialect coverage is verified against
              your own audio during evaluation.
            </p>
            <div className="flex gap-2 pt-1">
              {dialects.map((d, i) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Preview ${d.label}`}
                  aria-pressed={i === index}
                  className={cn(
                    "h-1.5 cursor-pointer rounded-full transition-all duration-400",
                    i === index ? "w-7 bg-white" : "w-1.5 bg-white/25 hover:bg-white/60"
                  )}
                />
              ))}
            </div>
          </div>

          <div className="text-left sm:text-right" dir="auto">
            <div
              key={item.text}
              className="font-arabic text-4xl leading-tight font-bold sm:text-5xl"
              style={{ animation: "popIn .5s cubic-bezier(.22,1,.36,1) both" }}
            >
              {item.text}
            </div>
            <div className="mt-2.5 font-display text-xs tracking-[0.18em] text-white/40 uppercase">
              {item.label}
            </div>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap gap-1.5 border-t border-white/10 pt-5">
          {["AR-JO", "AR-SA", "AR-EG", "AR-AE", "AR-MA", "AR-IQ", "EN-GB", "EN-US", "FR-MA", "FR-LB", "TR", "KU", "FA", "UR", "HI"].map(
            (code) => (
              <span
                key={code}
                className="rounded-full border border-white/10 px-2.5 py-1 font-display text-[10px] tracking-wider text-white/45 transition-colors hover:border-white/35 hover:text-white"
              >
                {code}
              </span>
            )
          )}
          <span className="rounded-full border border-dashed border-white/25 px-2.5 py-1 font-display text-[10px] tracking-wider text-white/55">
            + 56 more
          </span>
        </div>
      </article>
    </Reveal>
  );
}

/* ── 4. Voice cloning ─────────────────────────────────────── */
function CloningCard() {
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);

  const enroll = () => {
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / 2400, 1);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const len = 2 * Math.PI * 42;
  const done = progress >= 1;

  return (
    <Reveal className="md:col-span-5" delay={60}>
      <article className={cn(cardBase, "min-h-[300px] items-center justify-center text-center")}>
        <span className="font-display text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">
          04 · Brand voice
        </span>

        <button
          type="button"
          onClick={enroll}
          aria-label={done ? "Voice model enrolled" : "Run a simulated voice enrolment"}
          className="group relative my-5 grid h-[104px] w-[104px] cursor-pointer place-items-center rounded-full transition-transform duration-500 hover:scale-[1.04]"
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={len}
              strokeDashoffset={len * (1 - progress)}
            />
          </svg>
          <span
            className={cn(
              "grid h-[74px] w-[74px] place-items-center rounded-full transition-colors duration-500",
              done ? "bg-white text-black" : "bg-white/8 text-white group-hover:bg-white/15"
            )}
          >
            <Mic size={22} />
          </span>
        </button>

        <h3 className="text-3xl leading-none font-medium sm:text-[2.1rem]">Voice Cloning</h3>
        <p className="mx-auto mt-2.5 max-w-xs text-[15px] leading-relaxed text-white/45">
          Create a controlled brand voice for approved use cases — consent-gated and scoped per tenant.
        </p>
        <p className="mt-4 font-display text-[10px] tracking-[0.16em] text-white/40 uppercase">
          {done
            ? "Enrolment complete · pending compliance sign-off"
            : progress > 0
              ? `Sampling reference audio · ${Math.round(progress * 100)}%`
              : "Tap to run the simulated enrolment"}
        </p>
      </article>
    </Reveal>
  );
}

/* ── 5. Inbound / Outbound ────────────────────────────────── */
function DirectionCard() {
  const [mode, setMode] = useState<"inbound" | "outbound">("inbound");
  const rows =
    mode === "inbound"
      ? [
          "Answers on first ring for automated intents",
          "Intent routing to the right human desk",
          "Balance, IBAN & statement self-service",
        ]
      : [
          "Scheduled campaign dialling",
          "Commitment capture + payment link",
          "Quiet hours & opt-out enforcement",
        ];

  return (
    <Reveal className="md:col-span-5" delay={0}>
      <article className={cn(cardBase, "min-h-[320px] justify-between")}>
        <div>
          <span className="font-display text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">
            05 · Agent types
          </span>
          <h3 className="mt-3 text-2xl leading-none font-medium">Inbound &amp; Outbound</h3>
        </div>

        <div className="mt-6 inline-flex w-full rounded-full border border-white/12 p-1">
          {(["inbound", "outbound"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold capitalize transition-all duration-400",
                mode === m ? "bg-white text-black" : "text-white/50 hover:text-white"
              )}
            >
              {m === "inbound" ? <PhoneIncoming size={13} /> : <PhoneOutgoing size={13} />}
              {m}
            </button>
          ))}
        </div>

        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li key={r} className="flex items-start gap-2.5 text-sm leading-snug text-white/60">
              <Bot size={13} className="mt-0.5 shrink-0 text-white/35" />
              {r}
            </li>
          ))}
        </ul>
      </article>
    </Reveal>
  );
}

/* ── 6. Campaigns ─────────────────────────────────────────── */
const campaignWeek = [
  { day: "Sat", minutes: 18 },
  { day: "Sun", minutes: 42 },
  { day: "Mon", minutes: 96 },
  { day: "Tue", minutes: 74 },
  { day: "Wed", minutes: 88 },
  { day: "Thu", minutes: 61 },
  { day: "Fri", minutes: 27 },
];

function CampaignsCard() {
  const [active, setActive] = useState(2);
  const peak = Math.max(...campaignWeek.map((d) => d.minutes));

  return (
    <Reveal className="md:col-span-7" delay={60}>
      <article className={cn(cardBase, "min-h-[320px] justify-between")}>
        <div>
          <span className="font-display text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">
            06 · Campaigns
          </span>
          <h3 className="mt-3 text-2xl leading-none font-medium">Automated Voice Campaigns</h3>
          <p className="mt-2.5 text-sm leading-relaxed text-white/45">
            Batch outbound runs with policy guardrails, per-segment scripts and pacing control.
          </p>
          <div className="mt-3">
            <PlaceholderTag tone="dark" label="Illustrative dataset" note="The chart below is sample data used to show the interface. It is not campaign history." />
          </div>
        </div>

        <div className="mt-6 flex h-28 items-end gap-1.5">
          {campaignWeek.map((d, i) => (
            <button
              key={d.day}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-label={`${d.day}: sample value ${d.minutes} (illustrative data, not campaign history)`}
              className="group flex h-full flex-1 cursor-pointer flex-col justify-end gap-2"
            >
              <span
                className={cn(
                  "w-full rounded-t-[4px] transition-all duration-500 ease-smooth",
                  i === active ? "bg-white" : "bg-white/20 group-hover:bg-white/45"
                )}
                style={{ height: `${(d.minutes / peak) * 100}%` }}
              />
              <span
                className={cn(
                  "font-display text-[9px] tracking-widest uppercase transition-colors",
                  i === active ? "text-white/80" : "text-white/55"
                )}
              >
                {d.day.slice(0, 2)}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-3">
          <span className="text-xs text-white/45">
            {campaignWeek[active].day} · sample value {campaignWeek[active].minutes}k
            <span className="text-white/30"> (illustrative)</span>
          </span>
          <Clapperboard size={14} className="text-white/35" />
        </div>
      </article>
    </Reveal>
  );
}

/* ── 7. PSTN ──────────────────────────────────────────────── */
function PstnCard() {
  return (
    <Reveal className="md:col-span-12" delay={0}>
      <article className={cn(cardBase, "gap-8 py-7 sm:py-8")}>
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div>
            <span className="font-display text-[10px] font-bold tracking-[0.2em] text-white/35 uppercase">
              07 · Telephony
            </span>
            <h3 className="mt-3 text-2xl leading-tight font-medium">
              Direct PSTN &amp; real SIM routing
            </h3>
            <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-white/45">
              Terminate on your own circuits. No third-party voice reseller between the caller and your
              agent.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <PlaceholderTag tone="dark" label="Capability diagram" />
              <Disclosure tone="dark" className="max-w-[18rem]">
                Route topology below is illustrative of the design, not a live network map.
              </Disclosure>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-6">
            <div className="overflow-x-auto">
            <svg viewBox="0 0 760 130" className="h-auto w-full min-w-[560px]" role="img" aria-label="Call path from caller through SIM gateway and media engine to agent and core systems">
              <defs>
                <linearGradient id="flow" x1="0" x2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                  <stop offset="50%" stopColor="#ffffff" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              <path
                d="M60 65 H700"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth="1.5"
                strokeDasharray="5 7"
              />
              <path
                d="M60 65 H700"
                stroke="url(#flow)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="80 560"
              >
                <animate attributeName="stroke-dashoffset" from="640" to="-80" dur="3.4s" repeatCount="indefinite" />
              </path>
              {[
                { x: 60, l: "Caller", s: "PSTN" },
                { x: 230, l: "SIM pool", s: "Real numbers" },
                { x: 400, l: "Media", s: "<300ms" },
                { x: 570, l: "Agent", s: "Reason" },
                { x: 700, l: "Core", s: "Your systems" },
              ].map((node) => (
                <g key={node.l}>
                  <circle cx={node.x} cy="65" r="7" fill="#1c1c1e" stroke="#fff" strokeWidth="1.6" />
                  <text
                    x={node.x}
                    y="34"
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.75)"
                    fontSize="13"
                    fontWeight="600"
                    fontFamily="Saira Condensed, sans-serif"
                  >
                    {node.l}
                  </text>
                  <text
                    x={node.x}
                    y="102"
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.35)"
                    fontSize="11"
                    fontFamily="Saira Condensed, sans-serif"
                    letterSpacing="1"
                  >
                    {node.s}
                  </text>
                </g>
              ))}
            </svg>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/40">
              <span className="inline-flex items-center gap-1.5">
                <Waypoints size={12} /> Failover between gateway pairs
              </span>
              <span className="inline-flex items-center gap-1.5">
                <RadioTower size={12} /> Number provisioning per market
              </span>
              <span className="inline-flex items-center gap-1.5 text-white/30">
                <ArrowRight size={12} /> Full detail in Infrastructure
              </span>
            </div>
          </div>
        </div>
      </article>
    </Reveal>
  );
}
