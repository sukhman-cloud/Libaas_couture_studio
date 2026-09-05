import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { CustomizationOperations } from "@/components/admin/customization-operations";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { getRepositories } from "@/server/data";
import { getAdminCustomization } from "@/server/customization/admin";
import {
  CUSTOMIZATION_STATUS_LABELS,
  nextCustomizationStatuses,
} from "@/server/customization/workflow";
import type { CustomizationStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Admin · Customization" };

function badgeTone(status: string): "danger" | "success" | "gold" {
  if (status === "rejected" || status === "cancelled") return "danger";
  if (status === "completed") return "success";
  return "gold";
}

const CUSTOMIZATION_ACTIVITY_LABELS: Record<string, string> = {
  request_approved: "Request approved",
  request_rejected: "Request rejected",
  request_completed: "Request completed",
  internal_note_added: "Internal note added",
};

function customizationActivityLabel(activity: { type: string; toStatus?: string }): string {
  if (activity.type === "status_changed") {
    const label = activity.toStatus
      ? CUSTOMIZATION_STATUS_LABELS[activity.toStatus as CustomizationStatus]
      : undefined;
    return `Status changed to ${label ?? "updated"}`;
  }
  return CUSTOMIZATION_ACTIVITY_LABELS[activity.type] ?? activity.type.replace(/_/g, " ");
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function AdminCustomizationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const request = await getAdminCustomization((await params).id);
  if (!request) notFound();

  const product = request.productId
    ? await getRepositories().products.getById(request.productId)
    : null;

  return (
    <div>
      <PageHeader
        title="Customization request"
        description={`${request.customerName} · ${new Date(request.createdAt).toLocaleDateString("en-IN")}`}
        breadcrumb={
          <Link
            href="/admin/customizations"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-navy-700 underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to customizations
          </Link>
        }
        actions={
          <Badge tone={badgeTone(request.status)}>
            {CUSTOMIZATION_STATUS_LABELS[request.status]}
          </Badge>
        }
      />

      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <Heading level={2} className="text-lg">
                Request details
              </Heading>
              <Text className="whitespace-pre-wrap wrap-break-word">
                {request.details}
              </Text>
              <Caption className="block wrap-break-word">
                {request.customerEmail ?? "No email"}
                {request.customerPhone ? ` · ${request.customerPhone}` : ""}
              </Caption>
              {request.orderNumber && (
                <Link
                  href={`/admin/orders/${request.orderNumber}`}
                  className="inline-flex min-h-11 items-center text-sm text-navy-700 underline-offset-4 hover:underline"
                >
                  Related order: {request.orderNumber}
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4 sm:p-6">
              <Heading level={2} className="text-lg">
                Product
              </Heading>
              {product ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-cream-100 text-gold-600">
                      <Package className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/admin/products/${product.id}/edit`}
                        className="block wrap-break-word font-medium text-navy-800 underline-offset-4 hover:underline"
                      >
                        {product.name}
                      </Link>
                      <Caption className="block">{product.sku}</Caption>
                    </div>
                  </div>
                </>
              ) : request.productId ? (
                <Text tone="muted" size="sm">
                  This product is no longer in the catalog.
                </Text>
              ) : (
                <Text tone="muted" size="sm">
                  No specific product attached to this request.
                </Text>
              )}
            </CardContent>
          </Card>
        </div>

        <CustomizationOperations
          requestId={request.id}
          nextStatuses={nextCustomizationStatuses(request.status)}
        />

        {(request.activities.length > 0 || request.notes.length > 0) && (
          <Card>
            <CardContent className="space-y-5 p-4 sm:p-5">
              <Heading level={2} className="text-lg">
                Request history
              </Heading>
              {request.activities.length > 0 && (
                <ol className="space-y-3 border-l border-cream-200 pl-4">
                  {request.activities.map((activity, index) => (
                    <li key={`${activity.createdAt}-${index}`} className="text-sm">
                      <p className="font-medium text-navy-800">
                        {customizationActivityLabel(activity)}
                      </p>
                      <Caption className="block">
                        {activity.actorName} · {dateTimeFormatter.format(new Date(activity.createdAt))}
                      </Caption>
                    </li>
                  ))}
                </ol>
              )}
              {request.notes.length > 0 && (
                <div className="space-y-3 border-t border-cream-200 pt-4">
                  <Heading level={3} className="text-base">
                    Internal notes
                  </Heading>
                  {request.notes.map((note, index) => (
                    <div key={`${note.createdAt}-${index}`} className="rounded-xl bg-cream-50 p-3 text-sm">
                      <p className="whitespace-pre-wrap wrap-break-word">{note.body}</p>
                      <Caption className="mt-1 block">
                        {note.authorName} · {dateTimeFormatter.format(new Date(note.createdAt))}
                      </Caption>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
