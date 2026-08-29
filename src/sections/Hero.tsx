import { ArrowDown, ArrowUpRight } from "lucide-react";
import { AgentConsole } from "@/components/AgentConsole";
import { Button } from "@/components/ui/Button";
import { Counter } from "@/components/ui/Counter";
import { Reveal } from "@/components/ui/Reveal";
import { hero } from "@/content/site";
import { useUI } from "@/context/UIProvider";
import { scrollToId } from "@/utils/scroll";

export function Hero() {
  const { openDemo } = useUI();

  return (
    <section
      id="hero"
      aria-label="Introduction"
      className="hero-gradient grain relative overflow-hidden pt-32 pb-14 sm:pb-16 lg:pt-40 lg:pb-20"
    >
      {/* ambient geometry */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[6%] left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-white/70 blur-[90px] sm:h-[620px] sm:w-[1200px]" />
        <svg
          className="absolute inset-x-0 bottom-0 h-[220px] w-full text-black/[0.07]"
          viewBox="0 0 1200 220"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M0 160 Q 60 60 120 160 T 240 160 T 360 160 T 480 160 T 600 160 T 720 160 T 840 160 T 960 160 T 1080 160 T 1200 160"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M0 190 Q 60 130 120 190 T 240 190 T 360 190 T 480 190 T 600 190 T 720 190 T 840 190 T 960 190 T 1080 190 T 1200 190"
            stroke="currentColor"
            strokeWidth="1.2"
            opacity="0.6"
          />
        </svg>
        <div className="absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-black/[0.06] to-transparent lg:block" />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-5 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-7 text-center sm:space-y-8">
          <Reveal>
            <span className="inline-flex items-center gap-2.5 rounded-full border border-hair bg-white/70 px-4 py-1.5 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse-dot" />
              <span className="eyebrow text-black/55">{hero.eyebrow}</span>
            </span>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="text-huge font-medium">
              {hero.titleLead}
              <br />
              <span className="inline-flex flex-wrap items-baseline justify-center gap-x-4">
                Enterprise
                <em className="font-serif text-[0.82em] font-light lowercase italic tracking-tight text-black/80">
                  voice.
                </em>
              </span>
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-black/55 sm:text-2xl">
              {hero.body}
            </p>
          </Reveal>

          <Reveal delay={200}>
            <dl className="flex flex-wrap justify-center gap-x-10 gap-y-7 py-8 sm:gap-x-14">
              {hero.metrics.map((metric) => (
                <div key={metric.label} className="text-center">
                  <div className="numeral text-3xl font-bold sm:text-4xl">
                    <Counter
                      value={metric.value}
                      prefix={metric.prefix}
                      suffix={metric.suffix}
                    />
                  </div>
                  <div className="eyebrow mt-2 text-black/45">{metric.label}</div>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-black/35">{hero.metricsNote}</p>
          </Reveal>

          <Reveal delay={260}>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => openDemo("hero")}
                iconRight={<ArrowUpRight size={17} />}
              >
                Book a Demo
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full bg-white/60 backdrop-blur-sm sm:w-auto"
                onClick={() => scrollToId("platform")}
              >
                Explore Platform
              </Button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={120} className="mx-auto mt-12 max-w-5xl lg:mt-16">
          <AgentConsole />
        </Reveal>

        <div className="mt-10 flex items-center justify-center gap-3 text-black/35">
          <ArrowDown size={13} className="animate-breathe" />
          <span className="eyebrow text-[9px]">Scroll</span>
        </div>
      </div>
    </section>
  );
}
