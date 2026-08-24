import { buttonStyles } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Heading } from "@/components/ui/typography";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_VALUES,
  paiseToRupees,
  type CatalogFilterParams,
} from "@/lib/catalog/shop-params";
import type { CatalogFacets } from "@/server/data/repositories";
import type { Category, Collection } from "@/types/domain";

/**
 * The filter form — one implementation rendered twice (desktop panel and
 * mobile drawer). A plain GET form, so filters work without JavaScript,
 * land in the URL and survive refresh/back/forward/sharing.
 *
 * `page` is deliberately not carried: changing filters resets to page 1.
 */
export interface FilterFormProps {
  basePath: string;
  filters: CatalogFilterParams;
  facets: CatalogFacets;
  categories: Category[];
  collections: Collection[];
  /** Hide the category/collection selects on their own listing pages. */
  hideCategory?: boolean;
  hideCollection?: boolean;
  /** Rendered inside the form so sort survives a filter change. */
  sortValue?: string;
  idPrefix: string;
}

function AttributeSelect({
  label,
  name,
  value,
  options,
  id,
}: {
  label: string;
  name: string;
  value: string | undefined;
  options: string[];
  id: string;
}) {
  if (options.length === 0) return null;
  return (
    <FormField label={label} fieldId={id}>
      <Select name={name} defaultValue={value ?? ""} id={id}>
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

export function FilterForm({
  basePath,
  filters,
  facets,
  categories,
  collections,
  hideCategory = false,
  hideCollection = false,
  sortValue,
  idPrefix,
}: FilterFormProps) {
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <form method="get" action={basePath} className="space-y-5">
      {/* Sorting rides along so changing a filter keeps the chosen order. */}
      {sortValue && <input type="hidden" name="sort" value={sortValue} />}
      {filters.q && <input type="hidden" name="q" value={filters.q} />}

      {!hideCategory && categories.length > 0 && (
        <FormField label="Category" fieldId={id("category")}>
          <Select
            name="category"
            id={id("category")}
            defaultValue={filters.category ?? ""}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      {!hideCollection && collections.length > 0 && (
        <FormField label="Collection" fieldId={id("collection")}>
          <Select
            name="collection"
            id={id("collection")}
            defaultValue={filters.collection ?? ""}
          >
            <option value="">All collections</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.slug}>
                {collection.name}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      <fieldset>
        <legend className="mb-2 text-xs font-medium uppercase tracking-widest text-gold-700">
          Price (₹)
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Min"
            name="minPrice"
            id={id("minPrice")}
            inputMode="decimal"
            placeholder={
              facets.priceRange ? paiseToRupees(facets.priceRange.min) : "0"
            }
            defaultValue={paiseToRupees(filters.minPrice)}
          />
          <Input
            label="Max"
            name="maxPrice"
            id={id("maxPrice")}
            inputMode="decimal"
            placeholder={
              facets.priceRange ? paiseToRupees(facets.priceRange.max) : ""
            }
            defaultValue={paiseToRupees(filters.maxPrice)}
          />
        </div>
      </fieldset>

      <AttributeSelect
        label="Fabric"
        name="fabric"
        id={id("fabric")}
        value={filters.fabric}
        options={facets.fabrics}
      />
      <AttributeSelect
        label="Colour"
        name="colour"
        id={id("colour")}
        value={filters.colour}
        options={facets.colours}
      />
      <AttributeSelect
        label="Occasion"
        name="occasion"
        id={id("occasion")}
        value={filters.occasion}
        options={facets.occasions}
      />
      <AttributeSelect
        label="Work / embroidery"
        name="work"
        id={id("work")}
        value={filters.work}
        options={facets.works}
      />

      {facets.availabilities.length > 0 && (
        <FormField label="Availability" fieldId={id("availability")}>
          <Select
            name="availability"
            id={id("availability")}
            defaultValue={filters.availability ?? ""}
          >
            <option value="">Any</option>
            {AVAILABILITY_VALUES.filter((value) =>
              facets.availabilities.includes(value),
            ).map((value) => (
              <option key={value} value={value}>
                {AVAILABILITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      <div className="space-y-4">
        <Heading level={4} className="text-sm">
          Services
        </Heading>
        <FormField label="Stitching" fieldId={id("stitching")}>
          <Select
            name="stitching"
            id={id("stitching")}
            defaultValue={filters.stitching ?? ""}
          >
            <option value="">Any</option>
            <option value="yes">Stitching available</option>
            <option value="no">No stitching</option>
          </Select>
        </FormField>
        <FormField label="Customisation" fieldId={id("customization")}>
          <Select
            name="customization"
            id={id("customization")}
            defaultValue={filters.customization ?? ""}
          >
            <option value="">Any</option>
            <option value="yes">Customisable</option>
            <option value="no">Not customisable</option>
          </Select>
        </FormField>
      </div>

      <button type="submit" className={buttonStyles({ className: "w-full" })}>
        Apply filters
      </button>
    </form>
  );
}
