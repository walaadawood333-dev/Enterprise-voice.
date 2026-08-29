import { ArrowUpRight, CircleDashed, FileText, Landmark, NotebookPen } from "lucide-react";
import { evaluationNote, evaluationStages, proofStats } from "@/content/site";
import { Disclosure, PlaceholderTag } from "@/components/ui/Placeholder";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { useUI } from "@/context/UIProvider";

export function SocialProof() {
  const { openDemo } = useUI();

  return (
    <section id="proof" aria-label="Evidence and placeholders" className="bg-mist py-24 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="eyebrow text-black/40">Evidence</span>
          <h2 className="text-section mx-auto mt-4 mb-5 font-medium">
            Built for high-volume operations
          </h2>
          <p className="text-lg leading-relaxed text-black/50">
            We are early enough to be straightforward about it: the platform is built and the
            architecture is described in the open, but there are no published customer results yet.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 sm:mt-16 lg:grid-cols-4">
          {proofStats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 70}>
              <div className="group text-center">
                <div className="numeral text-[2.6rem] leading-none font-bold tracking-tight transition-transform duration-500 group-hover:-translate-y-0.5 sm:text-4xl">
                  {stat.value}
                </div>
                <div className="font-display mt-2 text-[10px] tracking-[0.18em] text-black/45 uppercase">
                  {stat.label}
                </div>
                {stat.placeholder ? (
                  <PlaceholderTag className="mt-3" note={stat.note} label="Not published" />
                ) : (
                  <p className="mx-auto mt-3 max-w-[16rem] text-[11px] leading-snug text-black/40">
                    {stat.note}
                  </p>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-16 grid gap-5 lg:grid-cols-12 lg:gap-6">
          {/* Honest placeholder case study */}
          <Reveal className="lg:col-span-7">
            <article className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-dashed border-black/20 bg-white p-6 sm:p-9">
              <div className="absolute inset-0 opacity-40 [background:repeating-linear-gradient(135deg,transparent_0_10px,rgba(0,0,0,0.02)_10px_11px)]" />
              <div className="relative">
                <div className="flex items-center gap-3.5">
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-black/15 text-black/45">
                    <Landmark size={17} />
                  </span>
                  <div>
                    <div className="font-display text-base font-bold">
                      Customer case study — coming soon
                    </div>
                    <div className="text-xs text-black/45">
                      Placeholder slot · no named customer, no implied result
                    </div>
                  </div>
                </div>

                <blockquote className="mt-7 text-xl leading-relaxed text-black/45 italic sm:text-2xl">
                  “Once a deployment has run a full evaluation under a signed reference agreement, the
                  measured numbers go here — containment, handle time, deflection and cost per resolved
                  contact. Nothing before that.”
                </blockquote>

                <div className="mt-7 flex flex-wrap items-center gap-2.5">
                  <PlaceholderTag label="Reserved placement" />
                  <span className="text-[11px] text-black/40">
                    Structure preserved from the design · content withheld until verified
                  </span>
                </div>
              </div>

              <div className="relative mt-8 flex flex-wrap items-center gap-4 border-t border-hair pt-6">
                <span className="inline-flex items-center gap-2 text-xs text-black/45">
                  <CircleDashed size={14} /> No verified implementation results published
                </span>
                <span className="inline-flex items-center gap-2 text-xs text-black/45">
                  <FileText size={14} /> Evaluation artefacts shared per prospect
                </span>
              </div>
            </article>
          </Reveal>

          {/* Evaluation shape */}
          <Reveal delay={100} className="lg:col-span-5">
            <div className="flex h-full flex-col justify-between rounded-3xl bg-ink p-6 text-white sm:p-8">
              <div>
                <span className="eyebrow text-white/35">What an evaluation looks like</span>
                <h3 className="mt-3 text-2xl leading-tight font-medium sm:text-[1.7rem]">
                  Four stages from scoping to live traffic
                </h3>
                <ol className="mt-7 space-y-5">
                  {evaluationStages.map((step, i) => (
                    <li key={step.stage} className="relative flex gap-4">
                      <span className="relative flex flex-col items-center">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/25 text-[10px] font-bold">
                          {i + 1}
                        </span>
                        {i < evaluationStages.length - 1 ? (
                          <span className="mt-1 w-px grow bg-white/15" />
                        ) : null}
                      </span>
                      <span className="pb-1">
                        <span className="font-display block text-[10px] tracking-[0.18em] text-white/40 uppercase">
                          {step.stage}
                        </span>
                        <span className="mt-1 block text-[15px] font-bold">{step.title}</span>
                        <span className="mt-0.5 block text-sm leading-snug text-white/45">
                          {step.body}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-6 text-[11px] leading-relaxed text-white/35">{evaluationNote}</p>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/12 pt-6">
                <Button variant="onDark" size="sm" onClick={() => openDemo("evaluation plan")}>
                  Book a scoping call
                </Button>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-white/40">
                  <FileText size={13} /> Evaluation plan shared as a document
                </span>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={80} className="mt-6">
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-black/8 bg-white px-6 py-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3.5">
              <NotebookPen size={17} className="mt-0.5 shrink-0 text-black/45" />
              <p className="text-sm leading-relaxed text-black/55">
                <span className="font-semibold text-ink">On the numbers in this build:</span> every
                latency, capacity, availability and efficiency figure on this site is written as a product
                design target or is labelled as unverified. None of them is presented as a customer result,
                and no market position is claimed.
              </p>
            </div>
            <a
              href="#pricing"
              className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-ink"
            >
              See how pricing is structured
              <ArrowUpRight
                size={14}
                className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </a>
          </div>
        </Reveal>
        <Disclosure className="mt-5 text-center sm:text-left">
          This is a product site, not a claims register. Replace every labelled placeholder with audited
          data before external publication.
        </Disclosure>
      </div>
    </section>
  );
}
