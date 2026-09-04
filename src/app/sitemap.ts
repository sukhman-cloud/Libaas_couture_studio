import type { MetadataRoute } from "next";
import {
  listPublishedCategories,
  listPublishedCollections,
  listPublishedProducts,
} from "@/server/catalog/public";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const STATIC_ROUTES = ["", "/shop", "/categories", "/collections", "/search"];

/**
 * Public catalog sitemap — published entities only, the same publication
 * rule every customer-facing catalog read already enforces (draft/archived
 * rows never reach `listPublished*`). Products are capped at one page's
 * worth of the largest reasonable catalog rather than an unbounded fetch;
 * revisit with real pagination if the catalog grows past this.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, collections, { products }] = await Promise.all([
    listPublishedCategories(),
    listPublishedCollections(),
    listPublishedProducts({}, 1, 500),
  ]);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
  }));

  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${SITE_URL}/categories/${category.slug}`,
    lastModified: category.updatedAt,
  }));

  const collectionEntries: MetadataRoute.Sitemap = collections.map((collection) => ({
    url: `${SITE_URL}/collections/${collection.slug}`,
    lastModified: collection.updatedAt,
  }));

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${SITE_URL}/products/${product.slug}`,
    lastModified: product.updatedAt,
  }));

  return [...staticEntries, ...categoryEntries, ...collectionEntries, ...productEntries];
}
