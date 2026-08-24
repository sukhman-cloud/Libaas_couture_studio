import {
  ProductCard,
  type ProductCardData,
} from "@/components/catalog/product-card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Responsive catalog grid: 2 columns on phones (readable at 360px),
 * 3 on tablets, 4 on desktop. The page container caps the width, so cards
 * never stretch on large screens.
 */
const GRID_CLASSES =
  "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 lg:gap-x-6";

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <ul className={GRID_CLASSES}>
      {products.map((product, index) => (
        <li key={product.slug} className="min-w-0">
          {/* First row loads eagerly; the rest lazy-load. */}
          <ProductCard product={product} priority={index < 4} />
        </li>
      ))}
    </ul>
  );
}

/** Same geometry as the grid, so the layout does not shift when data lands. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID_CLASSES} aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index}>
          <Skeleton className="aspect-3/4 w-full rounded-2xl" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
