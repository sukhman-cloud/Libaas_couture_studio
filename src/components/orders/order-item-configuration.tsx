import { Scissors } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Caption, Text } from "@/components/ui/typography";
import { allMeasurementFields } from "@/config/measurements";
import type { OrderItemMeasurementSnapshot } from "@/types/domain";

/**
 * One order line's configuration block (Phase 7C) — shared by the
 * customer and admin detail pages, so both always render the SAME
 * immutable order-time data:
 *
 *   - Unstitched lines say exactly that.
 *   - Stitched lines show the profile-label snapshot and the Phase 7B
 *     measurement snapshot verbatim (unit, fit preference when one was
 *     stored — absence stays absent — every key/value pair, and the
 *     profile's tailor notes).
 *   - Stitched orders placed BEFORE Phase 7B carry no snapshot; that is
 *     stated honestly — the customer's CURRENT profile is never loaded
 *     as a substitute.
 *
 * All content is plain text through React's escaping; measurement keys
 * resolve through the same catalog labels the account pages use.
 */
const fieldLabel = new Map(allMeasurementFields.map((f) => [f.key, f.label]));

const UNIT_LABEL = { cm: "cm", in: "inches" } as const;
const FIT_LABEL = {
  fitted: "Fitted",
  regular: "Regular",
  relaxed: "Relaxed",
} as const;

export function OrderItemConfiguration({
  stitched,
  measurementProfileLabel,
  measurements,
  notes,
  hasCustomizationRequest,
}: {
  stitched: boolean;
  measurementProfileLabel?: string;
  measurements?: OrderItemMeasurementSnapshot;
  /** The cart line's customer notes, when any. */
  notes?: string;
  hasCustomizationRequest: boolean;
}) {
  return (
    <div className="space-y-2">
      {stitched ? (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="gold">
              <Scissors className="mr-1 size-3" aria-hidden />
              Stitched
            </Badge>
            {measurementProfileLabel && (
              <span className="text-muted">
                Measurement profile: {measurementProfileLabel}
              </span>
            )}
          </p>

          {measurements ? (
            <div className="rounded-xl bg-cream-50 p-3 text-sm">
              <Caption className="uppercase tracking-widest">
                Measurements at order time
              </Caption>
              <p className="mt-1 text-muted">
                Unit: {UNIT_LABEL[measurements.unit] ?? measurements.unit}
                {measurements.fitPreference
                  ? ` · Fit: ${FIT_LABEL[measurements.fitPreference] ?? measurements.fitPreference}`
                  : ""}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                {measurements.values.map((value) => (
                  <div key={value.key} className="flex justify-between gap-3">
                    <dt className="text-muted">
                      {fieldLabel.get(value.key) ?? value.key}
                    </dt>
                    <dd className="tabular-nums font-medium">
                      {value.value} {measurements.unit}
                    </dd>
                  </div>
                ))}
              </dl>
              {measurements.notes && (
                <p className="mt-2 border-t border-cream-200 pt-2 text-muted">
                  Notes: {measurements.notes}
                </p>
              )}
            </div>
          ) : (
            <Text tone="muted" size="sm">
              Measurement snapshot unavailable for this historical order.
            </Text>
          )}
        </>
      ) : (
        <Text tone="muted" size="sm">
          Unstitched
        </Text>
      )}

      {notes && (
        <Text tone="muted" size="sm">
          Customer note: {notes}
        </Text>
      )}
      {hasCustomizationRequest && (
        <Text tone="muted" size="sm">
          A customisation request is attached — its details arrive with the
          customisation workflow in a later phase.
        </Text>
      )}
    </div>
  );
}
