"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorizeAdmin } from "@/lib/auth/admin-guard";
import {
  categorySchema,
  collectionSchema,
  parseTags,
  productSchema,
  slugify,
  uniqueSlug,
} from "@/lib/validation/catalog";
import { getRepositories } from "@/server/data";
import { withLock } from "@/server/lock";
import { getStorageProvider } from "@/server/storage";
import { validateImage } from "@/server/storage/image";
import type {
  Category,
  Collection,
  MediaAsset,
  Product,
  ProductMedia,
} from "@/types/domain";

/**
 * Admin catalog mutations.
 *
 * Every action authorizes the admin session server-side before touching
 * data, validates input with zod, and runs uniqueness-sensitive work
 * inside a lock (check-then-write is otherwise racy).
 */

export interface CatalogFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  /** Echo of submitted values so errors never clear the form. */
  values?: Record<string, string>;
}

const CATALOG_LOCK = "catalog";

function fieldErrorsFrom(
  issues: Array<{ path: PropertyKey[]; message: string }>,
) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function echoValues(formData: FormData, keys: string[]) {
  const values: Record<string, string> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/**
 * Echo checkbox + multi-select state too, so a validation error never
 * silently discards the admin's toggles (unchecked boxes send nothing).
 */
function echoProductValues(formData: FormData) {
  const values = echoValues(formData, PRODUCT_FIELD_KEYS);
  for (const key of [
    "isFeatured",
    "stitchingAvailable",
    "customizationAvailable",
  ]) {
    values[key] = formData.get(key) ? "on" : "";
  }
  values.collectionIds = formData
    .getAll("collectionIds")
    .filter((value): value is string => typeof value === "string")
    .join(",");
  // Marker so the form knows these values came from a submission.
  values.__echo = "1";
  return values;
}

const PRODUCT_FIELD_KEYS = [
  "name",
  "sku",
  "slug",
  "shortDescription",
  "description",
  "categoryId",
  "tags",
  "price",
  "salePrice",
  "status",
  "availability",
  "fabric",
  "colour",
  "occasion",
  "work",
  "fit",
];

function revalidateCatalog() {
  revalidatePath("/admin/products");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/collections");
  revalidatePath("/admin");
  // Customer-facing catalog routes must reflect admin changes immediately.
  revalidatePath("/shop");
  revalidatePath("/categories");
  revalidatePath("/collections");
  revalidatePath("/products", "layout");
}

/* ── products ───────────────────────────────────────────────────── */

interface ParsedProduct {
  ok: true;
  data: Omit<Product, "id" | "createdAt" | "updatedAt" | "media" | "archivedAt">;
}

type ParseResult = ParsedProduct | { ok: false; state: CatalogFormState };

/**
 * Shared parse/validate/uniqueness for create and update.
 * `existing` (on update) lets already-assigned archived categories and
 * collections round-trip, so an unrelated edit never drops them.
 */
async function parseProductForm(
  formData: FormData,
  existing?: Product,
): Promise<ParseResult> {
  const editingId = existing?.id;
  const values = echoProductValues(formData);
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    slug: formData.get("slug") ?? "",
    shortDescription: formData.get("shortDescription") ?? undefined,
    description: formData.get("description") ?? "",
    categoryId: formData.get("categoryId") ?? undefined,
    price: formData.get("price") ?? "",
    salePrice: formData.get("salePrice") ?? "",
    status: formData.get("status"),
    availability: formData.get("availability"),
    isFeatured: formData.get("isFeatured"),
    stitchingAvailable: formData.get("stitchingAvailable"),
    customizationAvailable: formData.get("customizationAvailable"),
    fabric: formData.get("fabric") ?? undefined,
    colour: formData.get("colour") ?? undefined,
    occasion: formData.get("occasion") ?? undefined,
    work: formData.get("work") ?? undefined,
    fit: formData.get("fit") ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      state: { fieldErrors: fieldErrorsFrom(parsed.error.issues), values },
    };
  }

  const { tags, error: tagError } = parseTags(formData.get("tags"));
  if (tagError) {
    return { ok: false, state: { fieldErrors: { tags: tagError }, values } };
  }

  const repos = getRepositories();

  // SKU uniqueness (case-insensitive).
  const skuOwner = await repos.products.getBySku(parsed.data.sku);
  if (skuOwner && skuOwner.id !== editingId) {
    return {
      ok: false,
      state: {
        fieldErrors: { sku: "Another product already uses this SKU." },
        values,
      },
    };
  }

  // Slug: explicit value must be free; otherwise derive a unique one.
  let slug = parsed.data.slug;
  if (slug) {
    const slugOwner = await repos.products.getBySlug(slug);
    if (slugOwner && slugOwner.id !== editingId) {
      return {
        ok: false,
        state: {
          fieldErrors: { slug: "Another product already uses this slug." },
          values,
        },
      };
    }
  } else {
    slug = await uniqueSlug(slugify(parsed.data.name), async (candidate) => {
      const owner = await repos.products.getBySlug(candidate);
      return Boolean(owner && owner.id !== editingId);
    });
  }

  // Category must exist and not be archived.
  let categoryId: string | undefined;
  if (parsed.data.categoryId) {
    const category = await repos.categories.getById(parsed.data.categoryId);
    if (!category) {
      return {
        ok: false,
        state: { fieldErrors: { categoryId: "Category not found." }, values },
      };
    }
    // An archived category may stay assigned (so unrelated edits still
    // save) but can never be newly chosen.
    if (
      category.status === "archived" &&
      category.id !== existing?.categoryId
    ) {
      return {
        ok: false,
        state: {
          fieldErrors: {
            categoryId: "That category is archived — choose an active one.",
          },
          values,
        },
      };
    }
    categoryId = category.id;
  }

  // Collections must exist and not be archived.
  const requestedCollectionIds = formData
    .getAll("collectionIds")
    .filter((value): value is string => typeof value === "string" && value !== "");
  const collectionIds: string[] = [];
  for (const id of new Set(requestedCollectionIds)) {
    const collection = await repos.collections.getById(id);
    if (!collection) {
      return {
        ok: false,
        state: { error: "One of the selected collections no longer exists.", values },
      };
    }
    // Archived collections are not offered in the form; only reject one
    // that is being newly added.
    if (
      collection.status === "archived" &&
      !existing?.collectionIds.includes(collection.id)
    ) {
      return {
        ok: false,
        state: {
          error: `The collection “${collection.name}” is archived — unselect it first.`,
          values,
        },
      };
    }
    collectionIds.push(collection.id);
  }

  // Memberships in archived collections aren't rendered in the form, so
  // carry them over instead of letting an unrelated save delete them.
  if (existing) {
    for (const id of existing.collectionIds) {
      if (collectionIds.includes(id)) continue;
      const collection = await repos.collections.getById(id);
      if (collection?.status === "archived") collectionIds.push(id);
    }
  }

  return {
    ok: true,
    data: {
      sku: parsed.data.sku,
      slug,
      name: parsed.data.name,
      shortDescription: parsed.data.shortDescription,
      description: parsed.data.description,
      categoryId,
      secondaryCategoryIds: [],
      collectionIds,
      tags,
      price: { amount: parsed.data.price, currency: "INR" },
      salePrice:
        parsed.data.salePrice === undefined
          ? undefined
          : { amount: parsed.data.salePrice, currency: "INR" },
      status: parsed.data.status,
      availability: parsed.data.availability,
      isFeatured: parsed.data.isFeatured,
      attributes: {
        fabric: parsed.data.fabric,
        colour: parsed.data.colour,
        occasion: parsed.data.occasion,
        work: parsed.data.work,
        fit: parsed.data.fit,
      },
      stitchingAvailable: parsed.data.stitchingAvailable,
      customizationAvailable: parsed.data.customizationAvailable,
    },
  };
}

