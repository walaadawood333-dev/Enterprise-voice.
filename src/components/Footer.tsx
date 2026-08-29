import { ArrowUp, ArrowUpRight } from "lucide-react";
import { footerColumns } from "@/content/site";
import { useUI } from "@/context/UIProvider";
import { scrollToId } from "@/utils/scroll";
import { VoiceBars } from "./ui/VoiceBars";

export function Footer() {
  const { openDemo, openLegal } = useUI();

  return (
    <footer className="border-t border-hair bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-col items-start justify-between gap-12 lg:flex-row lg:gap-16">
          <div className="max-w-sm space-y-6">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="group flex items-center gap-3"
              aria-label="Back to top"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-ink px-2 text-white/90 transition-transform duration-500 group-hover:-translate-y-0.5">
                <VoiceBars count={5} intensity={0.9} className="h-3.5 w-full" />
              </span>
              <span className="text-3xl leading-none font-bold tracking-tight uppercase sm:text-4xl">
                Center<span className="text-black/40">ai</span>
              </span>
            </button>
            <p className="text-[15px] leading-relaxed text-black/50">
              Enterprise voice infrastructure company headquartered in Jordan and built for MENA.
            </p>
            <p dir="rtl" className="font-arabic text-sm text-black/40">
              بنية تحتية صوتية للمؤسسات — من عمّان إلى المنطقة.
            </p>
            <button
              type="button"
              onClick={() => openDemo("footer")}
              className="btn-primary inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white"
            >
              Book a Demo
            </button>
          </div>

          <div className="grid w-full grid-cols-2 gap-12 text-sm sm:grid-cols-4 lg:w-auto">
            {footerColumns.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h4 className="font-display text-[17px] font-bold tracking-tight text-black">
                  {column.title}
                </h4>
                <ul className="mt-4 space-y-2 text-black/50">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <button
                        type="button"
                        onClick={() => {
                          const item = link as { target?: string; legal?: string };
                          if (item.legal) openLegal(item.legal);
                          else if (item.target) scrollToId(item.target);
                        }}
                        className="cursor-pointer text-left transition-colors duration-300 hover:text-black hover:underline hover:decoration-black/20 hover:underline-offset-4"
                      >
                        {link.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col-reverse items-start justify-between gap-5 border-t border-hair pt-8 text-xs text-black/40 sm:flex-row sm:items-center">
          <p>
            © 2026 CenterAI — Headquartered in Jordan. Product positioning only: no customer results,
            SLA values, benchmarks or certifications are claimed on this site.
          </p>
          <div className="flex items-center gap-5">
            <a
              href="mailto:hello@centerai.jo"
              className="transition-colors hover:text-black"
              aria-label="Email CenterAI"
            >
              hello@centerai.jo
            </a>
            <span className="hidden h-3 w-px bg-hair sm:block" />
            <div className="flex items-center gap-1.5">
              {["X", "LinkedIn", "Updates"].map((label) => (
                <a
                  key={label}
                  href="mailto:hello@centerai.jo?subject=Follow%20request"
                  title={`${label} — channel link pending launch`}
                  className="group inline-flex items-center gap-1 rounded-full border border-hair px-3 py-1.5 font-display text-[11px] font-semibold tracking-wide text-black/55 transition-all duration-300 hover:-translate-y-0.5 hover:border-black/30 hover:text-black"
                >
                  {label}
                  <ArrowUpRight
                    size={11}
                    className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                </a>
              ))}
            </div>
            <span className="hidden h-3 w-px bg-hair sm:block" />
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-black"
            >
              <ArrowUp size={13} /> Top
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
