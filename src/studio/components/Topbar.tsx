import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CalendarClock, Menu, Mic, Search, X } from "lucide-react";
import { routeFor } from "../studioRoutes";
import { DemoBadge } from "./primitives";
import { useStudio } from "../StudioProvider";
import { useUI } from "@/context/UIProvider";
import { getVoiceMode, type VoiceMode } from "@/api";
import { cn } from "@/utils/cn";

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { pathname } = useLocation();
  const route = routeFor(pathname);
  const { origin, query, setQuery, pushToast } = useStudio();
  const { openDemo } = useUI();
  const [mode, setMode] = useState<VoiceMode>(getVoiceMode);

  useEffect(() => {
    let alive = true;
    void getVoiceModePromise().then((next) => {
      if (alive) setMode(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-hair bg-white/88 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:gap-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="Open navigation"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border border-hair text-black/60 transition-colors hover:bg-mist hover:text-black lg:hidden"
          >
            <Menu size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[1.35rem] leading-tight font-medium tracking-tight sm:text-[1.55rem]">
              {route.title}
            </h1>
            <p className="truncate text-[11.5px] text-black/45">{route.blurb}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:ms-auto lg:gap-2.5">
          <div className="relative order-last w-full sm:w-[240px] lg:order-none lg:w-[220px] xl:w-[260px]">
            <Search
              size={14}
              className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-black/35"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sessions, agents…"
              aria-label="Search the workspace"
              className="w-full rounded-full border border-hair bg-mist/60 py-2 ps-9 pe-8 text-[13px] transition-colors placeholder:text-black/30 hover:border-black/25 focus:border-black focus:bg-white focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute end-2 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-black/40 transition-colors hover:text-black"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          <DemoBadge live={origin === "live"} note="Only flips to live when a configured API returns rows." />

          <span
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-[10px] font-bold tracking-[0.14em] uppercase sm:inline-flex",
              mode.mode === "production" && mode.state === "connected"
                ? "border-black/15 bg-ink text-white"
                : "border-hair bg-mist text-black/45"
            )}
            title={mode.message}
          >
            <Mic size={11} />
            {mode.mode === "production" && mode.state === "connected" ? "Live voice" : "Demo Mode"}
          </span>

          <button
            type="button"
            onClick={() => pushToast("Scheduling is not wired in this build — no calendar or CRM connection exists.", "info")}
            className="hidden cursor-pointer items-center gap-1.5 rounded-full border border-hair px-3 py-1.5 font-display text-[12px] font-semibold text-black/60 transition-colors hover:border-black/25 hover:text-black md:inline-flex"
          >
            <CalendarClock size={13} />
            Schedule review
          </button>

          <button
            type="button"
            onClick={() => openDemo("agent studio")}
            className="btn-primary inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-ink px-4 py-2 font-display text-[13px] font-semibold text-white"
          >
            Book a demo
          </button>
        </div>
      </div>
    </header>
  );
}

function getVoiceModePromise(): Promise<VoiceMode> {
  return import("@/api").then((module) => module.resolveVoiceMode());
}
