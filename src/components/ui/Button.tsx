import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

type Variant = "ink" | "outline" | "onDark" | "outlineDark" | "ghost";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  ink: "bg-ink text-paper hover:shadow-[0_14px_34px_-16px_rgba(0,0,0,0.8)]",
  outline: "border border-hair text-ink hover:bg-mist hover:border-ink/25",
  onDark: "bg-paper text-ink hover:bg-white/90",
  outlineDark: "border border-white/25 text-paper hover:bg-white/10 hover:border-white/45",
  ghost: "text-ink hover:text-ink/70",
};

const sizes: Record<Size, string> = {
  sm: "px-4 py-1.5 text-sm",
  md: "px-6 py-2.5 text-base",
  lg: "px-8 py-3 text-base md:text-lg",
};

type BaseProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  iconRight?: ReactNode;
};

export function buttonClass({
  variant = "ink",
  size = "md",
  className,
}: Pick<BaseProps, "variant" | "size" | "className">) {
  return cn(
    "btn-primary inline-flex items-center justify-center gap-2 rounded-full font-display font-semibold tracking-tight whitespace-nowrap cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-55",
    variants[variant],
    sizes[size],
    className
  );
}

type ButtonProps = BaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { type?: "button" | "submit" };

export function Button({
  variant,
  size,
  className,
  children,
  iconRight,
  ...rest
}: ButtonProps) {
  return (
    <button {...rest} className={buttonClass({ variant, size, className })}>
      {children}
      {iconRight}
    </button>
  );
}

/** Anchor flavour of the same pill, for in-page or mailto links. */
export function LinkButton({
  variant,
  size,
  className,
  children,
  iconRight,
  ...rest
}: BaseProps & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} className={buttonClass({ variant, size, className })}>
      {children}
      {iconRight}
    </a>
  );
}
