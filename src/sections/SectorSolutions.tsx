import { useState } from "react";
import { ArrowUpRight, BadgeCheck, Landmark, ShieldCheck } from "lucide-react";
import { useCases, sectors } from "@/content/site";
import { Disclosure, PlaceholderTag } from "@/components/ui/Placeholder";
import { Reveal } from "@/components/ui/Reveal";
import { SmartImage } from "@/components/ui/SmartImage";
import { useUI } from "@/context/UIProvider";
import { cn } from "@/utils/cn";

export function SectorSolutions() {
  const { openDemo } = useUI();
  const [active, setActive] = useState(0);
  const useCase = useCases[active];

  return (
    <section id="solutions" aria-label="Sector solutions" className="bg-white py-24 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6">
        <Reveal className="mb-12 flex flex-col gap-5 md:mb-16 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow text-black/40">Sector Solutions</span>
            <h2 className="text-section mt-4 font-medium">
              Purpose-built for
              <br />
              regulated industries
            </h2>
          </div>
          <p className="max-w-sm text-[15px] leading-relaxed text-black/50 md:text-right">
            One platform, four operating models. Banking is the vertical we build first — the rest reuse
            the same guardrails.
          </p>
        </Reveal>

        <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-12">
          {/* Banking — dominant */}
          <Reveal className="lg:col-span-4">
            <div className="grain relative h-full overflow-hidden rounded-3xl bg-ink p-6 text-white sm:p-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-white/[0.06] blur-2xl"
              />
              <div className="relative">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
                    <Landmark size={16} />
                  </span>
                  <span className="rounded-full border border-white/15 px-3 py-1 font-display text-[9px] font-bold tracking-[0.2em] text-white/55 uppercase">
                    Primary vertical
                  </span>
                </div>

                <h3 className="mt-6 text-[2.4rem] leading-none font-medium sm:text-[2.9rem]">
                  AI Voice for Banking
                </h3>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/50">
                  Specialized agents built for the strict requirements of financial institutions — audit
                  trails, step-up authentication and Arabic-first conversation.
                </p>

                <div
                  className="mt-8 space-y-1"
                  role="tablist"
                  aria-orientation="vertical"
                  aria-label="Banking use cases"
                  onKeyDown={(e) => {
                    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? useCases.length - 1
                          : e.key === "ArrowDown"
                            ? (active + 1) % useCases.length
                            : (active - 1 + useCases.length) % useCases.length;
                    setActive(next);
                    const el = document.getElementById(`tab-${useCases[next].id}`);
                    el?.focus();
                  }}
                >
                  {useCases.map((uc, i) => (
                    <button
                      key={uc.id}
                      type="button"
                      role="tab"
                      id={`tab-${uc.id}`}
                      aria-selected={i === active}
                      aria-controls={i === active ? `panel-${uc.id}` : undefined}
                      tabIndex={i === active ? 0 : -1}
                      onClick={() => setActive(i)}
                      className="group flex w-full cursor-pointer items-stretch gap-4 rounded-2xl py-3 text-left transition-colors duration-400 hover:bg-white/[0.05]"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "w-[3px] shrink-0 rounded-full transition-all duration-500",
                          i === active ? "bg-white" : "bg-white/15 group-hover:bg-white/40"
                        )}
                      />
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block text-lg font-bold transition-colors duration-400 sm:text-xl",
                            i === active ? "text-white" : "text-white/40 group-hover:text-white/70"
                          )}
                        >
                          {uc.title}
                        </span>
                        <span
                          className={cn(
                            "block text-sm leading-snug transition-colors duration-400",
                            i === active ? "text-white/55" : "text-white/25"
                          )}
                        >
                          {uc.blurb}
                        </span>
                      </span>
                      <ArrowUpRight
                        size={16}
                        className={cn(
                          "mt-1 ml-auto shrink-0 transition-all duration-400",
                          i === active
                            ? "text-white opacity-100"
                            : "text-white/30 opacity-0 group-hover:opacity-100"
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          {/* Secondary verticals */}
          <div className="grid gap-5 sm:grid-cols-2 lg:col-span-8 lg:gap-6">
            {sectors.map((sector, i) => (
              <Reveal key={sector.title} delay={i * 80}>
                <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-hair bg-mist p-5 transition-all duration-500 hover:border-black/15 hover:shadow-[0_30px_70px_-45px_rgba(0,0,0,0.5)] sm:p-8 lg:aspect-square">
                  <div className="relative mb-5 min-h-0 flex-1 overflow-hidden rounded-2xl bg-black/5">
                    <SmartImage
                      src={sector.image}
                      alt={sector.alt}
                      width={940}
                      height={650}
                      fill
                      wrapperClassName="absolute inset-0 h-full w-full"
                      className="object-cover grayscale transition-all duration-[900ms] ease-smooth group-hover:scale-[1.045] group-focus-within:scale-[1.045] group-hover:grayscale-[0.15]"
                    />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition-opacity duration-500 group-focus-within:opacity-100 group-hover:opacity-100">
                      {sector.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-black"
                        >
                          {cap}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-2xl leading-none font-bold">
                      <button
                        type="button"
                        onClick={() => openDemo(`solutions · ${sector.title}`)}
                        aria-label={`Discuss AI voice for ${sector.title} with CenterAI`}
                        className="cursor-pointer text-left transition-colors duration-300 hover:text-black/60"
                      >
                        {sector.title}
                      </button>
                    </h4>
                    <ArrowUpRight
                      size={17}
                      className="text-black/25 transition-all duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black"
                    />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-black/50">{sector.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Banking console */}
        <Reveal delay={80} className="mt-6 lg:mt-8">
          <div
            id={`panel-${useCase.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${useCase.id}`}
            className="grid gap-8 rounded-3xl border border-hair bg-mist p-6 sm:p-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14"
          >
            <div key={useCase.id} style={{ animation: "popIn .5s var(--ease-smooth) both" }}>
              <div className="flex items-center gap-2.5">
                <BadgeCheck size={15} className="text-black" />
                <span className="eyebrow text-black/45">Banking · {useCase.title}</span>
              </div>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-black/60 sm:text-xl">
                {useCase.detail}
              </p>
              <div className="mt-6 space-y-2.5">
                {useCase.dialogue.map((line, i) => (
                  <div
                    key={`${useCase.id}-${i}`}
                    className={cn(
                      "flex",
                      line.role === "Agent" ? "justify-start" : "justify-end"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[92%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed sm:max-w-[80%]",
                        line.role === "Agent"
                          ? "border border-hair bg-white text-black/75"
                          : "bg-ink text-white"
                      )}
                    >
                      <span className="mb-1 block font-display text-[9px] tracking-[0.18em] uppercase opacity-50">
                        {line.role}
                      </span>
                      {line.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-between gap-6 border-t border-black/8 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
              <div>
                <span className="eyebrow text-black/40">Agent capabilities</span>
                <ul className="mt-4 space-y-3">
                  {useCase.tags.map((tag) => (
                    <li key={tag} className="flex items-center gap-3 text-[15px] font-medium">
                      <ShieldCheck size={15} className="text-black/40" />
                      {tag}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-xs leading-relaxed text-black/40">
                  Call flows shown are illustrative configurations for demonstration. Real deployments are
                  scripted with your policy, data access rules and recording consent language.
                </p>
              </div>
              <div className="space-y-3">
                {useCase.placeholder ? <PlaceholderTag label="Illustrative flow" /> : null}
                <Disclosure>Sample transcripts are not recorded customer calls.</Disclosure>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