export async function createProduct(
  _prev: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const created = await withLock(
    CATALOG_LOCK,
    async (): Promise<{ id: string } | CatalogFormState> => {
      const parsed = await parseProductForm(formData);
      if (!parsed.ok) return parsed.state;

      const now = new Date().toISOString();
      const product: Product = {
        id: randomUUID(),
        ...parsed.data,
        media: [],
        // Keep status and archivedAt consistent for every entry path.
        archivedAt: parsed.data.status === "archived" ? now : undefined,
        createdAt: now,
        updatedAt: now,
      };
      await getRepositories().products.create(product);
      return { id: product.id };
    },
  );

  if (!("id" in created)) return created;

  revalidateCatalog();
  redirect(`/admin/products/${created.id}/edit?created=1`);
}

export async function updateProduct(
  _prev: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const productId = formData.get("productId");
  if (typeof productId !== "string" || !productId) {
    return { error: "Missing product reference." };
  }

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const existing = await repos.products.getById(productId);
    if (!existing) return { error: "Product not found." };

    const parsed = await parseProductForm(formData, existing);
    if (!parsed.ok) return parsed.state;

    const now = new Date().toISOString();
    await repos.products.update({
      ...existing,
      ...parsed.data,
      // Media has its own actions.
      media: existing.media,
      // archivedAt always tracks status — un-archiving via the form must not
      // leave a published product still carrying an archive timestamp.
      archivedAt:
        parsed.data.status === "archived"
          ? (existing.archivedAt ?? now)
          : undefined,
      updatedAt: now,
    });
    return { success: "Product saved." };
  });

  if (result.success) {
    revalidateCatalog();
    revalidatePath(`/admin/products/${productId}/edit`);
  }
  return result;
}

