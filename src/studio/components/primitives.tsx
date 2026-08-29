import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";

/* ── data-origin labelling (never let demo look like proof) ─────────── */

export function DemoBadge({
  live,
  className,
  note,
}: {
  live?: boolean;
  className?: string;
  note?: string;
}) {
  const isLive = Boolean(live);
  return (
    <span
      title={note}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-[9px] font-bold tracking-[0.16em] uppercase",
        isLive
          ? "border-black/20 bg-ink text-white"
          : "border-black/10 bg-mist text-black/50",
        className
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-green-400" : "bg-amber-400")}
      />
      {isLive ? "Live data" : "Demo data"}
    </span>
  );
}

export function Panel({
  children,
  className,
  as: Tag = "section",
  dark,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
  dark?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "rounded-3xl border p-5 sm:p-6",
        dark
          ? "grain relative overflow-hidden border-white/10 bg-graphite text-white"
          : "border-hair bg-white",
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  aside,
  dark,
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
  dark?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p
            className={cn(
              "font-display text-[10px] font-bold tracking-[0.2em] uppercase",
              dark ? "text-white/40" : "text-black/40"
            )}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1.5 font-display text-xl leading-tight font-medium sm:text-[1.4rem]">{title}</h2>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

const TONES: Record<string, string> = {
  live: "bg-ink text-white",
  completed: "bg-black/[0.06] text-black/70",
  active: "bg-green-500/12 text-green-800",
  scheduled: "bg-black/[0.06] text-black/60",
  draft: "bg-mist text-black/50 border border-hair",
  paused: "bg-amber-400/18 text-amber-800",
  handover: "bg-black/[0.06] text-black/60",
  failed: "bg-red-50 text-red-700 border border-red-200",
  not_connected: "bg-mist text-black/50 border border-hair",
  coming_soon: "bg-black/[0.05] text-black/55 border border-dashed border-black/20",
  configured: "bg-ink text-white",
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const readable = label ?? status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-display text-[10px] font-bold tracking-[0.12em] uppercase",
        TONES[status] ?? "bg-mist text-black/55"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-55" />
      {readable}
    </span>
  );
}

/* ── sparkline (derived from the same rows the tables show) ─────────── */

export function Sparkline({
  values,
  className,
  stroke = "currentColor",
}: {
  values: number[];
  className?: string;
  stroke?: string;
}) {
  const max = Math.max(1, ...values);
  const step = 100 / Math.max(1, values.length - 1);
  const points = values.map((v, i) => [i * step, 34 - (v / max) * 28] as const);
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox="0 0 100 36"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("h-9 w-full", className)}
      fill="none"
    >
      <path
        d={`${path} L100,36 L0,36 Z`}
        fill={stroke}
        opacity="0.08"
      />
      <path
        d={path}
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="sparkline-draw"
      />
      <circle cx={points[points.length - 1]?.[0] ?? 100} cy={points[points.length - 1]?.[1] ?? 6} r="2.1" fill={stroke} />
    </svg>
  );
}

/* ── drawer / modal ─────────────────────────────────────────────────── */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("input, select, textarea, button")
        ?.focus();
    }, 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previous;
      restore.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/45 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-[24px] border border-hair bg-white shadow-[0_40px_120px_-45px_rgba(0,0,0,0.55)] sm:rounded-3xl",
          width
        )}
        style={{ animation: "popIn .32s var(--ease-smooth) both" }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-hair px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <h2 className="font-display text-xl leading-tight font-medium">{title}</h2>
            {description ? (
              <p className="mt-1 text-[13px] leading-relaxed text-black/50">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border border-hair text-black/55 transition-colors hover:bg-mist hover:text-black"
          >
            <X size={15} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">{children}</div>
        {footer ? (
          <footer className="border-t border-hair bg-mist/60 px-5 py-4 sm:px-7">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}

/* ── form atoms ─────────────────────────────────────────────────────── */

export const fieldClass =
  "w-full rounded-2xl border border-hair bg-white px-4 py-2.5 font-sans text-[15px] text-ink transition-colors placeholder:text-black/25 hover:border-black/25 focus:border-black focus:outline-none";
export const fieldBadClass = "border-red-300 bg-red-50/60 focus:border-red-500";

export function Labeled({
  htmlFor,
  label,
  hint,
  error,
  children,
  className,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label || hint ? (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          {label ? (
            <label
              htmlFor={htmlFor}
              className="font-display text-[10px] font-bold tracking-[0.16em] text-black/55 uppercase"
            >
              {label}
            </label>
          ) : (
            <span />
          )}
          {hint ? <span className="text-[11px] text-black/35">{hint}</span> : null}
        </div>
      ) : null}
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-[12px] font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="shimmer h-11 rounded-2xl"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-mist/50 px-5 py-8 text-center">
      <p className="font-display text-lg font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-black/45">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
