"use client";

import { useTransition } from "react";
import { Scissors } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Text } from "@/components/ui/typography";
import { useToast } from "@/components/ui/toast";
import { updateCartItemConfiguration } from "@/lib/commerce/actions";

/**
 * Per-line stitching configuration in the bag (Phase 7A).
 *
 * Shows what the line is (Stitched + profile label, or Unstitched) and —
 * while the product still offers stitching — lets the customer change it
 * with one labelled select. The server re-validates every change
 * (ownership, archival, capability) and merges lines when the new
 * configuration already exists in the bag.
 *
 * A line whose configuration broke (profile archived, stitching
 * withdrawn) renders an alert with the same wording checkout uses, plus
 * the select as the fix path. Internal configuration keys never reach
 * this component.
 */
export function CartLineConfigurationControl({
  itemId,
  productName,
  stitched,
  measurementProfileId,
  measurementProfileLabel,
  issueMessage,
  stitchingAvailable,
  unavailable,
  profiles,
}: {
  itemId: string;
  productName: string;
  stitched: boolean;
  measurementProfileId?: string;
  measurementProfileLabel?: string;
  /** Set when the stored configuration needs attention (§23). */
  issueMessage?: string;
  /** The product still offers stitching. */
  stitchingAvailable: boolean;
  /** The product itself is no longer purchasable — display only. */
  unavailable: boolean;
  /** The customer's own active profiles. */
  profiles: Array<{ id: string; label: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const showDisplay = stitched || stitchingAvailable;
  if (!showDisplay) return null;

  // Current selection for the control: "unstitched" or the profile id.
  const currentValue = stitched
    ? (measurementProfileId ?? "__broken__")
    : "unstitched";
  const currentProfileStillListed = profiles.some(
    (profile) => profile.id === measurementProfileId,
  );

  function change(nextValue: string) {
    if (nextValue === currentValue) return;
    startTransition(async () => {
      const result = await updateCartItemConfiguration(
        itemId,
        nextValue === "unstitched"
          ? { stitching: "unstitched" }
          : { stitching: "stitched", measurementProfileId: nextValue },
      );
      if (result.error) toast({ title: result.error, tone: "danger" });
      else if (result.success)
        toast({ title: result.success, tone: "success" });
    });
  }

  // The select is the fix/change path — hidden once the product itself is
  // unavailable (removal is the only resolution then) and when stitching
  // was withdrawn (only "switch to unstitched" remains meaningful, which
  // the single option still offers).
  const offerControl = !unavailable && (stitchingAvailable || stitched);

  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        {stitched ? (
          <>
            <Badge tone="gold">
              <Scissors className="mr-1 size-3" aria-hidden />
              Stitched
            </Badge>
            {measurementProfileLabel && (
              <span className="text-muted">
                Measurement: {measurementProfileLabel}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted">Unstitched</span>
        )}
      </p>

      {issueMessage && (
        <Alert tone="warning" role="alert">
          {issueMessage}
        </Alert>
      )}

      {offerControl && (
        <label className="flex max-w-xs flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-widest text-gold-700">
            Stitching for {productName}
          </span>
          <Select
            value={currentValue}
            disabled={isPending}
            onChange={(event) => change(event.target.value)}
          >
            <option value="unstitched">Unstitched</option>
            {stitchingAvailable &&
              profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  Stitched — {profile.label}
                </option>
              ))}
            {stitched && !currentProfileStillListed && (
              // Keeps the broken selection visible AND selected; choosing
              // any other option is the fix.
              <option value={currentValue} disabled>
                Stitched — {measurementProfileLabel ?? "profile unavailable"}
              </option>
            )}
          </Select>
        </label>
      )}

      {isPending && (
        <Text tone="muted" size="sm" aria-live="polite">
          Updating configuration…
        </Text>
      )}
    </div>
  );
}
