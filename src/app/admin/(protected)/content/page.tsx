import type { Metadata } from "next";
import { Instagram, PenTool } from "lucide-react";
import { InstagramStatusPanel } from "@/components/admin/instagram-status-panel";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Heading, Text } from "@/components/ui/typography";
import { requireAdminSession } from "@/lib/auth/admin-guard";
import { getInstagramStatus } from "@/server/instagram/service";

export const metadata: Metadata = { title: "Admin · Content" };

export default async function AdminContentPage() {
  await requireAdminSession();
  const instagramStatus = getInstagramStatus();

  return (
    <div>
      <PageHeader
        title="Content"
        description="Homepage sections and studio storytelling."
      />

      <div className="space-y-5">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-cream-100 text-gold-600">
                <Instagram className="size-5" aria-hidden />
              </span>
              <div>
                <Heading level={3} className="text-lg">
                  Instagram
                </Heading>
                <Text tone="muted" size="sm">
                  Posts and reels shown on the homepage.
                </Text>
              </div>
            </div>

            <InstagramStatusPanel status={instagramStatus} />

            <Text tone="muted" size="sm" className="border-t border-cream-200 pt-4">
              Only Posts and Reels sync automatically. Instagram Stories
              cannot be shown here — Meta&apos;s current API only exposes
              Stories to apps connected through a linked Facebook Page
              (a different, more involved setup than this account uses),
              and even then only while a story is still active (24 hours).
              There is no way to retrieve past Stories at all.
            </Text>
          </CardContent>
        </Card>

        <EmptyState
          icon={PenTool}
          title="More content tools arrive in a later phase"
          description="Homepage banners and other studio storytelling sections will be managed here."
        />
      </div>
    </div>
  );
}
