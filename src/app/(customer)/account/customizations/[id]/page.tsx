import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CustomizationCancelForm } from "@/components/account/customization-cancel-form";
import { PageHeader } from "@/components/ui/page-header";
import { getCustomerUser } from "@/lib/auth/customer-session";
import { getOwnCustomizationRequest } from "@/server/customization/customer";
import { CUSTOMIZATION_STATUS_LABELS } from "@/server/customization/workflow";

export const metadata: Metadata = { title: "Customization request", robots: { index: false, follow: false } };

export default async function CustomizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCustomerUser();
  if (!user) return null;
  const request = await getOwnCustomizationRequest(user.id, (await params).id);
  if (!request) notFound();
  const canCancel = request.status === "pending" || request.status === "reviewing";
  return <div><PageHeader title="Customization request" breadcrumb={<Link href="/account/customizations" className="inline-flex min-h-11 items-center gap-2 text-sm text-navy-700 underline-offset-4 hover:underline"><ArrowLeft className="size-4" aria-hidden />Back to requests</Link>} actions={<Badge tone={request.status === "rejected" || request.status === "cancelled" ? "danger" : request.status === "completed" ? "success" : "gold"}>{CUSTOMIZATION_STATUS_LABELS[request.status]}</Badge>} /><Card><CardContent className="space-y-4 p-4 sm:p-6"><div><p className="text-xs uppercase tracking-widest text-gold-700">Your request</p><p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm">{request.details}</p></div><p className="text-sm text-muted">Sent {new Date(request.createdAt).toLocaleDateString("en-IN")}</p>{canCancel && <CustomizationCancelForm requestId={request.id} />}{request.activities && request.activities.length > 0 && <div className="border-t border-cream-200 pt-4"><h2 className="font-display text-lg font-medium text-navy-800">Request updates</h2><ol className="mt-3 space-y-2">{request.activities.map((activity, index) => <li key={`${activity.createdAt}-${index}`} className="text-sm"><span className="capitalize">{activity.type.replaceAll("_", " ")}</span><span className="block text-muted">{new Date(activity.createdAt).toLocaleDateString("en-IN")}</span></li>)}</ol></div>}</CardContent></Card></div>;
}
