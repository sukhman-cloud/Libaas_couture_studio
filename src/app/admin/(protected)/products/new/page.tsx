import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/product-form";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminSession } from "@/lib/auth/admin-guard";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Admin · New product" };

export default async function NewProductPage() {
  await requireAdminSession();

  const repos = getRepositories();
  const [categories, collections] = await Promise.all([
    repos.categories.query({ excludeArchived: true, limit: 200 }),
    repos.collections.query({ excludeArchived: true, limit: 200 }),
  ]);

  return (
    <div>
      <PageHeader
        title="New product"
        description="Create a catalog entry. It stays a draft until you publish it."
      />
      <Alert tone="info" className="mb-5">
        Images can be added after the product is created.
      </Alert>
      <ProductForm
        product={null}
        categories={categories.rows.map((c) => ({ id: c.id, name: c.name }))}
        collections={collections.rows.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
