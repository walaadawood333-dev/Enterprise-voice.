import { useMemo, useState } from "react";
import { Check, Minus, Sparkles } from "lucide-react";
import { billingModel, pricing, pricingDisclaimer } from "@/content/site";
import { Disclosure } from "@/components/ui/Placeholder";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { useUI } from "@/context/UIProvider";
import { cn } from "@/utils/cn";

const volumeSteps = [
  { label: "1k", minutes: 1_000, plan: 0 },
  { label: "10k", minutes: 10_000, plan: 0 },
  { label: "50k", minutes: 50_000, plan: 1 },
  { label: "250k", minutes: 250_000, plan: 1 },
  { label: "1M", minutes: 1_000_000, plan: 2 },
  { label: "5M+", minutes: 5_000_000, plan: 2 },
];

const included = [
  "Arabic-first speech recognition",
  "Recording consent & calling-hour rules",
  "Human handover with warm context",
  "Transcript and outcome export",
  "Per-agent policy guardrails",
];

export function Pricing() {
  const { openDemo } = useUI();
  const [index, setIndex] = useState(2);

  const volume = volumeSteps[index];
  const recommendation = useMemo(() => volume.plan, [volume]);

  return (
    <section id="pricing" aria-label="Pricing plans" className="border-t border-hair bg-white py-20 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6">
        <Reveal className="mb-12 text-center sm:mb-16">
          <span className="eyebrow text-black/40">Pricing</span>
          <h2 className="text-section mx-auto mt-4 mb-5 font-medium">Enterprise Voice AI</h2>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-black/50">
            Three levels of engagement for any scale. Everything is usage-based or quoted per scope — no
            self-serve price list until commercial terms are final.
          </p>
        </Reveal>

        {/* Volume sizing tool */}
        <Reveal className="mx-auto mb-12 max-w-3xl">
          <div className="rounded-3xl border border-hair bg-mist p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="eyebrow text-black/45">Size your engagement</span>
                <p className="mt-2 text-[15px] text-black/55">
                  Move to your expected monthly agent-handled minutes.
                </p>
              </div>
              <div className="text-right">
                <div className="numeral text-2xl leading-none font-bold">
                  {volume.minutes.toLocaleString("en-US")}
                </div>
                <div className="font-display text-[10px] tracking-[0.16em] text-black/45 uppercase">
                  minutes / month
                </div>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={volumeSteps.length - 1}
              step={1}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              aria-label="Expected monthly agent minutes"
              aria-valuetext={`${volume.minutes.toLocaleString("en-US")} minutes per month`}
              className="mt-5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-black/10 accent-black outline-offset-4"
            />
            <div className="mt-3 flex justify-between">
              {volumeSteps.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    "cursor-pointer font-display text-[10px] tracking-[0.12em] uppercase transition-colors duration-300",
                    i === index ? "text-black" : "text-black/30 hover:text-black/60"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 border-t border-black/8 pt-4 text-sm">
              <Sparkles size={14} className="text-black/45" />
              Suggested plan:{" "}
              <span className="font-display font-bold">
                {pricing[recommendation].name}
              </span>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(`plan-${pricing[recommendation].name}`);
                    if (!el) return;
                    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
                    el.focus?.();
                  }}
                  aria-label={`Jump to the ${pricing[recommendation].name} plan`}
                  className="ml-auto cursor-pointer text-xs font-semibold text-black/45 underline decoration-black/20 underline-offset-4 hover:text-black"
                >
                  Jump to plan
                </button>
            </p>
          </div>
        </Reveal>

        <div className="grid items-stretch gap-6 md:grid-cols-3 lg:gap-8">
          {pricing.map((plan, i) => {
            const suggested = i === recommendation;
            return (
              <Reveal key={plan.name} delay={i * 90} className="h-full">
                <article
                  id={`plan-${plan.name}`}
                  tabIndex={-1}
                  aria-label={`${plan.name} plan`}
                  className={cn(
                    "relative flex h-full flex-col justify-between overflow-hidden rounded-3xl p-7 transition-all duration-500 focus:outline-none sm:p-10",
                    plan.recommended
                      ? "border-2 border-ink shadow-[0_36px_80px_-56px_rgba(0,0,0,0.6)]"
                      : "border border-hair hover:border-black/25 hover:shadow-[0_30px_70px_-58px_rgba(0,0,0,0.45)]",
                    suggested && !plan.recommended && "bg-mist"
                  )}
                >
                  {plan.recommended ? (
                    <span className="absolute top-5 right-5 rounded-full bg-ink px-3 py-1 font-display text-[9px] font-bold tracking-[0.16em] text-white uppercase">
                      Recommended
                    </span>
                  ) : null}

                  <div>
                    <h3 className="text-2xl leading-none font-bold">{plan.name}</h3>
                    <p className="mt-2 text-sm text-black/50">{plan.tagline}</p>

                    <div className="mt-6 border-y border-hair py-5">
                      <div className="numeral text-3xl leading-none font-bold">{plan.price}</div>
                      <p className="mt-2 text-xs leading-relaxed text-black/45">{plan.priceNote}</p>
                      {suggested ? (
                        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[10px] font-semibold text-white">
                          <Check size={11} /> Fits your sizing
                        </span>
                      ) : null}
                    </div>

                    <ul className="mt-6 space-y-3">
                      {plan.features.map((f) => (
                        <li
                          key={f.label}
                          className={cn(
                            "flex items-start gap-2.5 text-sm",
                            f.on ? "text-black/75" : "text-black/30"
                          )}
                        >
                          {f.on ? (
                            <Check size={14} className="mt-0.5 shrink-0" strokeWidth={2.5} />
                          ) : (
                            <Minus size={14} className="mt-0.5 shrink-0" />
                          )}
                          {f.label}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button
                    size="md"
                    variant={plan.recommended ? "ink" : "outline"}
                    className="mt-8 w-full py-3 text-base"
                    onClick={() => openDemo(`pricing · ${plan.name}`)}
                  >
                    {plan.cta}
                  </Button>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal className="mt-10">
          <div className="grid gap-6 rounded-3xl border border-hair p-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:p-8">
            <div>
              <span className="eyebrow text-black/40">Included on every plan</span>
              <ul className="mt-4 grid gap-2 text-sm text-black/60 sm:grid-cols-2">
                {included.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-black" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col justify-between gap-5 border-t border-hair pt-6 sm:border-t-0 sm:border-l sm:border-t-0 sm:pl-8">
              <div>
                <span className="eyebrow text-black/40">Commercial notes</span>
                <p className="mt-4 text-sm leading-relaxed text-black/55">{billingModel}</p>
              </div>
              <Disclosure>{pricingDisclaimer}</Disclosure>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
