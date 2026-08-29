import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { nav, statusTooltip } from "@/content/site";
import { useUI } from "@/context/UIProvider";
import { useActiveSection, useScrollProgress } from "@/hooks/useScrollState";
import { scrollToId } from "@/utils/scroll";
import { cn } from "@/utils/cn";
import { VoiceBars } from "./ui/VoiceBars";

const sectionIds = ["hero", ...nav.map((n) => n.target)];

export function Navbar() {
  const { openDemo } = useUI();
  const { progress, scrolled } = useScrollProgress();
  const active = useActiveSection(sectionIds);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (id: string) => {
    setMenuOpen(false);
    scrollToId(id);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        aria-hidden="true"
        className="h-[2px] origin-left bg-ink/80 transition-transform duration-150"
        style={{ transform: `scaleX(${progress})` }}
      />
      <nav
        aria-label="Primary"
        className={cn(
          "px-4 transition-all duration-500 ease-smooth sm:px-6",
          scrolled ? "py-2.5" : "py-4"
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 rounded-full border px-5 transition-all duration-500 ease-smooth sm:px-6",
            scrolled
              ? "border-hair bg-white/85 py-3 shadow-[0_18px_46px_-30px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              : "border-hair/80 bg-white/70 py-3 backdrop-blur-md"
          )}
        >
          <div className="flex min-w-0 items-center gap-5 sm:gap-8">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="group flex items-center gap-2.5"
              aria-label="CenterAI — back to top"
            >
              <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-ink px-1.5 text-white/90">
                <VoiceBars count={5} intensity={0.95} className="h-3 w-full" barClassName="min-w-[1.5px]" />
              </span>
              <span className="font-display text-xl leading-none font-bold tracking-tight whitespace-nowrap">
                Center<span className="text-black/45 transition-colors group-hover:text-black">AI</span>
              </span>
            </button>

            <div className="hidden items-center gap-6 text-sm font-medium md:flex">
              {nav.map((item) => (
                <button
                  key={item.target}
                  type="button"
                  onClick={() => go(item.target)}
                  data-active={active === item.target}
                  className="nav-link-hover cursor-pointer text-black/65 transition-colors hover:text-black data-[active=true]:text-black"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div
              className="hidden items-center gap-2 text-xs text-black/45 lg:flex"
              title={statusTooltip}
            >
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse-dot" />
              <span className="font-display font-medium tracking-wide">Systems Operational</span>
            </div>

            <button
              type="button"
              onClick={() => openDemo("navigation")}
              className="btn-primary group inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white"
            >
              Book a Demo
              <ArrowUpRight
                size={14}
                className="hidden transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:block"
              />
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-hair text-black/70 transition-colors hover:bg-mist md:hidden"
            >
              {menuOpen ? <X size={15} /> : <Menu size={15} />}
            </button>
          </div>
        </div>

        <div
          id="mobile-menu"
          className={cn(
            "mx-auto mt-2 max-w-[1200px] overflow-hidden transition-all duration-400 ease-smooth md:hidden",
            menuOpen ? "max-h-80 opacity-100" : "pointer-events-none max-h-0 opacity-0"
          )}
        >
          <div className="rounded-3xl border border-hair bg-white/92 p-2 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            {nav.map((item) => (
              <button
                key={item.target}
                type="button"
                onClick={() => go(item.target)}
                className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-[15px] font-medium transition-colors hover:bg-mist"
              >
                {item.label}
                <ArrowUpRight size={15} className="text-black/35" />
              </button>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-hair px-4 py-3">
              <span
                className="inline-flex items-center gap-2 text-xs text-black/45"
                title={statusTooltip}
              >
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse-dot" />
                Systems Operational
              </span>
              <button
                type="button"
                onClick={() => go("pricing")}
                className="text-xs font-semibold underline decoration-black/25 underline-offset-4"
              >
                View pricing
              </button>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
