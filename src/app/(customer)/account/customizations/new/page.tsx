import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CustomizationRequestForm } from "@/components/account/customization-request-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { getPublishedProductBySlug } from "@/server/catalog/public";

export const metadata: Metadata = { title: "Request customization", robots: { index: false, follow: false } };

export default async function NewCustomizationPage({ searchParams }: { searchParams: Promise<{ product?: string; order?: string; item?: string }> }) {
  const user = await getCustomerUser();
  if (!user) return null;
  const params = await searchParams;
  const product = params.product ? await getPublishedProductBySlug(params.product) : null;
  if (params.product && !product) notFound();
  return (
    <div>
      <PageHeader title="Request customization" description={product ? `For ${product.name}` : "Tell the studio how you would like your piece changed."} breadcrumb={<Link href="/account/customizations" className="inline-flex min-h-11 items-center gap-2 text-sm text-navy-700 underline-offset-4 hover:underline"><ArrowLeft className="size-4" aria-hidden />Back to requests</Link>} />
      <Card><CardContent className="p-4 sm:p-6"><CustomizationRequestForm productSlug={product?.slug} orderNumber={params.order} orderItemId={params.item} /></CardContent></Card>
    </div>
  );
}
