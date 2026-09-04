import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Boxes } from "lucide-react";
import {
  AvailabilityBadge,
  StatusBadge,
} from "@/components/admin/catalog-badges";
import { ProductForm } from "@/components/admin/product-form";
import { ProductMediaManager } from "@/components/admin/product-media-manager";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Row } from "@/components/ui/layout";
import { requireAdminSession } from "@/lib/auth/admin-guard";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Admin · Edit product" };

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await requireAdminSession();

  const { id } = await params;
  const { created } = await searchParams;

  const repos = getRepositories();
  const product = await repos.products.getById(id);
  if (!product) notFound();

  const [categories, collections] = await Promise.all([
    repos.categories.query({ excludeArchived: true, limit: 200 }),
    repos.collections.query({ excludeArchived: true, limit: 200 }),
  ]);

  // Keep an archived product's own category/collection selectable so editing
  // it does not silently drop associations.
  const categoryOptions = categories.rows.map((c) => ({
    id: c.id,
    name: c.name,
  }));
  if (
    product.categoryId &&
    !categoryOptions.some((c) => c.id === product.categoryId)
  ) {
    const current = await repos.categories.getById(product.categoryId);
    if (current) {
      categoryOptions.push({ id: current.id, name: `${current.name} (archived)` });
    }
  }

  return (
    <div>
      <PageHeader
        title={product.name}
        description={`SKU ${product.sku} · /products/${product.slug}`}
        actions={
          <Row gap="xs" wrap={false}>
            <StatusBadge status={product.status} />
            <AvailabilityBadge availability={product.availability} />
            <Link
              href={`/admin/inventory/${product.id}`}
              className={buttonStyles({ variant: "outline", size: "sm" })}
            >
              <Boxes className="size-4" aria-hidden />
              Inventory
            </Link>
          </Row>
        }
      />

      {created === "1" && (
        <Alert tone="success" className="mb-5">
          Product created. Add images below, then publish when it is ready.
        </Alert>
      )}
      {product.status === "archived" && (
        <Alert tone="warning" className="mb-5" title="This product is archived">
          It is hidden from the active catalog. Restore it from the product
          list to continue selling it.
        </Alert>
      )}

      <div className="space-y-5">
        <ProductForm
          product={product}
          categories={categoryOptions}
          collections={collections.rows.map((c) => ({ id: c.id, name: c.name }))}
        />
        <ProductMediaManager productId={product.id} media={product.media} />
      </div>
    </div>
  );
}
