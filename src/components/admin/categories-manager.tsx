"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import { StatusBadge } from "@/components/admin/catalog-badges";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
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
import { Caption, Heading } from "@/components/ui/typography";
import {
  archiveCategory,
  restoreCategory,
  saveCategory,
  type CatalogFormState,
} from "@/lib/catalog/actions";
import type { Category } from "@/types/domain";

const initialState: CatalogFormState = {};

function CategoryForm({
  category,
  parents,
  onDone,
}: {
  category: Category | null;
  parents: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    saveCategory,
    initialState,
  );
  const { toast } = useToast();
  const lastState = useRef<CatalogFormState | null>(null);
  // Selects must be controlled: React ignores a changed defaultValue on an
  // already-mounted select, so an echoed value would not survive the reset
  // that follows a failed submit.
  const [parentId, setParentId] = useState(
    state.values?.parentId ?? category?.parentId ?? "",
  );
  const [status, setStatus] = useState(
    state.values?.status ?? category?.status ?? "draft",
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
          {category ? "Edit category" : "New category"}
        </Heading>
        <form action={formAction} className="space-y-4" noValidate>
          {state.error && <Alert tone="danger">{state.error}</Alert>}
          {category && (
            <input type="hidden" name="categoryId" value={category.id} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              name="name"
              required
              defaultValue={value("name", category?.name)}
              error={state.fieldErrors?.name}
            />
            <Input
              label="Slug"
              name="slug"
              defaultValue={value("slug", category?.slug)}
              error={state.fieldErrors?.slug}
              hint="Leave blank to generate from the name."
            />
          </div>

          <FormField label="Description" error={state.fieldErrors?.description}>
            <Textarea
              name="description"
              rows={2}
              defaultValue={value("description", category?.description)}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              label="Parent category"
              error={state.fieldErrors?.parentId}
              hint="Optional — for future sub-categories."
            >
              <Select
                name="parentId"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">None (top level)</option>
                {parents
                  .filter((parent) => parent.id !== category?.id)
                  .map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.name}
                    </option>
                  ))}
              </Select>
            </FormField>
            <Input
              label="Sort order"
              name="sortOrder"
              inputMode="numeric"
              defaultValue={value("sortOrder", category?.sortOrder ?? 0)}
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
                {category?.status === "archived" && (
                  <option value="archived">Archived</option>
                )}
              </Select>
            </FormField>
          </div>

          <div className="flex gap-3">
            <Button type="submit" isLoading={isPending}>
              {category ? "Save category" : "Create category"}
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

export function CategoriesManager({
  categories,
}: {
  categories: Category[];
}) {
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const names = new Map(categories.map((c) => [c.id, c.name]));
  const editingCategory =
    editing && editing !== "new"
      ? (categories.find((c) => c.id === editing) ?? null)
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
      {categories.length > 0 && (
        <>
          {/* Mobile: stacked cards. sm+: table. Same data and actions. */}
          <RowCardList>
            {categories.map((category) => (
              <RowCard key={category.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block wrap-break-word font-medium text-navy-800">
                      {category.name}
                    </span>
                    <Caption className="block wrap-break-word">
                      /{category.slug}
                    </Caption>
                  </div>
                  <StatusBadge status={category.status} />
                </div>
                <div className="mt-3 space-y-1 border-t border-cream-200 pt-3">
                  <RowCardField label="Parent">
                    {category.parentId ? (names.get(category.parentId) ?? "—") : "—"}
                  </RowCardField>
                  <RowCardField label="Sort">{category.sortOrder}</RowCardField>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-end gap-1 border-t border-cream-200 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(category.id)}
                    disabled={isPending}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Edit
                  </Button>
                  {category.status === "archived" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => run(() => restoreCategory(category.id))}
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
                      onClick={() => setArchiveTarget(category)}
                      disabled={isPending}
                    >
                      <Archive className="size-3.5" aria-hidden />
                      Archive
                    </Button>
                  )}
                </div>
              </RowCard>
            ))}
          </RowCardList>

          <Table wrapperClassName="hidden sm:block">
            <THead>
              <TR>
                <TH>Category</TH>
                <TH>Parent</TH>
                <TH>Sort</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {categories.map((category) => (
                <TR key={category.id}>
                  <TD className="min-w-0">
                    <span className="block wrap-break-word font-medium text-navy-800">
                      {category.name}
                    </span>
                    <Caption className="block wrap-break-word">
                      /{category.slug}
                    </Caption>
                  </TD>
                  <TD className="text-muted">
                    {category.parentId ? (names.get(category.parentId) ?? "—") : "—"}
                  </TD>
                  <TD className="tabular-nums text-muted">{category.sortOrder}</TD>
                  <TD>
                    <StatusBadge status={category.status} />
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(category.id)}
                        disabled={isPending}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                        Edit
                      </Button>
                      {category.status === "archived" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => run(() => restoreCategory(category.id))}
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
                          onClick={() => setArchiveTarget(category)}
                          disabled={isPending}
                        >
                          <Archive className="size-3.5" aria-hidden />
                          Archive
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}

      {editing !== null ? (
        <CategoryForm
          key={editing}
          category={editingCategory}
          parents={categories
            .filter((c) => c.status !== "archived")
            .map((c) => ({ id: c.id, name: c.name }))}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          New category
        </Button>
      )}

      <ConfirmationDialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => {
          if (archiveTarget) {
            run(() => archiveCategory(archiveTarget.id));
            setArchiveTarget(null);
          }
        }}
        title="Archive this category?"
        description={
          archiveTarget
            ? `“${archiveTarget.name}” will be hidden from the catalog and can no longer be assigned to products. Existing products keep their reference and nothing is deleted.`
            : ""
        }
        confirmLabel="Archive"
        destructive
        isConfirming={isPending}
      />
    </div>
  );
}
