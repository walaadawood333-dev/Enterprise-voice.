import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/utils/cn";

type SmartImageProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Classes for the <img> itself (object-fit, filters, transforms). */
  className?: string;
  /** Classes for the sizing wrapper. */
  wrapperClassName?: string;
  eager?: boolean;
  /** Let the parent own the box (absolute inset-0 / flex-1) instead of reserving by ratio. */
  fill?: boolean;
};

/**
 * Lazy image with a reserved box (no layout shift), a shimmer while loading, and a
 * neutral fallback panel if the asset fails — instead of a broken image icon.
 */
export function SmartImage({
  src,
  alt,
  width,
  height,
  className,
  wrapperClassName,
  eager = false,
  fill = false,
}: SmartImageProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Cached images can finish before React attaches onLoad — recover from that.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setStatus("ready");
  }, [src]);

  return (
    <div
      className={cn("relative overflow-hidden bg-mist", wrapperClassName)}
      style={fill ? undefined : { aspectRatio: `${width} / ${height}` }}
    >
      {status === "loading" ? (
        <div aria-hidden="true" className="shimmer absolute inset-0" />
      ) : null}

      {status === "error" ? (
        <div
          role="img"
          aria-label={alt}
          className="absolute inset-0 grid place-items-center bg-mist px-4 text-center"
        >
          <span className="flex flex-col items-center gap-2 text-black/40">
            <ImageOff size={18} />
            <span className="text-[11px] leading-snug">Imagery unavailable offline</span>
          </span>
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
          className={cn(
            "h-full w-full transition-opacity duration-700 ease-smooth",
            status === "ready" ? "opacity-100" : "opacity-0",
            className
          )}
        />
      )}
    </div>
  );
}
