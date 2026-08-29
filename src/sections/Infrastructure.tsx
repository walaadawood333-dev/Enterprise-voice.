import { useState } from "react";
import { Check, Cpu, Database, Lock, Network, Radio, Server } from "lucide-react";
import { infraStats, infraStatsNote, stack } from "@/content/site";
import { Disclosure, PlaceholderTag } from "@/components/ui/Placeholder";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/utils/cn";

const NETWORK_IMG =
  "https://images.pexels.com/photos/2881229/pexels-photo-2881229.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200";
const SIM_IMG =
  "https://images.pexels.com/photos/33277478/pexels-photo-33277478.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200";

const controls = [
  { icon: Network, title: "Direct Connectivity", body: "Circuits into the public switched network." },
  { icon: Radio, title: "Real Number Routing", body: "Provisioned national numbers, presented per market." },
  { icon: Lock, title: "Enterprise-grade Architecture", body: "Tenant isolation, private links, audited access." },
];

export function Infrastructure() {
  const [step, setStep] = useState(2);

  return (
    <section
      id="infrastructure"
      aria-label="Infrastructure and control"
      className="bg-white py-24 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-[1200px] space-y-16 px-5 sm:px-6 sm:space-y-24 lg:space-y-28">
        <Reveal className="max-w-3xl">
          <span className="eyebrow text-black/40">Infrastructure</span>
          <h2 className="text-section mt-4 font-medium">
            Your calls. Your infrastructure.
            <br />
            Your control.
          </h2>
        </Reveal>

        {/* Row 1 */}
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <h3 className="text-4xl leading-tight font-medium sm:text-5xl">
              No external call providers
            </h3>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-black/55">
              Own the stack. Direct PSTN termination is the design goal: fewer third-party voice providers
              in the path, and control over routing, quality and cost sitting with you rather than a
              reseller.
            </p>
            <ul className="mt-8 space-y-3">
              {controls.map((c) => (
                <li
                  key={c.title}
                  className="group flex items-start gap-4 rounded-2xl border border-transparent px-3 py-3 transition-all duration-500 hover:border-hair hover:bg-mist"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-white transition-transform duration-500 group-hover:scale-105">
                    <c.icon size={14} />
                  </span>
                  <span>
                    <span className="flex items-center gap-2 text-base font-bold">
                      {c.title}
                      <Check size={13} className="text-black/35" />
                    </span>
                    <span className="mt-0.5 block text-sm text-black/50">{c.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120}>
            <figure className="group relative aspect-video overflow-hidden rounded-3xl bg-mist">
              <img
                src={NETWORK_IMG}
                alt="Network cabling patched into a rack inside a telecoms data hall"
                loading="lazy"
                decoding="async"
                width={1200}
                height={627}
                onError={(e) => {
                  e.currentTarget.style.opacity = "0";
                }}
                className="h-full w-full object-cover grayscale transition-transform duration-[1100ms] ease-smooth group-hover:scale-[1.04]"
              />
              <figcaption className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-2xl bg-white/88 px-4 py-3 backdrop-blur-md">
                <span className="font-display text-[10px] font-bold tracking-[0.18em] text-black/55 uppercase">
                  Edge PoP concept · Amman
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-black/45">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Diagram, not a live circuit
                </span>
              </figcaption>
            </figure>
          </Reveal>
        </div>

        {/* Row 2 */}
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal className="order-2 lg:order-1">
            <figure className="group relative aspect-video overflow-hidden rounded-3xl bg-mist">
              <img
                src={SIM_IMG}
                alt="SIM cards and a tray ejector tool laid out on a clean white surface"
                loading="lazy"
                decoding="async"
                width={1200}
                height={627}
                onError={(e) => {
                  e.currentTarget.style.opacity = "0";
                }}
                className="h-full w-full object-cover grayscale transition-transform duration-[1100ms] ease-smooth group-hover:scale-[1.04]"
              />
              <figcaption className="absolute inset-x-4 bottom-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-white/88 px-4 py-3 backdrop-blur-md">
                <span className="font-display text-[10px] font-bold tracking-[0.18em] text-black/55 uppercase">
                  SIM pool concept
                </span>
                <span className="text-[11px] text-black/45">Rotating outbound identity</span>
              </figcaption>
            </figure>
          </Reveal>

          <Reveal delay={120} className="order-1 lg:order-2">
            <span className="eyebrow text-black/40">Reliability engineering</span>
            <h3 className="mt-4 text-4xl leading-tight font-medium sm:text-5xl">
              Real SIM card routing
            </h3>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-black/55">
              Redundancy and failover are designed in for high-volume operation: physical number
              provisioning with independent routes, so outbound campaigns present a recognizable local line
              and inbound calls do not traverse a reseller. Availability behaviour is measured on your
              deployment, not asserted here.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-7">
              {infraStats.map((stat) => (
                <div key={stat.label} className="border-l-2 border-ink pl-4">
                  <div className="numeral text-2xl leading-tight font-bold sm:text-[1.65rem]">
                    {stat.value}
                  </div>
                  <div className="font-display mt-1.5 text-[10px] tracking-[0.16em] text-black/45 uppercase">
                    {stat.label}
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-black/40">{stat.note}</p>
                </div>
              ))}
            </div>
            <Disclosure className="mt-7">{infraStatsNote}</Disclosure>
          </Reveal>
        </div>

        {/* Row 3 — stack diagram */}
        <Reveal>
          <div className="grain relative overflow-hidden rounded-3xl bg-graphite p-6 text-white sm:p-10">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div className="max-w-lg">
                <span className="eyebrow text-white/35">Reference architecture</span>
                <h3 className="mt-3 text-2xl leading-tight font-medium sm:text-[2rem]">
                  Every hop, inside your control plane
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PlaceholderTag tone="dark" label="Reference topology" />
                <span className="font-display text-[10px] tracking-[0.16em] text-white/35 uppercase">
                  Select a hop
                </span>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-5">
              {stack.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-pressed={i === step}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden rounded-2xl border p-4 text-left transition-all duration-500",
                    i === step
                      ? "border-white/70 bg-white text-black"
                      : "border-white/12 bg-white/[0.04] hover:border-white/35"
                  )}
                >
                  <span
                    className={cn(
                      "numeral block text-[10px] font-bold tracking-[0.18em] uppercase",
                      i === step ? "text-black/45" : "text-white/35"
                    )}
                  >
                    Hop {i + 1}
                  </span>
                  <span className="mt-2 block font-display text-lg leading-tight font-bold">
                    {s.label}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-xs",
                      i === step ? "text-black/55" : "text-white/40"
                    )}
                  >
                    {s.sub}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-0 left-0 h-[3px] bg-current transition-all duration-700 ease-smooth",
                      i === step ? "w-full opacity-100" : "w-0 opacity-0"
                    )}
                  />
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-4 border-t border-white/10 pt-6 text-sm text-white/55 sm:grid-cols-3">
              {[
                {
                  icon: Server,
                  text: "Design intent: media and reasoning run in the same region as the call.",
                },
                {
                  icon: Database,
                  text: "Transcripts can land in your store — object storage or on-prem, agreed per tenant.",
                },
                {
                  icon: Cpu,
                  text: "Model tier is configurable per agent: hosted, private, or a mix of both.",
                },
              ].map((f) => (
                <p key={f.text} className="flex items-start gap-3">
                  <f.icon size={15} className="mt-0.5 shrink-0 text-white/40" />
                  {f.text}
                </p>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
