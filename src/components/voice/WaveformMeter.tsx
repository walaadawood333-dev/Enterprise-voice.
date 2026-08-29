import { useEffect, useRef, useState } from "react";
import type { VoiceState } from "@/lib/voiceProvider";
import { cn } from "@/utils/cn";

type Props = {
  state: VoiceState;
  bars?: number;
  className?: string;
  /** Grows right→left in LTR, left→right in RTL; purely cosmetic. */
  mirrored?: boolean;
  /**
   * Live input level (0–1) pulled per frame — used when a real microphone session is running,
   * so the waveform shows actual speech energy instead of a synthetic envelope. Read from a ref
   * so streaming audio never re-renders React.
   */
  levelSource?: () => number | null;
};

const ACTIVE: VoiceState[] = ["listening", "thinking", "speaking"];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Lightweight visualizer: a single rAF loop that writes transforms straight to the DOM
 * (no per-frame React render). Amplitude is shaped by conversation state, and the loop
 * stops entirely when idle, reduced-motion is on, or the meter is off-screen.
 */
export function WaveformMeter({ state, bars = 48, className, mirrored = false, levelSource }: Props) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const nodes = useRef<Array<HTMLSpanElement | null>>([]);
  const smooth = useRef<Float32Array>(new Float32Array(bars));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "60px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const els = nodes.current.filter(Boolean) as HTMLSpanElement[];
    const idle = !ACTIVE.includes(state);

    const paintStatic = (amplitude: number) => {
      els.forEach((el, i) => {
        const v = idle ? amplitude + (i % 6) * 0.012 : amplitude;
        smooth.current[i] = v;
        el.style.transform = `scaleY(${v.toFixed(3)})`;
        el.style.opacity = String(0.3 + v * 0.45);
      });
    };

    if (!visible || idle || prefersReducedMotion()) {
      paintStatic(idle ? 0.1 : 0.42);
      return;
    }

    let raf = 0;
    const t0 = performance.now();

    const target = (i: number, t: number) => {
      const x = mirrored ? bars - 1 - i : i;
      const centre = 1 - Math.abs(x - (bars - 1) / 2) / ((bars - 1) / 2);
      // A live input level (real mic session) drives the shape; the simulator stays synthetic.
      const live = levelSource ? Math.max(0, Math.min(1, levelSource() ?? 0)) : null;
      if (state === "listening") {
        const env = 0.45 + 0.45 * Math.sin(t * 5.1 + x * 0.32) * Math.sin(t * 1.7 + x * 0.11);
        const shaped =
          live === null ? Math.abs(env) : Math.max(0.04, live * (0.6 + 0.55 * Math.abs(env)));
        return Math.max(0.1, (0.2 + 0.8 * shaped) * (0.45 + 0.55 * centre));
      }
      if (state === "thinking") {
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 - x * 0.16);
        return 0.07 + 0.1 * pulse * (0.4 + centre);
      }
      const speech =
        Math.sin(t * 7.3 + x * 0.41) * 0.5 +
        Math.sin(t * 3.1 + x * 0.19) * 0.3 +
        Math.sin(t * 11.9 + x * 0.7) * 0.2;
      const gate = Math.sin(t * 1.35) > -0.35 ? 1 : 0.25;
      return Math.max(0.09, (0.32 + 0.68 * Math.abs(speech)) * gate * (0.5 + 0.5 * centre));
    };

    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      els.forEach((el, i) => {
        const next = target(i, t);
        const prev = smooth.current[i] ?? 0.1;
        const eased = prev + (next - prev) * (state === "thinking" ? 0.09 : 0.34);
        smooth.current[i] = eased;
        el.style.transform = `scaleY(${Math.min(1, Math.max(0.06, eased)).toFixed(3)})`;
        el.style.opacity = String(0.3 + Math.min(1, eased) * 0.62);
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, bars, mirrored, visible, levelSource]);

  return (
    <span
      ref={hostRef}
      aria-hidden="true"
      className={cn("flex h-full w-full items-center gap-[2px]", className)}
    >
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            nodes.current[i] = el;
          }}
          className="min-w-[2px] flex-1 rounded-full bg-current"
          style={{ height: "100%", transform: "scaleY(0.1)", transformOrigin: "center" }}
        />
      ))}
    </span>
  );
}
