import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Optional call-to-action (e.g. a <Button> or a link). */
  action?: ReactNode;
  className?: string;
}

/** Consistent empty state for lists/pages with no data yet. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-navy-200 bg-white/60 px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-cream-100 text-gold-600">
          <Icon className="size-6" aria-hidden />
        </span>
      )}
      <h3 className="max-w-full wrap-break-word font-display text-xl font-semibold text-navy-800">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm wrap-break-word text-sm text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