export async function archiveProduct(
  productId: string,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const product = await repos.products.getById(productId);
    if (!product) return { error: "Product not found." };

    const now = new Date().toISOString();
    // Soft delete: the record stays for historical references.
    await repos.products.update({
      ...product,
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    return { success: `“${product.name}” archived.` };
  });

  if (result.success) revalidateCatalog();
  return result;
}

export async function restoreProduct(
  productId: string,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const product = await repos.products.getById(productId);
    if (!product) return { error: "Product not found." };

    const now = new Date().toISOString();
    // Restores as a draft — never silently back onto the storefront.
    await repos.products.update({
      ...product,
      status: "draft",
      archivedAt: undefined,
      updatedAt: now,
    });
    return { success: `“${product.name}” restored as a draft.` };
  });

  if (result.success) revalidateCatalog();
  return result;
}

/** Bulk archive — the foundation the list UI is structured around. */
export async function archiveProducts(
  productIds: string[],
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return { error: "Select at least one product." };
  }

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    let archived = 0;
    for (const id of productIds) {
      if (typeof id !== "string") continue;
      const product = await repos.products.getById(id);
      if (!product || product.status === "archived") continue;
      const now = new Date().toISOString();
      await repos.products.update({
        ...product,
        status: "archived",
        archivedAt: now,
        updatedAt: now,
      });
      archived++;
    }
    return {
      success: `${archived} product${archived === 1 ? "" : "s"} archived.`,
    };
  });

  if (result.success) revalidateCatalog();
  return result;
}

/* ── product media ──────────────────────────────────────────────── */

export async function uploadProductMedia(
  _prev: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const productId = formData.get("productId");
  const file = formData.get("file");
  const alt = formData.get("alt");

  if (typeof productId !== "string" || !productId) {
    return { error: "Missing product reference." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { file: "Choose an image to upload." } };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Never trust the browser's declared type or filename.
  const check = validateImage(bytes);
  if (!check.ok) return { fieldErrors: { file: check.error } };

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const product = await repos.products.getById(productId);
    if (!product) return { error: "Product not found." };

    // Storage key is generated by us — user input never forms a path.
    const storageKey = `${randomUUID()}.${check.image.extension}`;
    await getStorageProvider().put(storageKey, Buffer.from(bytes));

    const now = new Date().toISOString();
    const asset: MediaAsset = {
      id: randomUUID(),
      storageKey,
      originalName: file.name.slice(0, 120),
      mimeType: check.image.mimeType,
      size: bytes.byteLength,
      createdAt: now,
    };
    await repos.media.create(asset);

    const nextSortOrder =
      product.media.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
    const mediaItem: ProductMedia = {
      id: randomUUID(),
      mediaId: asset.id,
      alt: typeof alt === "string" ? alt.trim().slice(0, 160) : "",
      sortOrder: nextSortOrder,
      isPrimary: product.media.length === 0,
      createdAt: now,
    };

    await repos.products.update({
      ...product,
      media: [...product.media, mediaItem],
      updatedAt: now,
    });
    return { success: "Image uploaded." };
  });

  if (result.success) revalidatePath(`/admin/products/${productId}/edit`);
  return result;
}

export async function deleteProductMedia(
  productId: string,
  productMediaId: string,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const product = await repos.products.getById(productId);
    if (!product) return { error: "Product not found." };

    const item = product.media.find((m) => m.id === productMediaId);
    if (!item) return { error: "Image not found." };

    const remaining = product.media.filter((m) => m.id !== productMediaId);
    // Keep exactly one primary image.
    if (item.isPrimary && remaining.length > 0) {
      remaining[0] = { ...remaining[0], isPrimary: true };
    }

    await repos.products.update({
      ...product,
      media: remaining,
      updatedAt: new Date().toISOString(),
    });

    const asset = await repos.media.getById(item.mediaId);
    if (asset) {
      await repos.media.delete(asset.id);
      await getStorageProvider().delete(asset.storageKey);
    }
    return { success: "Image removed." };
  });

  if (result.success) revalidatePath(`/admin/products/${productId}/edit`);
  return result;
}

