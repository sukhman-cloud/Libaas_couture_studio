import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const sizes = {
  sm: "size-4",
  md: "size-6",
  lg: "size-9",
} as const;

export function Spinner({
  size = "md",
  label = "Loading",
  className,
}: {
  size?: keyof typeof sizes;
  label?: string;
  className?: string;
}) {
  return (
    <span role="status" className={cn("inline-flex", className)}>
      <Loader2 className={cn("animate-spin text-gold-600", sizes[size])} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
