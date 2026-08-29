import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { StudioProvider, useStudio } from "../StudioProvider";

function Toast() {
  const { toast } = useStudio();
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[90] w-[min(92vw,440px)] -translate-x-1/2 lg:bottom-6"
      style={{ animation: "popIn .3s var(--ease-smooth) both" }}
    >
      <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-graphite px-4 py-3 text-white shadow-[0_30px_70px_-40px_rgba(0,0,0,0.9)]">
        <span
          className={
            toast.tone === "warn"
              ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-300"
              : toast.tone === "success"
                ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-green-400"
                : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-white/60"
          }
        />
        <p className="text-[13px] leading-relaxed text-white/80">{toast.message}</p>
      </div>
    </div>
  );
}

function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setNavOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="studio-shell relative min-h-dvh bg-mist text-ink">
      <a
        href="#studio-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[120] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to dashboard
      </a>

      <Sidebar mobileOpen={navOpen} onCloseMobile={() => setNavOpen(false)} />

      <div className="lg:ps-[248px]">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main
          id="studio-main"
          tabIndex={-1}
          className="mx-auto max-w-[1240px] px-4 pt-5 pb-16 focus:outline-none sm:px-6 lg:px-8 lg:pt-7"
        >
          <Outlet />
        </main>
      </div>

      <Toast />
    </div>
  );
}

export function DashboardLayout() {
  return (
    <StudioProvider>
      <Shell />
    </StudioProvider>
  );
}
