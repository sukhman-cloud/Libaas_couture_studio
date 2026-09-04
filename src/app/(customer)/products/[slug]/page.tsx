import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Scissors, Sparkles } from "lucide-react";
import {
  ProductGallery,
  type GalleryImage,
} from "@/components/catalog/product-gallery";
import {
  ProductGrid,
  ProductGridSkeleton,
} from "@/components/catalog/product-grid";
import { ShareButton } from "@/components/catalog/share-button";
import { ProductActions } from "@/components/commerce/product-actions";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { buttonStyles } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { siteConfig } from "@/config/site";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { formatPrice } from "@/lib/utils";
import { isPurchasable, isWishlisted } from "@/server/commerce/service";
import {
  getPublishedProductBySlug,
  getRelatedProducts,
  publishedCategoryNames,
  publishedCollectionsOf,
  toProductCards,
} from "@/server/catalog/public";
import { getRepositories } from "@/server/data";
import { customerStockLabel, getInventoryLevel } from "@/server/inventory/service";
import type { Product, ProductAvailability } from "@/types/domain";

/* ── availability presentation (text, never colour alone) ────────── */

const availability: Record<
  ProductAvailability,
  { label: string; note: string; tone: "navy" | "gold" | "danger" | "neutral" }
> = {
  available: {
    label: "Available",
    note: "Ready for a fitting at the studio.",
    tone: "navy",
  },
  made_to_order: {
    label: "Made to order",
    note: "Crafted for you after your measurements are taken.",
    tone: "gold",
  },
  out_of_stock: {
    label: "Out of stock",
    note: "Not available at the moment — ask the studio about a remake.",
    tone: "danger",
  },
  discontinued: {
    label: "Discontinued",
    note: "No longer produced.",
    tone: "neutral",
  },
};

/** schema.org availability, mapped from our real states only. */
const schemaAvailability: Record<ProductAvailability, string> = {
  available: "https://schema.org/InStock",
  made_to_order: "https://schema.org/PreOrder",
  out_of_stock: "https://schema.org/OutOfStock",
  discontinued: "https://schema.org/Discontinued",
};

function galleryImages(product: Product): GalleryImage[] {
  return [...product.media]
    .sort((a, b) => {
      // Primary first, then the admin's explicit order.
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    })
    .map((item) => ({
      mediaId: item.mediaId,
      // Admin alt text wins; the product name is the fallback. Internal
      // filenames are never exposed.
      alt: item.alt || product.name,
    }));
}

/* ── metadata ────────────────────────────────────────────────────── */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);

  if (!product) {
    // Nothing public here — do not let it be indexed.
    return { title: "Product not found", robots: { index: false } };
  }

  const description =
    product.shortDescription ||
    (product.description
      ? product.description.replace(/\s+/g, " ").slice(0, 160)
      : `${product.name} at ${siteConfig.name}.`);
  const images = galleryImages(product);

  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title: product.name,
      description,
      type: "website",
      url: `/products/${product.slug}`,
      images: images.length ? [`/api/media/${images[0].mediaId}`] : undefined,
    },
  };
}

/* ── related products ────────────────────────────────────────────── */

/**
 * Streamed separately so its queries never delay the main product view.
 *
 * Note there is deliberately no route-level `loading.tsx`: that boundary
 * would start streaming before the product lookup finishes, turning a
 * genuine 404 into a soft 200. Suspense here gives the loading state
 * without costing the correct status.
 */
