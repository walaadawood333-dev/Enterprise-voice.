import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ArrowUpRight, Building2, X } from "lucide-react";
import { STUDIO_ROUTES } from "../studioRoutes";
import { useStudio } from "../StudioProvider";
import { useAuth } from "@/hooks/useAuth";
import { getVoiceMode } from "@/api";
import { VoiceBars } from "@/components/ui/VoiceBars";
import { cn } from "@/utils/cn";
import { useTenantBranding } from "@/branding/TenantBrandingProvider";

export function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { origin, agents, originNote } = useStudio();
  const { session } = useAuth();
  const { branding } = useTenantBranding();
  const [mode, setMode] = useState(getVoiceMode());

  useEffect(() => {
    const unsubscribe = subscribeMode(setMode);
    return unsubscribe;
  }, []);

  const nav = (
    <nav aria-label="Agent Studio" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
      <div>
        <Link
          to="/studio/overview"
          onClick={onCloseMobile}
          className="group flex items-center gap-2.5"
          aria-label={`${branding.displayName} Agent Studio — overview`}
        >
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg object-contain"
            />
          ) : (
            <span
              className="grid h-7 w-7 place-items-center overflow-hidden rounded-full px-1.5 text-white/90"
              style={{ backgroundColor: branding.primaryColor }}
            >
              <VoiceBars count={5} intensity={0.95} className="h-3 w-full" barClassName="min-w-[1.5px]" />
            </span>
          )}
          <span className="min-w-0 truncate font-display text-[18px] leading-none font-bold tracking-tight">
            {branding.displayName}
          </span>
        </Link>
      </div>

      <div className="rounded-2xl border border-hair bg-mist/70 p-3.5">
        <div className="flex items-center gap-2 text-[11px] text-black/45">
          <Building2 size={13} />
          <span className="truncate font-medium">{branding.displayName}</span>
        </div>
        <p className="mt-2 font-display text-2xl leading-none font-bold tracking-tight">
          {agents.length}
          <span className="ms-1.5 text-[11px] font-semibold tracking-[0.14em] text-black/40 uppercase">
            agents
          </span>
        </p>
        {session ? (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] leading-snug text-black/55">
            <span className="truncate font-medium">{session.name}</span>
            <span className="rounded-full bg-ink px-1.5 py-0.5 font-display text-[9px] font-bold tracking-[0.14em] text-white uppercase">
              {session.role}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-snug text-black/45">{originNote}</p>
        )}
        <span
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-display text-[9px] font-bold tracking-[0.16em] uppercase",
            origin === "live" ? "bg-ink text-white" : "bg-black/[0.06] text-black/55"
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              origin === "live" ? "bg-green-400" : "bg-amber-400"
            )}
          />
          {origin === "live" ? "Connected" : origin === "loading" ? "Checking" : "Demo data"}
        </span>
      </div>

      <ul className="space-y-1">
        {STUDIO_ROUTES.map((route) => (
          <li key={route.path}>
            <NavLink
              to={route.path}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition-all duration-300 ease-smooth",
                  isActive
                    ? "text-white shadow-[0_14px_30px_-22px_rgba(0,0,0,0.9)]"
                    : "text-black/60 hover:bg-mist hover:text-black"
                )
              }
              style={({ isActive }) => isActive ? { backgroundColor: branding.primaryColor } : undefined}
            >
              {({ isActive }) => (
                <>
                  <route.icon
                    size={15}
                    className={cn("shrink-0 transition-transform duration-300", isActive && "scale-110")}
                  />
                  <span className="font-display text-[14px] font-semibold tracking-wide">{route.label}</span>
                  {route.path === "/studio/campaigns" ? (
                    <span
                      className={cn(
                        "ms-auto font-display text-[9px] font-bold tracking-[0.14em] uppercase",
                        isActive ? "text-white/55" : "text-black/30"
                      )}
                    >
                      UI only
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-2.5 border-t border-hair pt-4 text-[11px] leading-relaxed text-black/40">
        <p>
          Voice engine:{" "}
          <span className="font-semibold text-black/65">
            {mode.state === "connected" && mode.mode === "production" ? "Realtime" : "Demo Mode"}
          </span>
        </p>
        <p>No telephony, no recording, no billing in this build.</p>
        <Link
          to="/"
          onClick={onCloseMobile}
          className="group inline-flex items-center gap-1.5 font-semibold text-black/55 transition-colors hover:text-black"
        >
          Public site
          <ArrowUpRight
            size={12}
            className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[248px] flex-col border-e border-hair bg-white px-4 py-5 lg:flex lg:px-5">
        {nav}
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-[70] lg:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          tabIndex={mobileOpen ? 0 : -1}
          aria-label="Close navigation"
          onClick={onCloseMobile}
          className={cn(
            "absolute inset-0 h-full w-full cursor-default bg-black/40 transition-opacity duration-300",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          className={cn(
            "absolute inset-y-0 start-0 flex w-[86%] max-w-[320px] flex-col border-e border-hair bg-white px-4 py-5 transition-transform duration-400 ease-smooth",
            mobileOpen ? "translate-y-0" : "-translate-y-full"
          )}
          role="dialog"
          aria-modal={mobileOpen}
          aria-label="Agent Studio navigation"
        >
          <button
            type="button"
            tabIndex={mobileOpen ? 0 : -1}
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="mb-4 ms-auto grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-hair text-black/55 transition-colors hover:bg-mist hover:text-black"
          >
            <X size={15} />
          </button>
          {nav}
        </div>
      </div>
    </>
  );
}

/* Imported lazily to avoid a hard cycle with the API module at type level. */
function subscribeMode(listener: (value: ReturnType<typeof getVoiceMode>) => void) {
  let active = true;
  let unsubscribe = () => {};
  void import("@/api").then((module) => {
    if (!active) return;
    listener(module.getVoiceMode());
    unsubscribe = module.subscribeVoiceMode(listener);
  });
  return () => {
    active = false;
    unsubscribe();
  };
}
