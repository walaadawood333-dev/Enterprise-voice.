import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  labelledBy: string;
  size?: "md" | "lg";
};

/** Accessible dialog: ESC + backdrop close, scroll lock, focus in/out. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  labelledBy,
  size = "lg",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      // Prefer the first real control in the body; fall back to any focusable element.
      const firstField = panelRef.current?.querySelector<HTMLElement>(
        'form input:not([type="hidden"]), form select, form textarea, input:not([type="hidden"]), select, textarea'
      );
      (firstField ?? panelRef.current?.querySelector<HTMLElement>("button"))?.focus();
    }, 60);

    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fadeIn .28s ease both" }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative w-full overflow-y-auto rounded-t-[28px] bg-white text-ink shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] sm:rounded-[28px]",
          "max-h-[92vh] border border-hair",
          size === "lg" ? "sm:max-w-[640px]" : "sm:max-w-[480px]"
        )}
        style={{ animation: "popIn .34s var(--ease-smooth) both" }}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-6 border-b border-hair bg-white/90 px-6 py-5 backdrop-blur-md sm:px-9">
          <div>
            <h2 id={labelledBy} className="text-2xl font-medium tracking-tight sm:text-3xl">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 max-w-md text-sm text-black/55">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hair text-black/60 transition-colors hover:bg-mist hover:text-black"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="px-6 py-7 sm:px-9 sm:py-9">{children}</div>
      </div>
    </div>
  );
}
