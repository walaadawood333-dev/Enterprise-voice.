import { useEffect, useState } from "react";
import { ArrowUpRight, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { VoiceBars } from "@/components/ui/VoiceBars";
import { useUI } from "@/context/UIProvider";
import { cn } from "@/utils/cn";

const rotations = [
  { ar: "جاهزون لمكالماتك.", en: "Ready for your calls." },
  { ar: "وكيل صوتي يفهم اللهجة.", en: "A voice agent that understands dialect." },
  { ar: "بنية تحتية تملكها أنت.", en: "Infrastructure you own." },
];

export function FinalCTA() {
  const { openDemo } = useUI();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % rotations.length), 3600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section
      aria-label="Start a conversation"
      className="grain relative overflow-hidden bg-ink py-24 text-white sm:py-32 lg:py-40"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-full opacity-[0.14] [background:radial-gradient(70%_55%_at_50%_100%,rgba(255,255,255,0.6),transparent_65%)]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex h-24 items-end">
        <VoiceBars count={64} intensity={0.35} className="h-16 w-full text-white/25" />
      </div>

      <div className="relative mx-auto max-w-[900px] px-5 text-center sm:px-6">
        <Reveal>
          <p className="eyebrow mb-7 text-white/35">Amman · Jordan — built for MENA</p>
          <h2 className="text-huge leading-tight font-medium [font-size:clamp(2.7rem,8.6vw,8rem)] min-[420px]:[font-size:clamp(3.6rem,10vw,8rem)]">
            Start your
            <br />
            <span className="inline-flex items-baseline gap-4">
              transformation
              <em className="font-serif text-[0.6em] font-light lowercase italic text-white/50">today.</em>
            </span>
          </h2>
          <div
            className="relative mx-auto mt-8 min-h-14 overflow-hidden sm:min-h-12"
            aria-live="polite"
          >
            {rotations.map((r, i) => (
              <p
                key={r.en}
                className={cn(
                  "transition-all duration-700 ease-smooth",
                  i === tick ? "opacity-100" : "pointer-events-none absolute inset-x-0 opacity-0 translate-y-3"
                )}
              >
                <span className="font-arabic text-lg text-white/70 sm:text-xl">{r.ar}</span>
                <span className="mx-3 text-white/20">/</span>
                <span className="text-lg text-white/50 sm:text-xl">{r.en}</span>
              </p>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/45 sm:text-2xl">
            One platform for all your enterprise voice needs — inbound, outbound, campaigns and carrier
            routing. Built for the future of communication in the region.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:mt-12 sm:flex-row sm:gap-4">
            <Button
              variant="onDark"
              size="lg"
              className="w-full px-10 py-4 text-lg sm:w-auto sm:text-xl"
              onClick={() => openDemo("final CTA")}
              iconRight={<ArrowUpRight size={16} />}
            >
              Book a Demo
            </Button>
            <a
              href="mailto:hello@centerai.jo?subject=AI%20Voice%20expert%20request"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/25 px-8 py-4 text-base font-medium transition-colors duration-300 hover:border-white/50 hover:bg-white/10 sm:w-auto sm:px-10 sm:text-xl"
            >
              <Mail size={16} className="text-white/60 transition-colors group-hover:text-white" />
              Talk to an AI Voice Expert
            </a>
          </div>
        </Reveal>

        <Reveal delay={180}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-white/40">
            <span className="inline-flex items-center gap-2">
              <MapPin size={13} /> Headquartered in Amman, Jordan
            </span>
            <span className="hidden h-3 w-px bg-white/20 sm:block" />
            <span>Demo requests are handled by the founding team in Amman — no response time is promised.</span>
            <span className="hidden h-3 w-px bg-white/20 sm:block" />
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse-dot" />
              Systems Operational
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