async function RelatedProducts({ product }: { product: Product }) {
  const [related, categoryNames] = await Promise.all([
    getRelatedProducts(product, 4),
    publishedCategoryNames(),
  ]);
  // Fewer — or none — rather than padding with unrelated items.
  if (related.length === 0) return null;

  return (
    <section className="mt-14" aria-labelledby="related">
      <Heading level={2} id="related" className="mb-5 text-xl">
        You may also like
      </Heading>
      <ProductGrid products={toProductCards(related, categoryNames)} />
    </section>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);
  // Draft/archived products are indistinguishable from missing ones.
  if (!product) notFound();

  const customer = await getCustomerUser();
  const [collections, wishlisted, measurementProfiles] = await Promise.all([
    publishedCollectionsOf(product),
    customer ? isWishlisted(customer.id, product.id) : Promise.resolve(false),
    // Only for the stitching selector: the customer's own ACTIVE profiles
    // (listByUserId excludes archived ones by contract).
    customer && product.stitchingAvailable
      ? getRepositories().measurementProfiles.listByUserId(customer.id)
      : Promise.resolve([]),
  ]);

  const category = product.categoryId
    ? await getRepositories().categories.getById(product.categoryId)
    : null;
  const publishedCategory =
    category && category.status === "published" ? category : null;

  const images = galleryImages(product);
  const onSale =
    product.salePrice !== undefined &&
    product.salePrice.amount < product.price.amount;
  const effective = onSale ? product.salePrice! : product.price;
  const state = availability[product.availability];
  const stockLevel = await getInventoryLevel(product.id);
  const stockLabel = customerStockLabel(stockLevel);

  // Only attributes that actually carry data are rendered — never an
  // empty label.
  const attributes: Array<[string, string]> = (
    [
      ["Fabric", product.attributes.fabric],
      ["Colour", product.attributes.colour],
      ["Occasion", product.attributes.occasion],
      ["Work / embroidery", product.attributes.work],
      ["Fit", product.attributes.fit],
    ] as Array<[string, string | undefined]>
  ).flatMap(([label, value]) => (value ? [[label, value] as [string, string]] : []));

  // Structured data built only from fields we actually hold — no ratings,
  // no review counts, no invented values.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.shortDescription || product.description
      ? { description: product.shortDescription || product.description }
      : {}),
    ...(images.length
      ? { image: images.map((image) => `/api/media/${image.mediaId}`) }
      : {}),
    ...(publishedCategory ? { category: publishedCategory.name } : {}),
    ...(product.attributes.colour ? { color: product.attributes.colour } : {}),
    ...(product.attributes.fabric ? { material: product.attributes.fabric } : {}),
    brand: { "@type": "Brand", name: siteConfig.name },
    offers: {
      "@type": "Offer",
      priceCurrency: effective.currency,
      price: (effective.amount / 100).toFixed(2),
      availability: schemaAvailability[product.availability],
      url: `/products/${product.slug}`,
    },
  };

  return (
    <Container>
      <Section space="md">
        <Breadcrumb
          className="mb-5"
          items={[
            { title: "Shop", href: "/shop" },
            ...(publishedCategory
              ? [
                  {
                    title: publishedCategory.name,
                    href: `/categories/${publishedCategory.slug}`,
                  },
                ]
              : []),
            { title: product.name },
          ]}
        />

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <ProductGallery images={images} productName={product.name} />

          <div className="min-w-0">
            {publishedCategory && (
              <Link
                href={`/categories/${publishedCategory.slug}`}
                className="text-xs uppercase tracking-widest text-gold-700 underline-offset-4 hover:underline"
              >
                {publishedCategory.name}
              </Link>
            )}

            <Heading
              level={1}
              className="mt-2 wrap-break-word text-3xl sm:text-4xl"
            >
              {product.name}
            </Heading>

            <p className="mt-4 flex flex-wrap items-baseline gap-3">
              <span className="font-display text-3xl font-semibold tabular-nums text-navy-800">
                {formatPrice(effective.amount, effective.currency)}
              </span>
              {onSale && (
                <>
                  <span className="text-lg text-muted line-through tabular-nums">
                    {formatPrice(product.price.amount, product.price.currency)}
                  </span>
                  <Badge tone="gold">Sale</Badge>
                </>
              )}
            </p>

            <div className="mt-4">
              <Badge tone={state.tone}>{state.label}</Badge>
              {stockLabel === "out_of_stock" && product.availability === "available" && (
                <Badge tone="danger" className="ml-2">
                  Out of stock
                </Badge>
              )}
              {stockLabel === "limited" && (
                <Badge tone="gold" className="ml-2">
                  Limited availability
                </Badge>
              )}
              <Text tone="muted" size="sm" className="mt-1.5">
                {state.note}
              </Text>
            </div>

            {(product.stitchingAvailable || product.customizationAvailable) && (
              <ul className="mt-5 space-y-2 rounded-2xl border border-cream-200 bg-cream-50 p-4">
                {product.stitchingAvailable && (
                  <li className="flex items-start gap-2.5 text-sm">
                    <Scissors
                      className="mt-0.5 size-4 shrink-0 text-gold-600"
                      aria-hidden
                    />
                    <span>
                      <strong className="font-medium">Stitching available</strong>
                      <span className="block text-muted">
                        Tailored to your measurements at the studio.
                      </span>
                    </span>
                  </li>
                )}
                {product.customizationAvailable && (
                  <li className="flex items-start gap-2.5 text-sm">
                    <Sparkles
                      className="mt-0.5 size-4 shrink-0 text-gold-600"
                      aria-hidden
                    />
                    <span>
                      <strong className="font-medium">
                        Customisation available
                      </strong>
                      <span className="block text-muted">
                        Colour, fabric and work can be adapted for you.
                      </span>
                    </span>
                  </li>
                )}
              </ul>
            )}

            {product.shortDescription && (
              <Text className="mt-6">{product.shortDescription}</Text>
            )}

            {attributes.length > 0 && (
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-cream-200 pt-5 text-sm">
                {attributes.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs uppercase tracking-widest text-gold-700">
                      {label}
                    </dt>
                    <dd className="mt-0.5 wrap-break-word text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {collections.length > 0 && (
              <div className="mt-6">
                <Caption className="uppercase tracking-widest">
                  Part of
                </Caption>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {collections.map((collection) => (
                    <li key={collection.id}>
                      <Link
                        href={`/collections/${collection.slug}`}
                        className="inline-flex rounded-full border border-navy-200 px-3 py-1 text-xs text-navy-700 transition-colors hover:border-navy-400 hover:bg-navy-50"
                      >
                        {collection.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {product.tags.length > 0 && (
              <p className="mt-5 flex flex-wrap items-center gap-2">
                <Caption className="uppercase tracking-widest">Tags</Caption>
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-cream-100 px-2.5 py-0.5 text-xs text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </p>
            )}

            {/* Bag + wishlist + stitching configuration (Phase 7A).
                Signed-out visitors are routed to sign in rather than
                shown a control that quietly does nothing. */}
            <div className="mt-8">
              <ProductActions
                slug={product.slug}
                purchasable={isPurchasable(product)}
                signedIn={customer !== null}
                initiallyWishlisted={wishlisted}
                returnTo={`/products/${product.slug}`}
                stitchingAvailable={product.stitchingAvailable}
                measurementProfiles={measurementProfiles.map((profile) => ({
                  id: profile.id,
                  label: profile.label,
                  unit: profile.unit,
                  isDefault: profile.isDefault,
                }))}
              />
            </div>

            <div className="mt-6 rounded-2xl border border-cream-200 p-5">
              <Text size="sm">
                To enquire about this piece or discuss a fully custom
                design, visit the studio or message us.
              </Text>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={`/account/customizations/new?product=${encodeURIComponent(product.slug)}`}
                  className={buttonStyles({ variant: "outline", size: "sm" })}
                >
                  <Sparkles className="size-4" aria-hidden />
                  Request customization
                </Link>
                <Link
                  href={siteConfig.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonStyles({ variant: "outline", size: "sm" })}
                >
                  Message the studio
                </Link>
                <ShareButton
                  title={product.name}
                  path={`/products/${product.slug}`}
                />
              </div>
            </div>
          </div>
        </div>

        {product.description && (
          <section className="mt-12 max-w-3xl" aria-labelledby="description">
            <Heading level={2} id="description" className="text-xl">
              Details
            </Heading>
            <Text tone="muted" className="mt-3 whitespace-pre-line">
              {product.description}
            </Text>
          </section>
        )}

        <Suspense
          fallback={
            <div className="mt-14">
              <Skeleton className="mb-5 h-6 w-44" />
              <ProductGridSkeleton count={4} />
            </div>
          }
        >
          <RelatedProducts product={product} />
        </Suspense>
      </Section>

      <script
        type="application/ld+json"
        // Values come from the product record only. JSON.stringify does not
        // escape "</script>", so a product name/description containing that
        // sequence could otherwise break out of this block — escaped here
        // defensively even though only admins write product content.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </Container>
  );
}