export async function setPrimaryProductMedia(
  productId: string,
  productMediaId: string,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const product = await repos.products.getById(productId);
    if (!product) return { error: "Product not found." };
    if (!product.media.some((m) => m.id === productMediaId)) {
      return { error: "Image not found." };
    }

    await repos.products.update({
      ...product,
      media: product.media.map((m) => ({
        ...m,
        isPrimary: m.id === productMediaId,
      })),
      updatedAt: new Date().toISOString(),
    });
    return { success: "Primary image updated." };
  });

  if (result.success) revalidatePath(`/admin/products/${productId}/edit`);
  return result;
}

export async function updateProductMediaAlt(
  productId: string,
  productMediaId: string,
  alt: string,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const product = await repos.products.getById(productId);
    if (!product) return { error: "Product not found." };
    if (!product.media.some((m) => m.id === productMediaId)) {
      return { error: "Image not found." };
    }

    const text = typeof alt === "string" ? alt.trim().slice(0, 160) : "";
    await repos.products.update({
      ...product,
      media: product.media.map((m) =>
        m.id === productMediaId ? { ...m, alt: text } : m,
      ),
      updatedAt: new Date().toISOString(),
    });
    return { success: "Alt text saved." };
  });

  if (result.success) revalidatePath(`/admin/products/${productId}/edit`);
  return result;
}

/* ── categories ─────────────────────────────────────────────────── */

export async function saveCategory(
  _prev: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const values = echoValues(formData, [
    "name",
    "slug",
    "description",
    "parentId",
    "sortOrder",
    "status",
  ]);
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") ?? "",
    description: formData.get("description") ?? undefined,
    parentId: formData.get("parentId") ?? undefined,
    sortOrder: formData.get("sortOrder") ?? "",
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues), values };
  }

  const editingId = formData.get("categoryId");
  const editing = typeof editingId === "string" && editingId ? editingId : undefined;

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();

    let slug = parsed.data.slug;
    if (slug) {
      const owner = await repos.categories.getBySlug(slug);
      if (owner && owner.id !== editing) {
        return {
          fieldErrors: { slug: "Another category already uses this slug." },
          values,
        };
      }
    } else {
      slug = await uniqueSlug(slugify(parsed.data.name), async (candidate) => {
        const owner = await repos.categories.getBySlug(candidate);
        return Boolean(owner && owner.id !== editing);
      });
    }

    // Parent must exist, not be archived, and not be the category itself.
    let parentId: string | undefined;
    if (parsed.data.parentId) {
      if (parsed.data.parentId === editing) {
        return {
          fieldErrors: { parentId: "A category cannot be its own parent." },
          values,
        };
      }
      const parent = await repos.categories.getById(parsed.data.parentId);
      if (!parent) {
        return { fieldErrors: { parentId: "Parent category not found." }, values };
      }
      if (parent.status === "archived") {
        return {
          fieldErrors: { parentId: "That parent category is archived." },
          values,
        };
      }
      // Walk the whole ancestor chain — a cycle of any length is invalid.
      if (editing) {
        const seen = new Set<string>([parent.id]);
        let ancestorId = parent.parentId;
        while (ancestorId) {
          if (ancestorId === editing || seen.has(ancestorId)) {
            return {
              fieldErrors: {
                parentId: "That would create a circular hierarchy.",
              },
              values,
            };
          }
          seen.add(ancestorId);
          const ancestor = await repos.categories.getById(ancestorId);
          ancestorId = ancestor?.parentId;
        }
      }
      parentId = parent.id;
    }

    const now = new Date().toISOString();
    if (editing) {
      const existing = await repos.categories.getById(editing);
      if (!existing) return { error: "Category not found." };
      await repos.categories.update({
        ...existing,
        name: parsed.data.name,
        slug,
        description: parsed.data.description,
        parentId,
        sortOrder: parsed.data.sortOrder,
        status: parsed.data.status,
        archivedAt:
          parsed.data.status === "archived"
            ? (existing.archivedAt ?? now)
            : undefined,
        updatedAt: now,
      });
      return { success: "Category saved." };
    }

    const category: Category = {
      id: randomUUID(),
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      parentId,
      sortOrder: parsed.data.sortOrder,
      status: parsed.data.status,
      archivedAt: parsed.data.status === "archived" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await repos.categories.create(category);
    return { success: "Category created." };
  });

  if (result.success) revalidateCatalog();
  return result;
}

