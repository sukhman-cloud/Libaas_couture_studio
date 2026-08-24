import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Retry / recovery action (e.g. a <Button onClick={reset}>). */
  action?: ReactNode;
  className?: string;
}

/** Consistent error block for failed loads. Pair with a retry action. */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this right now. Please try again.",
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-danger/25 bg-danger/5 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h3 className="max-w-full wrap-break-word font-display text-xl font-semibold text-navy-800">
        {title}
      </h3>
      <p className="mt-1.5 max-w-sm wrap-break-word text-sm text-muted">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
