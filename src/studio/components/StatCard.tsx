import { Sparkline, StatusChip } from "./primitives";
import { cn } from "@/utils/cn";

type Tone = "light" | "dark";

export function StatCard({
  label,
  value,
  unit,
  note,
  tone = "light",
  series,
  status,
  statusLabel,
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  note?: string;
  tone?: Tone;
  series?: number[];
  status?: string;
  statusLabel?: string;
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border p-5 transition-all duration-500 ease-smooth sm:p-6",
        dark
          ? "grain border-white/10 bg-graphite text-white hover:border-white/25"
          : "border-hair bg-white hover:border-black/20 hover:shadow-[0_24px_60px_-45px_rgba(0,0,0,0.4)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "font-display text-[10px] font-bold tracking-[0.18em] uppercase",
            dark ? "text-white/45" : "text-black/40"
          )}
        >
          {label}
        </p>
        {status ? <StatusChip status={status} label={statusLabel} /> : null}
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span
          className={cn(
            "numeral text-[2.4rem] leading-none font-bold tracking-tight transition-transform duration-500 group-hover:-translate-y-0.5 sm:text-[2.9rem]",
            dark ? "text-white" : "text-ink"
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className={cn("font-display text-sm font-semibold", dark ? "text-white/45" : "text-black/40")}>
            {unit}
          </span>
        ) : null}
      </div>

      {series && series.length > 1 ? (
        <div className={cn("mt-4", dark ? "text-white/70" : "text-black/70")}>
          <Sparkline values={series} />
        </div>
      ) : null}

      {note ? (
        <p className={cn("mt-3 text-[11px] leading-snug", dark ? "text-white/40" : "text-black/40")}>
          {note}
        </p>
      ) : null}
    </article>
  );
}
