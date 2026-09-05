"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Archive, Pencil, Plus, RotateCcw, Settings2 } from "lucide-react";
import { StatusBadge } from "@/components/admin/catalog-badges";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Drawer } from "@/components/ui/drawer";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  RowCard,
  RowCardField,
  RowCardList,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Caption, Heading, Text } from "@/components/ui/typography";
import {
  archiveCollection,
  restoreCollection,
  saveCollection,
  setProductCollectionMembership,
  type CatalogFormState,
} from "@/lib/catalog/actions";
import type { Collection } from "@/types/domain";

const initialState: CatalogFormState = {};

export interface AssignableProduct {
  id: string;
  name: string;
  sku: string;
  collectionIds: string[];
}

function CollectionForm({
  collection,
  onDone,
}: {
  collection: Collection | null;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    saveCollection,
    initialState,
  );
  const { toast } = useToast();
  const lastState = useRef<CatalogFormState | null>(null);
  // Controlled: React ignores a changed defaultValue on a mounted select.
  const [status, setStatus] = useState(
    state.values?.status ?? collection?.status ?? "draft",
  );

  useEffect(() => {
    if (state.success && lastState.current !== state) {
      lastState.current = state;
      toast({ title: state.success, tone: "success" });
      onDone();
    }
  }, [state, toast, onDone]);

  const value = (key: string, fallback?: string | number) =>
    state.values?.[key] ?? (fallback === undefined ? "" : String(fallback));

  return (
    <Card>
      <CardContent className="space-y-4">
        <Heading level={3} className="text-lg">
          {collection ? "Edit collection" : "New collection"}
        </Heading>
        <form action={formAction} className="space-y-4" noValidate>
          {state.error && <Alert tone="danger">{state.error}</Alert>}
          {collection && (
            <input type="hidden" name="collectionId" value={collection.id} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              name="name"
              required
              defaultValue={value("name", collection?.name)}
              error={state.fieldErrors?.name}
            />
            <Input
              label="Slug"
              name="slug"
              defaultValue={value("slug", collection?.slug)}
              error={state.fieldErrors?.slug}
              hint="Leave blank to generate from the name."
            />
          </div>

          <FormField label="Description" error={state.fieldErrors?.description}>
            <Textarea
              name="description"
              rows={2}
              defaultValue={value("description", collection?.description)}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Sort order"
              name="sortOrder"
              inputMode="numeric"
              defaultValue={value("sortOrder", collection?.sortOrder ?? 0)}
              error={state.fieldErrors?.sortOrder}
            />
            <FormField label="Status" error={state.fieldErrors?.status}>
              <Select
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                {collection?.status === "archived" && (
                  <option value="archived">Archived</option>
                )}
              </Select>
            </FormField>
          </div>

          <div className="flex gap-3">
            <Button type="submit" isLoading={isPending}>
              {collection ? "Save collection" : "Create collection"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onDone}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function CollectionsManager({
  collections,
  products,
  productCounts,
}: {
  collections: Collection[];
  /** Recent non-archived products, for quick assignment. */
  products: AssignableProduct[];
  /** Real membership totals per collection (not derived from the page above). */
  productCounts: Record<string, number>;
}) {
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Collection | null>(null);
  const [assignTarget, setAssignTarget] = useState<Collection | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const editingCollection =
    editing && editing !== "new"
      ? (collections.find((c) => c.id === editing) ?? null)
      : null;

  function run(action: () => Promise<CatalogFormState>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast({ title: result.error, tone: "danger" });
      else if (result.success) toast({ title: result.success, tone: "success" });
    });
  }

  return (
    <div className="space-y-4">
      {collections.length > 0 && (
        <>
          {/* Mobile: stacked cards. sm+: table. Same data and actions. */}
          <RowCardList>
            {collections.map((collection) => {
              const count = productCounts[collection.id] ?? 0;
              return (
                <RowCard key={collection.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block wrap-break-word font-medium text-navy-800">
                        {collection.name}
                      </span>
                      <Caption className="block wrap-break-word">
                        /{collection.slug}
                      </Caption>
                    </div>
                    <StatusBadge status={collection.status} />
                  </div>
                  <div className="mt-3 space-y-1 border-t border-cream-200 pt-3">
                    <RowCardField label="Products">{count}</RowCardField>
                    <RowCardField label="Sort">{collection.sortOrder}</RowCardField>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-1 border-t border-cream-200 pt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAssignTarget(collection)}
                      disabled={isPending || collection.status === "archived"}
                    >
                      <Settings2 className="size-3.5" aria-hidden />
                      Products
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(collection.id)}
                      disabled={isPending}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Edit
                    </Button>
                    {collection.status === "archived" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => run(() => restoreCollection(collection.id))}
                        disabled={isPending}
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger/10"
                        onClick={() => setArchiveTarget(collection)}
                        disabled={isPending}
                      >
                        <Archive className="size-3.5" aria-hidden />
                        Archive
                      </Button>
                    )}
                  </div>
                </RowCard>
              );
            })}
          </RowCardList>

          <Table wrapperClassName="hidden sm:block">
            <THead>
              <TR>
                <TH>Collection</TH>
                <TH>Products</TH>
                <TH>Sort</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {collections.map((collection) => {
                const count = productCounts[collection.id] ?? 0;
                return (
                  <TR key={collection.id}>
                    <TD className="min-w-0">
                      <span className="block wrap-break-word font-medium text-navy-800">
                        {collection.name}
                      </span>
                      <Caption className="block wrap-break-word">
                        /{collection.slug}
                      </Caption>
                    </TD>
                    <TD className="tabular-nums text-muted">{count}</TD>
                    <TD className="tabular-nums text-muted">
                      {collection.sortOrder}
                    </TD>
                    <TD>
                      <StatusBadge status={collection.status} />
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAssignTarget(collection)}
                          disabled={isPending || collection.status === "archived"}
                        >
                          <Settings2 className="size-3.5" aria-hidden />
                          Products
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(collection.id)}
                          disabled={isPending}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                          Edit
                        </Button>
                        {collection.status === "archived" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => run(() => restoreCollection(collection.id))}
                            disabled={isPending}
                          >
                            <RotateCcw className="size-3.5" aria-hidden />
                            Restore
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger/10"
                            onClick={() => setArchiveTarget(collection)}
                            disabled={isPending}
                          >
                            <Archive className="size-3.5" aria-hidden />
                            Archive
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </>
      )}

      {editing !== null ? (
        <CollectionForm
          key={editing}
          collection={editingCollection}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          New collection
        </Button>
      )}

      {/* Product assignment */}
      <Drawer
        open={assignTarget !== null}
        onClose={() => setAssignTarget(null)}
        title={assignTarget ? `Products in ${assignTarget.name}` : "Products"}
      >
        {products.length === 0 ? (
          <Text tone="muted" size="sm">
            No products yet. Create products first, then assign them here.
          </Text>
        ) : (
          <>
          <Text tone="muted" size="sm" className="mb-3">
            Showing the {products.length} most recently updated products. Use
            the collection filter on the Products screen to see the full list.
          </Text>
          {/* Keyed by collection so the uncontrolled checkboxes remount and
              never show the previously opened collection's membership. */}
          <ul key={assignTarget?.id ?? "none"} className="space-y-3">
            {products.map((product) => (
              <li key={product.id}>
                <Checkbox
                  label={product.name}
                  description={product.sku}
                  disabled={isPending}
                  defaultChecked={
                    assignTarget
                      ? product.collectionIds.includes(assignTarget.id)
                      : false
                  }
                  onChange={(event) => {
                    if (!assignTarget) return;
                    const member = event.target.checked;
                    run(() =>
                      setProductCollectionMembership(
                        product.id,
                        assignTarget.id,
                        member,
                      ),
                    );
                  }}
                />
              </li>
            ))}
          </ul>
          </>
        )}
      </Drawer>

      <ConfirmationDialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => {
          if (archiveTarget) {
            run(() => archiveCollection(archiveTarget.id));
            setArchiveTarget(null);
          }
        }}
        title="Archive this collection?"
        description={
          archiveTarget
            ? `“${archiveTarget.name}” will be hidden and can no longer be assigned to products. Products keep their other collections and nothing is deleted.`
            : ""
        }
        confirmLabel="Archive"
        destructive
        isConfirming={isPending}
      />
    </div>
  );
}
