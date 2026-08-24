import { Skeleton } from "@/components/ui/skeleton";

/**
 * Account-area skeleton.
 *
 * Note: this lives on the account segment rather than the whole customer
 * group on purpose. A loading boundary starts streaming immediately, which
 * locks the HTTP status at 200 — so catalog routes that can legitimately
 * 404 (products, categories, collections) must not sit under one.
 */
export default function AccountLoading() {
  return (
    <div>
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-3 h-4 w-72" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
