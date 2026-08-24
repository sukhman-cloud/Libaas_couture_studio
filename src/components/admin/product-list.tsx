"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Archive, ChevronLeft, ChevronRight, Pencil, RotateCcw } from "lucide-react";
import {
  AvailabilityBadge,
  StatusBadge,
} from "@/components/admin/catalog-badges";
import { Button, buttonStyles } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { Caption } from "@/components/ui/typography";
import {
  archiveProduct,
  archiveProducts,
  restoreProduct,
  type CatalogFormState,
} from "@/lib/catalog/actions";
import { cn, formatPrice } from "@/lib/utils";
import type { Product } from "@/types/domain";

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  price: Product["price"];
  salePrice?: Product["salePrice"];
  status: Product["status"];
  availability: Product["availability"];
  categoryName?: string;
  updatedAt: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Product table with a selection column, so bulk actions can grow without
 * restructuring the list. Pagination hrefs preserve the active filters.
 */
export function ProductList({
  products,
  page,
  pageCount,
  query,
}: {
  products: ProductRow[];
  page: number;
  pageCount: number;
  /** Current filter params, preserved across pagination links. */
  query: Record<string, string>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<
    { kind: "one"; product: ProductRow } | { kind: "bulk" } | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const selectableIds = useMemo(
    () => products.filter((p) => p.status !== "archived").map((p) => p.id),
    [products],
  );
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function hrefForPage(target: number) {
    const params = new URLSearchParams(query);
    params.set("page", String(target));
    return `/admin/products?${params.toString()}`;
  }

  function run(action: () => Promise<CatalogFormState>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast({ title: result.error, tone: "danger" });
      else if (result.success) {
        toast({ title: result.success, tone: "success" });
        setSelected(new Set());
      }
    });
  }

  return (
    <div className="space-y-4">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
          <Caption>
            {selected.size} selected
          </Caption>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set())}
              disabled={isPending}
            >
              Clear
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirm({ kind: "bulk" })}
              disabled={isPending}
            >
              <Archive className="size-3.5" aria-hidden />
              Archive selected
            </Button>
          </div>
        </div>
      )}

      <Table>
        <THead>
          <TR>
            <TH className="w-10">
              <Checkbox
                label=""
                aria-label="Select all products on this page"
                checked={allSelected}
                onChange={(event) =>
                  setSelected(
                    event.target.checked ? new Set(selectableIds) : new Set(),
                  )
                }
              />
            </TH>
            <TH>Product</TH>
            <TH>Price</TH>
            <TH>Status</TH>
            <TH>Availability</TH>
            <TH>Category</TH>
            <TH>Updated</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {products.map((product) => {
            const archived = product.status === "archived";
            return (
              <TR key={product.id} className={cn(archived && "opacity-70")}>
                <TD>
                  <Checkbox
                    label=""
                    aria-label={`Select ${product.name}`}
                    disabled={archived}
                    checked={selected.has(product.id)}
                    onChange={(event) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (event.target.checked) next.add(product.id);
                        else next.delete(product.id);
                        return next;
                      })
                    }
                  />
                </TD>
                <TD>
                  <Link
                    href={`/admin/products/${product.id}/edit`}
                    className="font-medium text-navy-800 underline-offset-4 hover:underline"
                  >
                    {product.name}
                  </Link>
                  <Caption className="block">{product.sku}</Caption>
                </TD>
                <TD className="whitespace-nowrap tabular-nums">
                  {product.salePrice ? (
                    <>
                      <span className="font-medium">
                        {formatPrice(product.salePrice.amount, product.salePrice.currency)}
                      </span>
                      <Caption className="ml-1.5 line-through">
                        {formatPrice(product.price.amount, product.price.currency)}
                      </Caption>
                    </>
                  ) : (
                    formatPrice(product.price.amount, product.price.currency)
                  )}
                </TD>
                <TD>
                  <StatusBadge status={product.status} />
                </TD>
                <TD>
                  <AvailabilityBadge availability={product.availability} />
                </TD>
                <TD className="whitespace-nowrap text-muted">
                  {product.categoryName ?? "—"}
                </TD>
                <TD className="whitespace-nowrap text-muted">
                  {formatDate(product.updatedAt)}
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className={buttonStyles({ variant: "ghost", size: "sm" })}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Edit
                    </Link>
                    {archived ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => run(() => restoreProduct(product.id))}
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger/10"
                        disabled={isPending}
                        onClick={() => setConfirm({ kind: "one", product })}
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

      {pageCount > 1 && (
        <nav
          aria-label="Pagination"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <Caption>
            Page {page} of {pageCount}
          </Caption>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={hrefForPage(page - 1)}
                className={buttonStyles({ variant: "outline", size: "sm" })}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Previous
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={hrefForPage(page + 1)}
                className={buttonStyles({ variant: "outline", size: "sm" })}
              >
                Next
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            )}
          </div>
        </nav>
      )}

      <ConfirmationDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "one") {
            run(() => archiveProduct(confirm.product.id));
          } else {
            run(() => archiveProducts([...selected]));
          }
          setConfirm(null);
        }}
        title={
          confirm?.kind === "bulk"
            ? `Archive ${selected.size} product${selected.size === 1 ? "" : "s"}?`
            : "Archive this product?"
        }
        description={
          confirm?.kind === "bulk"
            ? "Archived products are hidden from the active catalog and will not appear in the customer shop. Nothing is deleted — they stay available for order history and can be restored as drafts."
            : `“${confirm?.kind === "one" ? confirm.product.name : ""}” will be hidden from the active catalog and the future customer shop. Nothing is deleted — it stays available for order history and can be restored as a draft.`
        }
        confirmLabel="Archive"
        destructive
        isConfirming={isPending}
      />
    </div>
  );
}
