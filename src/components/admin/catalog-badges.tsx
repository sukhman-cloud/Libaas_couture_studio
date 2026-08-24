import { Badge } from "@/components/ui/badge";
import type { CatalogStatus, ProductAvailability } from "@/types/domain";

/**
 * Status and availability are separate concepts and are always rendered as
 * separate badges — a product can be Published + Out of stock.
 */

const statusTone: Record<CatalogStatus, "success" | "neutral" | "warning"> = {
  published: "success",
  draft: "neutral",
  archived: "warning",
};

const statusLabel: Record<CatalogStatus, string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};

export function StatusBadge({ status }: { status: CatalogStatus }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
}

const availabilityLabel: Record<ProductAvailability, string> = {
  available: "Available",
  made_to_order: "Made to order",
  out_of_stock: "Out of stock",
  discontinued: "Discontinued",
};

const availabilityTone: Record<
  ProductAvailability,
  "navy" | "gold" | "danger" | "neutral"
> = {
  available: "navy",
  made_to_order: "gold",
  out_of_stock: "danger",
  discontinued: "neutral",
};

export function AvailabilityBadge({
  availability,
}: {
  availability: ProductAvailability;
}) {
  return (
    <Badge tone={availabilityTone[availability]}>
      {availabilityLabel[availability]}
    </Badge>
  );
}

export { statusLabel, availabilityLabel };
