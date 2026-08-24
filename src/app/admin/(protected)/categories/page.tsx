import type { Metadata } from "next";
import Link from "next/link";
import { FolderTree, Search } from "lucide-react";
import { CategoriesManager } from "@/components/admin/categories-manager";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { requireAdminSession } from "@/lib/auth/admin-guard";
import { getRepositories } from "@/server/data";

export const metadata: Metadata = { title: "Admin · Categories" };

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdminSession();

  const { q } = await searchParams;
  const search = q?.trim() ?? "";

  const repos = getRepositories();
  // The query includes archived rows, so archiving everything never hides
  // the list behind the empty state (archived rows stay restorable).
  const result = await repos.categories.query({
    search: search || undefined,
    limit: 200,
  });

  return (
    <div>
      <PageHeader
        title="Categories"
        description="What a product is — the classification customers browse by."
      />

      {result.total === 0 && !search ? (
        <div className="space-y-5">
          <EmptyState
            icon={FolderTree}
            title="No categories yet"
            description="Create categories such as the garment types this studio makes. Nothing is shown to customers until a category is published."
          />
          <CategoriesManager categories={[]} />
        </div>
      ) : (
        <div className="space-y-5">
          <form
            method="get"
            action="/admin/categories"
            role="search"
            className="flex max-w-md gap-2"
          >
            <SearchInput
              name="q"
              defaultValue={search}
              placeholder="Search categories…"
              aria-label="Search categories"
            />
            <button type="submit" className={buttonStyles({ size: "sm" })}>
              <Search className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">Search</span>
            </button>
            {search && (
              <Link
                href="/admin/categories"
                className={buttonStyles({ variant: "ghost", size: "sm" })}
              >
                Clear
              </Link>
            )}
          </form>

          <CategoriesManager categories={result.rows} />
        </div>
      )}
    </div>
  );
}
