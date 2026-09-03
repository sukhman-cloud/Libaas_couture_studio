import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CustomizationOperations } from "@/components/admin/customization-operations";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { getAdminCustomization } from "@/server/customization/admin";
import { CUSTOMIZATION_STATUS_LABELS, nextCustomizationStatuses } from "@/server/customization/workflow";

export const metadata: Metadata = { title: "Admin · Customization" };

export default async function AdminCustomizationDetail({ params }: { params: Promise<{ id: string }> }) {
  const request = await getAdminCustomization((await params).id);
  if (!request) notFound();
  return <div><PageHeader title="Customization request" description={`${request.customerName} · ${new Date(request.createdAt).toLocaleDateString("en-IN")}`} breadcrumb={<Link href="/admin/customizations" className="inline-flex min-h-11 items-center gap-2 text-sm text-navy-700 underline-offset-4 hover:underline"><ArrowLeft className="size-4" aria-hidden />Back to customizations</Link>} actions={<Badge tone={request.status === "rejected" || request.status === "cancelled" ? "danger" : request.status === "completed" ? "success" : "gold"}>{CUSTOMIZATION_STATUS_LABELS[request.status]}</Badge>} /><Card><CardContent className="space-y-4 p-4 sm:p-6"><Heading level={2} className="text-lg">Request details</Heading><Text className="whitespace-pre-wrap wrap-break-word">{request.details}</Text><Caption>{request.customerEmail ?? "No email"}{request.customerPhone ? ` · ${request.customerPhone}` : ""}</Caption>{request.orderNumber && <Link href={`/admin/orders/${request.orderNumber}`} className="text-sm text-navy-700 underline-offset-4 hover:underline">Related order</Link>}</CardContent></Card><div className="mt-5"><CustomizationOperations requestId={request.id} nextStatuses={nextCustomizationStatuses(request.status)} /></div>{(request.activities.length || request.notes.length) > 0 && <Card className="mt-5"><CardContent className="space-y-4 p-4 sm:p-6"><Heading level={2} className="text-lg">Request history</Heading>{request.activities.map((activity, index) => <div key={`${activity.createdAt}-${index}`} className="text-sm"><p className="font-medium">{activity.type.replaceAll("_", " ")}</p><Caption>{activity.actorName} · {new Date(activity.createdAt).toLocaleString("en-IN")}</Caption></div>)}{request.notes.map((note, index) => <div key={`${note.createdAt}-${index}`} className="border-t border-cream-200 pt-3 text-sm"><p className="whitespace-pre-wrap wrap-break-word">{note.body}</p><Caption>{note.authorName} · {new Date(note.createdAt).toLocaleString("en-IN")}</Caption></div>)}</CardContent></Card>}</div>;
}
