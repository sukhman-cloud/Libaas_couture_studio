import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Centered loading block for regions that are fetching. */
export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-cream-200 bg-surface/60 px-6 py-14 text-center",
        className,
      )}
    >
      <Spinner size="lg" label={label} />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