export async function archiveCategory(
  categoryId: string,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const category = await repos.categories.getById(categoryId);
    if (!category) return { error: "Category not found." };

    const now = new Date().toISOString();
    await repos.categories.update({
      ...category,
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    return { success: `“${category.name}” archived.` };
  });

  if (result.success) revalidateCatalog();
  return result;
}

export async function restoreCategory(
  categoryId: string,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const category = await repos.categories.getById(categoryId);
    if (!category) return { error: "Category not found." };

    const now = new Date().toISOString();
    // Restores as a draft — never silently back into the active catalog.
    await repos.categories.update({
      ...category,
      status: "draft",
      archivedAt: undefined,
      updatedAt: now,
    });
    return { success: `“${category.name}” restored as a draft.` };
  });

  if (result.success) revalidateCatalog();
  return result;
}

/* ── collections ────────────────────────────────────────────────── */

export async function saveCollection(
  _prev: CatalogFormState,
  formData: FormData,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const values = echoValues(formData, [
    "name",
    "slug",
    "description",
    "sortOrder",
    "status",
  ]);
  const parsed = collectionSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") ?? "",
    description: formData.get("description") ?? undefined,
    sortOrder: formData.get("sortOrder") ?? "",
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues), values };
  }

  const editingId = formData.get("collectionId");
  const editing = typeof editingId === "string" && editingId ? editingId : undefined;

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();

    let slug = parsed.data.slug;
    if (slug) {
      const owner = await repos.collections.getBySlug(slug);
      if (owner && owner.id !== editing) {
        return {
          fieldErrors: { slug: "Another collection already uses this slug." },
          values,
        };
      }
    } else {
      slug = await uniqueSlug(slugify(parsed.data.name), async (candidate) => {
        const owner = await repos.collections.getBySlug(candidate);
        return Boolean(owner && owner.id !== editing);
      });
    }

    const now = new Date().toISOString();
    if (editing) {
      const existing = await repos.collections.getById(editing);
      if (!existing) return { error: "Collection not found." };
      await repos.collections.update({
        ...existing,
        name: parsed.data.name,
        slug,
        description: parsed.data.description,
        sortOrder: parsed.data.sortOrder,
        status: parsed.data.status,
        archivedAt:
          parsed.data.status === "archived"
            ? (existing.archivedAt ?? now)
            : undefined,
        updatedAt: now,
      });
      return { success: "Collection saved." };
    }

    const collection: Collection = {
      id: randomUUID(),
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      sortOrder: parsed.data.sortOrder,
      status: parsed.data.status,
      archivedAt: parsed.data.status === "archived" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await repos.collections.create(collection);
    return { success: "Collection created." };
  });

  if (result.success) revalidateCatalog();
  return result;
}

export async function archiveCollection(
  collectionId: string,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const collection = await repos.collections.getById(collectionId);
    if (!collection) return { error: "Collection not found." };

    const now = new Date().toISOString();
    await repos.collections.update({
      ...collection,
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    return { success: `“${collection.name}” archived.` };
  });

  if (result.success) revalidateCatalog();
  return result;
}

export async function restoreCollection(
  collectionId: string,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const collection = await repos.collections.getById(collectionId);
    if (!collection) return { error: "Collection not found." };

    const now = new Date().toISOString();
    // Restores as a draft — never silently back into the active catalog.
    await repos.collections.update({
      ...collection,
      status: "draft",
      archivedAt: undefined,
      updatedAt: now,
    });
    return { success: `“${collection.name}” restored as a draft.` };
  });

  if (result.success) revalidateCatalog();
  return result;
}

/** Assign/unassign a product to a collection from the collections screen. */
export async function setProductCollectionMembership(
  productId: string,
  collectionId: string,
  member: boolean,
): Promise<CatalogFormState> {
  const auth = await authorizeAdmin("products.write");
  if (!auth.ok) return { error: auth.error };

  const result = await withLock(CATALOG_LOCK, async (): Promise<CatalogFormState> => {
    const repos = getRepositories();
    const product = await repos.products.getById(productId);
    if (!product) return { error: "Product not found." };
    const collection = await repos.collections.getById(collectionId);
    if (!collection) return { error: "Collection not found." };
    if (member && collection.status === "archived") {
      return { error: "That collection is archived." };
    }

    const next = member
      ? Array.from(new Set([...product.collectionIds, collectionId]))
      : product.collectionIds.filter((id) => id !== collectionId);

    await repos.products.update({
      ...product,
      collectionIds: next,
      updatedAt: new Date().toISOString(),
    });
    return { success: member ? "Product added." : "Product removed." };
  });

  if (result.success) revalidateCatalog();
  return result;
}
