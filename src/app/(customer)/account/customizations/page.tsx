import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Caption } from "@/components/ui/typography";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { listOwnCustomizationRequests } from "@/server/customization/customer";
import { CUSTOMIZATION_STATUS_LABELS } from "@/server/customization/workflow";

export const metadata: Metadata = { title: "Customization requests", robots: { index: false, follow: false } };

export default async function CustomizationsPage() {
  const user = await getCustomerUser();
  if (!user) return null;
  const requests = await listOwnCustomizationRequests(user.id);
  return <div><PageHeader title="Customization requests" description="Follow requests sent to the studio." actions={<Link href="/account/customizations/new" className={buttonStyles({ size: "sm" })}><MessageSquarePlus className="size-4" aria-hidden />New request</Link>} />{requests.length === 0 ? <EmptyState icon={MessageSquarePlus} title="No customization requests yet" description="Tell the studio how you would like a piece adapted." action={<Link href="/shop" className={buttonStyles({ variant: "outline" })}>Continue shopping</Link>} /> : <ul className="space-y-4">{requests.map((request) => <li key={request.id}><Card><CardContent className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5"><div className="min-w-0"><Link href={`/account/customizations/${request.id}`} className="font-medium text-navy-800 underline-offset-4 hover:underline">{request.details}</Link><Caption className="mt-1 block">Sent {new Date(request.createdAt).toLocaleDateString("en-IN")}</Caption></div><Badge tone={request.status === "rejected" || request.status === "cancelled" ? "danger" : request.status === "completed" ? "success" : "gold"}>{CUSTOMIZATION_STATUS_LABELS[request.status]}</Badge></CardContent></Card></li>)}</ul>}</div>;
}
