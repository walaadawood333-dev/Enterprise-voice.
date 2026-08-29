import { useState } from "react";
import {
  Banknote,
  CreditCard,
  Globe2,
  Languages,
  Smartphone,
  Wallet,
  Zap,
} from "lucide-react";
import {
  arabicSample,
  integrationDisclaimer,
  integrationIntro,
  integrations,
  menaPillars,
  regions,
  regionsNote,
} from "@/content/site";
import { Reveal } from "@/components/ui/Reveal";
import { Disclosure, PlaceholderTag } from "@/components/ui/Placeholder";
import { cn } from "@/utils/cn";

const iconMap = {
  wallet: Wallet,
  mobile: Smartphone,
  bolt: Zap,
  bank: Banknote,
  users: Globe2,
  headset: CreditCard,
} as const;

type IconKey = keyof typeof iconMap;

const rails = integrations.slice(0, 4);
const systems = integrations.slice(4);

export function Integrations() {
  const [region, setRegion] = useState(0);

  return (
    <section
      id="integrations"
      className="grain relative overflow-hidden bg-mist py-24 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-[1200px] px-5 text-center sm:px-6">
        <Reveal>
          <span className="eyebrow text-black/40">Jordan · MENA</span>
          <h2 className="text-section mx-auto mt-4 mb-5 max-w-3xl font-medium">
            Built for Jordan.
            <br />
            Ready for MENA.
          </h2>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-black/50 sm:text-xl">
            {integrationIntro}
          </p>
        </Reveal>
      </div>

      {/* Payment-rail targets marquee */}
      <div className="group marquee-mask relative mt-14 flex overflow-hidden select-none lg:mt-16">
        <div className="flex w-max animate-marquee group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]">
          {[0, 1].map((copy) => (
            <div
              key={copy}
              aria-hidden={copy === 1}
              className="flex shrink-0 items-center gap-6 pr-6 sm:gap-10 sm:pr-10"
            >
              {rails.map((item) => {
                const Icon = iconMap[item.icon as IconKey] ?? Wallet;
                return (
                  <div
                    key={`${copy}-${item.name}`}
                    className="flex items-center gap-4 rounded-full border border-black/8 bg-white px-6 py-4 shadow-[0_16px_40px_-32px_rgba(0,0,0,0.5)] transition-all duration-500 hover:-translate-y-0.5 hover:border-black/25 sm:px-8 sm:py-5"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white sm:h-12 sm:w-12">
                      <Icon size={18} />
                    </span>
                    <span className="text-left">
                      <span className="block font-display text-2xl leading-none font-bold tracking-tight whitespace-nowrap sm:text-3xl">
                        {item.name}
                      </span>
                      <span className="mt-1 block text-[11px] whitespace-nowrap text-black/45">
                        {item.note}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Enterprise interop targets — reverse */}
      <div className="group marquee-mask relative mt-4 flex overflow-hidden select-none">
        <div className="flex w-max animate-marquee [animation-direction:reverse] group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]">
          {[0, 1].map((copy) => (
            <div
              key={copy}
              aria-hidden={copy === 1}
              className="flex shrink-0 items-center gap-3 pr-3 sm:gap-4 sm:pr-4"
            >
              {systems.map((item) => {
                const Icon = iconMap[item.icon as IconKey] ?? Globe2;
                return (
                  <div
                    key={`${copy}-${item.name}`}
                    className="flex items-center gap-2.5 rounded-full border border-black/8 bg-white/60 px-4 py-2.5 transition-colors duration-400 hover:bg-white"
                  >
                    <Icon size={14} className="text-black/45" />
                    <span className="font-display text-sm font-semibold whitespace-nowrap">
                      {item.name}
                    </span>
                    <span className="hidden text-[11px] whitespace-nowrap text-black/40 sm:inline">
                      {item.note}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-[1200px] px-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <PlaceholderTag label="Integration targets" />
          <p className="max-w-2xl text-[11px] leading-relaxed text-black/40">
            {integrationDisclaimer}
          </p>
        </div>
      </div>

      {/* Pillars + Arabic-first panel */}
      <div className="mx-auto mt-14 max-w-[1200px] px-5 sm:mt-16 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
          <Reveal className="lg:col-span-7">
            <div className="flex h-full flex-col justify-between gap-8 rounded-3xl border border-black/8 bg-white p-6 sm:p-8">
              <div className="flex items-center gap-2.5">
                <Languages size={16} className="text-black" />
                <span className="eyebrow text-black/45">Arabic-first, not Arabic-translated</span>
              </div>
              <div dir="rtl" className="rounded-2xl bg-mist p-6 text-right sm:p-8">
                <p className="font-arabic text-2xl leading-relaxed font-semibold text-ink sm:text-[1.8rem]">
                  {arabicSample.ar}
                </p>
                <p dir="ltr" className="mt-4 text-left text-sm text-black/45">
                  {arabicSample.en}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-black/45">{arabicSample.note}</p>
            </div>
          </Reveal>

          <div className="grid gap-4 lg:col-span-5">
            {menaPillars.map((pillar, i) => (
              <Reveal key={pillar.title} delay={i * 90}>
                <div className="group flex items-start gap-4 rounded-2xl border border-black/8 bg-white/70 p-5 transition-all duration-500 hover:border-black/20 hover:bg-white">
                  <span className="numeral mt-0.5 text-xs font-bold text-black/30 transition-colors group-hover:text-black">
                    0{i + 1}
                  </span>
                  <div>
                    <h3 className="text-lg leading-tight font-bold">{pillar.title}</h3>
                    <p className="mt-1 text-sm text-black/50">{pillar.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Regional coverage */}
        <Reveal className="mt-6 sm:mt-8">
          <div className="rounded-3xl border border-black/8 bg-white p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h3 className="text-2xl font-medium sm:text-[1.7rem]">Where we say we operate</h3>
              <Disclosure className="max-w-xs text-right">{regionsNote}</Disclosure>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {regions.map((r, i) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setRegion(i)}
                  onMouseEnter={() => setRegion(i)}
                  aria-pressed={i === region}
                  className={cn(
                    "cursor-pointer rounded-2xl border px-4 py-3 text-left transition-all duration-400",
                    i === region
                      ? "border-black bg-ink text-white"
                      : "border-hair bg-mist/60 hover:border-black/20 hover:bg-mist"
                  )}
                >
                  <span className="numeral block text-lg leading-none font-bold">{r.code}</span>
                  <span
                    className={cn(
                      "mt-1.5 block text-xs font-medium",
                      i === region ? "text-white/70" : "text-black/50"
                    )}
                  >
                    {r.name}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[10px]",
                      i === region ? "text-white/45" : "text-black/35"
                    )}
                  >
                    {r.status}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-black/40">
              Selected: {regions[region].name} — {regions[region].status}. Number ranges, recording consent
              prompts and calling hours are agreed per market before any live routing.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
