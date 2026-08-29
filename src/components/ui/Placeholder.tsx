import { cn } from "@/utils/cn";

type PlaceholderProps = {
  label?: string;
  note?: string;
  className?: string;
  tone?: "light" | "dark";
};

/**
 * Marks numbers/claims that are illustrative layout placeholders rather than
 * verified CenterAI results. Keeps the site honest without breaking the design.
 */
export function PlaceholderTag({
  label = "Demo placeholder",
  note,
  className,
  tone = "light",
}: PlaceholderProps) {
  return (
    <span
      title={note ?? "Illustrative value used for layout — replace with verified data."}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] font-display text-[9px] font-bold tracking-[0.16em] uppercase",
        tone === "light"
          ? "border-hair bg-mist text-black/50"
          : "border-white/15 bg-white/5 text-white/45",
        className
      )}
    >
      <span className="h-1 w-1 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

export function Disclosure({
  children,
  className,
  tone = "light",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-[11px] leading-relaxed",
        tone === "light" ? "text-black/40" : "text-white/40",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-[6px] h-[1px] w-4 shrink-0",
          tone === "light" ? "bg-black/25" : "bg-white/25"
        )}
      />
      <span>{children}</span>
    </p>
  );
}
