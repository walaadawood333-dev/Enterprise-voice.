import { useEffect, useState } from "react";
import { ErrorBoundary, Footer, Navbar } from "@/components";
import {
  BusinessValue,
  FinalCTA,
  Hero,
  Infrastructure,
  Integrations,
  Pricing,
  SectorSolutions,
  SocialProof,
  VoiceDemoSection,
  VoicePlatform,
} from "@/sections";
import { useUI } from "@/context/UIProvider";
import { cn } from "@/utils/cn";

function MobileCtaBar() {
  const { openDemo } = useUI();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(window.scrollY > 620);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-hair bg-white/92 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl transition-transform duration-500 ease-smooth lg:hidden",
        show ? "translate-y-0" : "translate-y-full"
      )}
      aria-hidden={!show}
    >
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="numeral text-sm leading-none font-bold">&lt;300ms · Arabic-first</span>
          <span className="mt-1 truncate text-[11px] text-black/45">
            Enterprise voice infrastructure
          </span>
        </span>
        <button
          type="button"
          tabIndex={show ? 0 : -1}
          onClick={() => openDemo("mobile bar")}
          className="btn-primary ml-auto shrink-0 cursor-pointer rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white"
        >
          Book a Demo
        </button>
      </div>
    </div>
  );
}

/**
 * The public marketing site.
 * Content and structure are unchanged from the previous phase — this file only exists so the
 * Agent Studio can mount as a separate surface without touching the public design.
 */
export function PublicSite() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[110] focus:rounded-full focus:bg-ink focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <Navbar />

      <main id="main" tabIndex={-1} className="focus:outline-none">
        <Hero />
        <ErrorBoundary label="business value">
          <BusinessValue />
        </ErrorBoundary>
        <ErrorBoundary label="voice platform">
          <VoicePlatform />
        </ErrorBoundary>
        <ErrorBoundary label="voice demo">
          <VoiceDemoSection />
        </ErrorBoundary>
        <ErrorBoundary label="sector solutions">
          <SectorSolutions />
        </ErrorBoundary>
        <ErrorBoundary label="integrations">
          <Integrations />
        </ErrorBoundary>
        <ErrorBoundary label="infrastructure">
          <Infrastructure />
        </ErrorBoundary>
        <ErrorBoundary label="evidence">
          <SocialProof />
        </ErrorBoundary>
        <ErrorBoundary label="pricing">
          <Pricing />
        </ErrorBoundary>
        <FinalCTA />
      </main>

      <Footer />
      <div aria-hidden="true" className="h-16 bg-white lg:hidden" />
      <MobileCtaBar />
    </>
  );
}
