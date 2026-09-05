"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Heading, Text } from "@/components/ui/typography";
import {
  createProduct,
  updateProduct,
  type CatalogFormState,
} from "@/lib/catalog/actions";
import {
  paiseToRupeeInput,
  slugify,
  suggestSku,
} from "@/lib/validation/catalog";
import type { Product } from "@/types/domain";

const initialState: CatalogFormState = {};

export interface CatalogOption {
  id: string;
  name: string;
}

export function ProductForm({
  product,
  categories,
  collections,
}: {
  product: Product | null;
  categories: CatalogOption[];
  collections: CatalogOption[];
}) {
  const action = product ? updateProduct : createProduct;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const { toast } = useToast();
  const lastState = useRef<CatalogFormState | null>(null);

  // Controlled fields: React does not re-apply a changed defaultValue to an
  // already-mounted input/select, so anything that must survive a failed
  // submit (and the form reset that follows) is held in state here.
  const [name, setName] = useState(state.values?.name ?? product?.name ?? "");
  const [sku, setSku] = useState(state.values?.sku ?? product?.sku ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? product?.slug ?? "");
  const [categoryId, setCategoryId] = useState(
    state.values?.categoryId ?? product?.categoryId ?? "",
  );
  const [status, setStatus] = useState(
    state.values?.status ?? product?.status ?? "draft",
  );
  const [availability, setAvailability] = useState(
    state.values?.availability ?? product?.availability ?? "made_to_order",
  );

  useEffect(() => {
    if (state.success && lastState.current !== state) {
      lastState.current = state;
      toast({ title: state.success, tone: "success" });
    }
  }, [state, toast]);

  const value = (key: string, fallback?: string) =>
    state.values?.[key] ?? fallback ?? "";

  // After a failed submit the action echoes every field (including
  // checkboxes, which send nothing when unchecked), so nothing is lost.
  const echoed = state.values?.__echo === "1";
  const checked = (key: string, fallback: boolean) =>
    echoed ? state.values?.[key] === "on" : fallback;
  const selectedCollectionIds = new Set(
    echoed
      ? (state.values?.collectionIds ?? "").split(",").filter(Boolean)
      : (product?.collectionIds ?? []),
  );

  return (
    <form
      action={formAction}
      className="space-y-5 pb-20 sm:pb-0"
      noValidate
    >
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {product && <input type="hidden" name="productId" value={product.id} />}

      {/* ── Basic information ── */}
      <Card>
        <CardContent className="space-y-4">
          <Heading level={3} className="text-lg">
            Basic information
          </Heading>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Product name"
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={state.fieldErrors?.name}
            />
            <div>
              <Input
                label="SKU"
                name="sku"
                required
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                error={state.fieldErrors?.sku}
                hint="Unique code for this product. Letters, numbers, . - _"
              />
              {!product && (
                <button
                  type="button"
                  className="mt-1.5 text-xs text-gold-700 underline-offset-4 hover:underline"
                  onClick={() =>
                    setSku(
                      suggestSku(
                        name || "item",
                        String(Date.now()).slice(-5),
                      ),
                    )
                  }
                >
                  Suggest a SKU from the name
                </button>
              )}
            </div>
          </div>

          <div>
            <Input
              label="Slug"
              name="slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              error={state.fieldErrors?.slug}
              hint={
                slug
                  ? `Customer URL will be /products/${slug}`
                  : "Leave blank to generate it from the name."
              }
            />
            {!slug && name && (
              <button
                type="button"
                className="mt-1.5 text-xs text-gold-700 underline-offset-4 hover:underline"
                onClick={() => setSlug(slugify(name))}
              >
                Use “{slugify(name)}”
              </button>
            )}
          </div>

          <Input
            label="Short description"
            name="shortDescription"
            defaultValue={value("shortDescription", product?.shortDescription)}
            error={state.fieldErrors?.shortDescription}
            hint="One line shown in listings (optional)."
          />
          <FormField label="Description" error={state.fieldErrors?.description}>
            <Textarea
              name="description"
              rows={5}
              defaultValue={value("description", product?.description)}
            />
          </FormField>
        </CardContent>
      </Card>

      {/* ── Classification ── */}
      <Card>
        <CardContent className="space-y-4">
          <Heading level={3} className="text-lg">
            Classification
          </Heading>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Category" error={state.fieldErrors?.categoryId}>
              <Select
                name="categoryId"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <Input
              label="Tags"
              name="tags"
              defaultValue={value("tags", product?.tags.join(", "))}
              error={state.fieldErrors?.tags}
              hint="Comma separated, e.g. festive, handmade"
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-medium uppercase tracking-widest text-gold-700">
              Collections
            </legend>
            {collections.length === 0 ? (
              <Text tone="muted" size="sm">
                No collections yet.{" "}
                <Link
                  href="/admin/collections"
                  className="text-gold-700 underline-offset-4 hover:underline"
                >
                  Create one
                </Link>{" "}
                to group products thematically.
              </Text>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {collections.map((collection) => (
                  <Checkbox
                    key={collection.id}
                    label={collection.name}
                    name="collectionIds"
                    value={collection.id}
                    defaultChecked={selectedCollectionIds.has(collection.id)}
                  />
                ))}
              </div>
            )}
          </fieldset>
        </CardContent>
      </Card>

      {/* ── Pricing ── */}
      <Card>
        <CardContent className="space-y-4">
          <Heading level={3} className="text-lg">
            Pricing
          </Heading>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Price (₹)"
              name="price"
              inputMode="decimal"
              required
              defaultValue={value(
                "price",
                product ? paiseToRupeeInput(product.price.amount) : "",
              )}
              error={state.fieldErrors?.price}
            />
            <Input
              label="Sale price (₹)"
              name="salePrice"
              inputMode="decimal"
              defaultValue={value(
                "salePrice",
                product ? paiseToRupeeInput(product.salePrice?.amount) : "",
              )}
              error={state.fieldErrors?.salePrice}
              hint="Optional. Must be lower than the price."
            />
            <FormField label="Currency" hint="INR only for now.">
              <Select name="currency" defaultValue="INR" disabled>
                <option value="INR">₹ INR</option>
              </Select>
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* ── Attributes ── */}
      <Card>
        <CardContent className="space-y-4">
          <Heading level={3} className="text-lg">
            Product attributes
          </Heading>
          <Text tone="muted" size="sm">
            All optional — fill only what applies to this piece.
          </Text>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Fabric"
              name="fabric"
              defaultValue={value("fabric", product?.attributes.fabric)}
              error={state.fieldErrors?.fabric}
            />
            <Input
              label="Colour"
              name="colour"
              defaultValue={value("colour", product?.attributes.colour)}
              error={state.fieldErrors?.colour}
            />
            <Input
              label="Occasion"
              name="occasion"
              defaultValue={value("occasion", product?.attributes.occasion)}
              error={state.fieldErrors?.occasion}
            />
            <Input
              label="Work / embroidery"
              name="work"
              defaultValue={value("work", product?.attributes.work)}
              error={state.fieldErrors?.work}
            />
            <Input
              label="Fit"
              name="fit"
              defaultValue={value("fit", product?.attributes.fit)}
              error={state.fieldErrors?.fit}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Services ── */}
      <Card>
        <CardContent className="space-y-4">
          <Heading level={3} className="text-lg">
            Services
          </Heading>
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox
              label="Stitching available"
              name="stitchingAvailable"
              defaultChecked={checked(
                "stitchingAvailable",
                product?.stitchingAvailable ?? false,
              )}
              description="Charges and measurement requirements come in a later phase."
            />
            <Checkbox
              label="Customization available"
              name="customizationAvailable"
              defaultChecked={checked(
                "customizationAvailable",
                product?.customizationAvailable ?? false,
              )}
              description="Customers will be able to request changes to this design."
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Publishing ── */}
      <Card>
        <CardContent className="space-y-4">
          <Heading level={3} className="text-lg">
            Publishing
          </Heading>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Status"
              error={state.fieldErrors?.status}
              hint="Only published products will appear in the customer shop."
            >
              <Select
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                {product?.status === "archived" && (
                  <option value="archived">Archived</option>
                )}
              </Select>
            </FormField>
            <FormField
              label="Availability"
              error={state.fieldErrors?.availability}
              hint="Separate from status — a published product can be out of stock."
            >
              <Select
                name="availability"
                value={availability}
                onChange={(event) => setAvailability(event.target.value)}
              >
                <option value="available">Available</option>
                <option value="made_to_order">Made to order</option>
                <option value="out_of_stock">Out of stock</option>
                <option value="discontinued">Discontinued</option>
              </Select>
            </FormField>
          </div>
          <Checkbox
            label="Featured product"
            name="isFeatured"
            defaultChecked={checked("isFeatured", product?.isFeatured ?? false)}
            description="Highlighted on the storefront once the shop is live."
          />
        </CardContent>
      </Card>

      {/* Mobile: sticky action bar so the primary action stays reachable
          without scrolling back up a long form. sm+: inline, static. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-cream-200 bg-cream-50/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:static sm:z-auto sm:flex-wrap sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button type="submit" isLoading={isPending} className="flex-1 sm:flex-none">
          {product ? "Save changes" : "Create product"}
        </Button>
        <Link
          href="/admin/products"
          className={buttonStyles({ variant: "ghost", className: "flex-1 sm:flex-none" })}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
