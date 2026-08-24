import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Caption } from "@/components/ui/typography";
import { SORT_OPTIONS } from "@/lib/catalog/shop-params";

/**
 * Result count + sorting, as a plain GET form (works without JavaScript and
 * keeps every state shareable in the URL).
 *
 * Phase 4C filter controls slot into the same form: add the field here and
 * its param to FILTER_PARAMS — no page changes needed.
 */
export function CatalogToolbar({
  basePath,
  active,
  sortValue,
  total,
  hasFilters,
}: {
  basePath: string;
  /** Currently active params, preserved across a sort change. */
  active: Record<string, string>;
  sortValue: string;
  total: number;
  hasFilters: boolean;
}) {
  // Everything except sort/page rides along as hidden fields.
  const carried = Object.entries(active).filter(
    ([key]) => key !== "sort" && key !== "page",
  );

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <Caption aria-live="polite">
        {total} {total === 1 ? "piece" : "pieces"}
      </Caption>

      <form
        method="get"
        action={basePath}
        className="flex items-end gap-2"
      >
        {carried.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <FormField label="Sort by" className="w-48">
          <Select name="sort" defaultValue={sortValue}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>
        <button type="submit" className={buttonStyles({ size: "sm" })}>
          Apply
        </button>
        {hasFilters && (
          <Link
            href={basePath}
            className={buttonStyles({ variant: "ghost", size: "sm" })}
          >
            Reset
          </Link>
        )}
      </form>
    </div>
  );
}
