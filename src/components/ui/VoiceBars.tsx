import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";

type VoiceBarsProps = {
  count?: number;
  /** 0 → silence, 1 → full speech */
  intensity?: number;
  className?: string;
  barClassName?: string;
  minScale?: number;
  rounded?: string;
};

const seeded = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * CSS-only voice amplitude bars — no canvas, no audio.
 * Animation is paused whenever the group is off-screen so the ~150 bars across the
 * page cost nothing while the user is reading another section.
 */
export function VoiceBars({
  count = 32,
  intensity = 0.6,
  className,
  barClassName,
  minScale = 0.14,
  rounded = "rounded-full",
}: VoiceBarsProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.02, rootMargin: "80px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const bars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const r = seeded(i + 1);
        const shape = minScale + r * (1 - minScale) * Math.max(intensity, 0.05);
        return {
          delay: `${(r * 900).toFixed(0)}ms`,
          duration: `${(520 + r * 620).toFixed(0)}ms`,
          scaleY: shape.toFixed(3),
        };
      }),
    [count, intensity, minScale]
  );

  const running = inView && intensity > 0.02;

  return (
    <div ref={ref} aria-hidden="true" className={cn("flex items-center gap-[3px]", className)}>
      {bars.map((bar, i) => (
        <span
          key={i}
          className={cn("flex-1 bg-current voicebar", rounded, barClassName)}
          style={{
            height: "100%",
            animationDelay: bar.delay,
            animationDuration: bar.duration,
            transform: `scaleY(${bar.scaleY})`,
            opacity: 0.35 + Number(bar.scaleY) * 0.65,
            animationPlayState: running ? "running" : "paused",
          }}
        />
      ))}
    </div>
  );
}
