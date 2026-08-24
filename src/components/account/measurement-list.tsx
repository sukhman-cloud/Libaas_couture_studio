"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Copy, Pencil, Plus, Ruler, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { Caption, Heading, Text } from "@/components/ui/typography";
import { allMeasurementFields } from "@/config/measurements";
import {
  archiveMeasurementProfile,
  duplicateMeasurementProfile,
  setDefaultMeasurementProfile,
  type AccountFormState,
} from "@/lib/account/actions";
import type { MeasurementProfile } from "@/types/domain";

const fieldLabel = new Map(
  allMeasurementFields.map((f) => [f.key, f.label]),
);

export function MeasurementList({
  profiles,
  justSaved,
}: {
  profiles: MeasurementProfile[];
  justSaved?: boolean;
}) {
  const [deleteTarget, setDeleteTarget] = useState<MeasurementProfile | null>(
    null,
  );
  const [isMutating, startMutation] = useTransition();
  const { toast } = useToast();
  const savedToastShown = useRef(false);

  useEffect(() => {
    if (justSaved && !savedToastShown.current) {
      savedToastShown.current = true;
      toast({ title: "Measurement profile saved.", tone: "success" });
    }
  }, [justSaved, toast]);

  function runAction(action: () => Promise<AccountFormState>) {
    startMutation(async () => {
      const result = await action();
      if (result.error) toast({ title: result.error, tone: "danger" });
      else if (result.success) toast({ title: result.success, tone: "success" });
    });
  }

  if (profiles.length === 0) {
    return (
      <EmptyState
        icon={Ruler}
        title="No measurement profiles yet"
        description="Save measurements once and reuse them for every custom order — for yourself or anyone you order for."
        action={
          <Link href="/account/measurements/new" className={buttonStyles()}>
            <Plus className="size-4" aria-hidden />
            Add measurements
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {profiles.map((profile) => (
          <Card key={profile.id}>
            <CardContent className="flex h-full flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level={3} className="text-lg">
                  {profile.label}
                </Heading>
                {profile.isDefault && <Badge tone="gold">Default</Badge>}
                <Badge tone="neutral">{profile.unit}</Badge>
              </div>

              <Text tone="muted" size="sm" className="flex-1">
                {profile.values
                  .slice(0, 4)
                  .map(
                    (v) =>
                      `${fieldLabel.get(v.key) ?? v.key}: ${v.value} ${profile.unit}`,
                  )
                  .join(" · ")}
                {profile.values.length > 4 &&
                  ` · +${profile.values.length - 4} more`}
              </Text>
              <Caption>
                Updated{" "}
                {new Date(profile.updatedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Caption>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/account/measurements/${profile.id}`}
                  className={buttonStyles({ variant: "outline", size: "sm" })}
                >
                  <Pencil className="size-3.5" aria-hidden />
                  Edit
                </Link>
                {!profile.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      runAction(() => setDefaultMeasurementProfile(profile.id))
                    }
                    disabled={isMutating}
                  >
                    <Star className="size-3.5" aria-hidden />
                    Set default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    runAction(() => duplicateMeasurementProfile(profile.id))
                  }
                  disabled={isMutating}
                >
                  <Copy className="size-3.5" aria-hidden />
                  Duplicate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger/10"
                  onClick={() => setDeleteTarget(profile)}
                  disabled={isMutating}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Link
        href="/account/measurements/new"
        className={buttonStyles({ variant: "outline" })}
      >
        <Plus className="size-4" aria-hidden />
        Add another profile
      </Link>

      <ConfirmationDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            runAction(() => archiveMeasurementProfile(deleteTarget.id));
            setDeleteTarget(null);
          }
        }}
        title="Delete this measurement profile?"
        description={
          deleteTarget
            ? `"${deleteTarget.label}" will be removed from your account. Measurements already used on past orders stay preserved.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        isConfirming={isMutating}
      />
    </div>
  );
}
