import { useState } from "react";
import { Clock3, Gauge, Layers, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Disclosure, PlaceholderTag } from "@/components/ui/Placeholder";
import { Reveal } from "@/components/ui/Reveal";
import { modelRows, valueProps } from "@/content/site";
import { useUI } from "@/context/UIProvider";

const icons = {
  clock: Clock3,
  trending: TrendingUp,
  gauge: Gauge,
  layers: Layers,
};

export function BusinessValue() {
  const { openDemo } = useUI();
  /** Visitor-entered assumptions. Nothing is pre-filled with a CenterAI number. */
  const [assumptions, setAssumptions] = useState<Record<string, number>>({
    automation: 0,
    response: 0,
  });

  const touched = Object.values(assumptions).some((v) => v > 0);

  return (
    <section
      id="value"
      aria-label="Business value"
      className="relative border-y border-hair bg-white py-24 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <Reveal>
              <span className="eyebrow text-black/40">Business impact</span>
              <h2 className="text-section mt-4 mb-10 font-medium sm:mb-12">
                What CenterAI
                <br />
                changes
              </h2>
            </Reveal>

            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 sm:gap-x-10">
              {valueProps.map((item, i) => {
                const Icon = icons[item.icon];
                return (
                  <Reveal key={item.title} delay={80 + i * 70}>
                    <div className="group -mx-3 rounded-2xl px-3 py-3 transition-colors duration-500 hover:bg-mist">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Icon
                          size={16}
                          className="text-black/35 transition-all duration-500 group-hover:scale-110 group-hover:text-black"
                        />
                        <span className="font-display text-base font-bold tracking-tight">
                          {item.stat}
                        </span>
                        <span className="font-display text-[9px] tracking-[0.16em] text-black/30 uppercase">
                          {item.statLabel}
                        </span>
                      </div>
                      <h3 className="mt-3 text-xl leading-tight font-bold sm:text-2xl">{item.title}</h3>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-black/50">{item.body}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>

            <Reveal delay={200}>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Button variant="outline" onClick={() => openDemo("business value")} size="md">
                  Model this with your own figures
                </Button>
                <Disclosure className="max-w-[16rem]">
                  Positioning language only. No efficiency percentage, benchmark or saving is claimed
                  anywhere on this site.
                </Disclosure>
              </div>
            </Reveal>
          </div>

          <Reveal delay={140}>
            <div className="relative flex items-center justify-center overflow-hidden rounded-3xl bg-mist p-6 sm:p-8 lg:p-12">
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(to_right,rgba(0,0,0,0.04)_1px,transparent_1px)] [background-size:44px_100%]"
              />
              <div className="relative w-full space-y-6 rounded-2xl border border-black/5 bg-white p-6 shadow-[0_40px_90px_-50px_rgba(0,0,0,0.45)] sm:p-8">
                <div className="flex items-start justify-between gap-4 border-b border-hair pb-5">
                  <div className="flex items-center gap-3.5">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-white">
                      <TrendingUp size={17} />
                    </span>
                    <div>
                      <div className="font-display text-base font-bold">Impact worksheet</div>
                      <div className="text-xs text-black/45">Your assumptions — not a CenterAI result</div>
                    </div>
                  </div>
                  <PlaceholderTag label="No data pre-filled" />
                </div>

                <div className="space-y-6">
                  {modelRows.map((row) => {
                    const isSlider = row.kind === "slider";
                    const value = isSlider ? assumptions[row.id] : 0;
                    return (
                      <div key={row.id} className="space-y-2.5">
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-xs leading-snug font-medium text-black/55">
                            {row.label}
                          </span>
                          <span className="numeral shrink-0 text-lg leading-none font-bold">
                            {row.kind === "fixed" ? row.value : value > 0 ? `${value}%` : "—"}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-mist">
                          <div
                            className="h-full rounded-full bg-ink transition-[width] duration-500 ease-smooth"
                            style={{ width: `${row.kind === "fixed" ? 100 : value}%` }}
                          />
                        </div>
                        {isSlider ? (
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={value}
                            aria-label={`${row.label} — your assumption`}
                            onChange={(e) =>
                              setAssumptions((prev) => ({
                                ...prev,
                                [row.id]: Number(e.target.value),
                              }))
                            }
                            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-black/10 text-black accent-black outline-offset-4"
                          />
                        ) : (
                          <p className="text-[11px] text-black/35">
                            Always-on is a property of software agents, not an outcome metric.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3 border-t border-hair pt-5">
                  {touched ? (
                    <p className="text-sm leading-relaxed text-black/55">
                      Those numbers are yours. CenterAI does not supply an expected return here — the
                      worksheet exists so an evaluation starts from assumptions both sides can test.
                    </p>
                  ) : (
                    <p className="text-sm leading-relaxed text-black/50 italic">
                      “We publish no customer outcome numbers without a signed reference. Nothing is
                      entered on your behalf.”
                    </p>
                  )}
                  <p className="font-display text-[10px] tracking-[0.14em] text-black/35 uppercase">
                    CenterAI · note on evidence
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
