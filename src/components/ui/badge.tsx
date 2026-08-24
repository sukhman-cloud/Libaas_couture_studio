import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "gold" | "navy" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-cream-100 text-muted",
  gold: "bg-gold-100 text-gold-700",
  navy: "bg-navy-50 text-navy-700",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-widest",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
