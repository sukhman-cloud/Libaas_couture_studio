import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { buttonStyles } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/layout";
import { Heading, Text } from "@/components/ui/typography";
import { formatPrice } from "@/lib/utils";
import {
  getPublishedProductBySlug,
  primaryMediaOf,
} from "@/server/catalog/public";
import { getRepositories } from "@/server/data";

/**
 * Minimal product page — it exists because catalog cards link here and the
 * slug architecture needs a real route. The full experience (gallery,
 * customisation, measurements, add-to-cart) arrives in a later phase.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);
  if (!product) return { title: "Product" };

  return {
    title: product.name,
    description: product.shortDescription ?? product.description.slice(0, 160),
    alternates: { canonical: `/products/${product.slug}` },
  };
}

const availabilityLabel = {
  available: "Available",
  made_to_order: "Made to order",
  out_of_stock: "Out of stock",
  discontinued: "Discontinued",
} as const;

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);
  // Draft/archived products are indistinguishable from missing ones.
  if (!product) notFound();

  const media = primaryMediaOf(product);
  const category = product.categoryId
    ? await getRepositories().categories.getById(product.categoryId)
    : null;
  const publishedCategory =
    category && category.status === "published" ? category : null;

  const onSale =
    product.salePrice !== undefined &&
    product.salePrice.amount < product.price.amount;

  return (
    <Container>
      <Section space="md">
        <Breadcrumb
          className="mb-4"
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
          <div className="relative aspect-3/4 w-full overflow-hidden rounded-2xl bg-cream-100">
            {media ? (
              <Image
                src={`/api/media/${media.mediaId}`}
                alt={media.alt || product.name}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
                className="object-cover"
              />
            ) : (
              <div
                className="flex h-full flex-col items-center justify-center gap-2 text-muted"
                aria-hidden
              >
                <ImageOff className="size-8" />
                <span className="text-sm">Photo coming soon</span>
              </div>
            )}
          </div>

          <div>
            <Heading level={1} className="wrap-break-word text-3xl sm:text-4xl">
              {product.name}
            </Heading>

            <p className="mt-3 flex flex-wrap items-baseline gap-3">
              <span className="font-display text-2xl font-semibold tabular-nums text-navy-800">
                {formatPrice(
                  (onSale ? product.salePrice! : product.price).amount,
                  product.price.currency,
                )}
              </span>
              {onSale && (
                <span className="text-muted line-through tabular-nums">
                  {formatPrice(product.price.amount, product.price.currency)}
                </span>
              )}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="navy">
                {availabilityLabel[product.availability]}
              </Badge>
              {product.stitchingAvailable && (
                <Badge tone="gold">Stitching available</Badge>
              )}
              {product.customizationAvailable && (
                <Badge tone="gold">Customisable</Badge>
              )}
            </div>

            {product.shortDescription && (
              <Text className="mt-5">{product.shortDescription}</Text>
            )}
            {product.description && (
              <Text tone="muted" className="mt-3 whitespace-pre-line">
                {product.description}
              </Text>
            )}

            {(product.attributes.fabric ||
              product.attributes.colour ||
              product.attributes.occasion ||
              product.attributes.work ||
              product.attributes.fit) && (
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-cream-200 pt-5 text-sm">
                {(
                  [
                    ["Fabric", product.attributes.fabric],
                    ["Colour", product.attributes.colour],
                    ["Occasion", product.attributes.occasion],
                    ["Work", product.attributes.work],
                    ["Fit", product.attributes.fit],
                  ] as const
                )
                  .filter(([, value]) => Boolean(value))
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs uppercase tracking-widest text-gold-700">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-ink">{value}</dd>
                    </div>
                  ))}
              </dl>
            )}

            <div className="mt-8 rounded-2xl border border-cream-200 bg-cream-50 p-5">
              <Text size="sm">
                Online ordering for this piece is coming soon. To enquire or
                start a custom order, visit the studio or message us.
              </Text>
              <Link
                href="/shop"
                className={buttonStyles({ variant: "outline", size: "sm", className: "mt-4" })}
              >
                Back to shop
              </Link>
            </div>
          </div>
        </div>
      </Section>
    </Container>
  );
}
