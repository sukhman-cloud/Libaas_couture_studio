import "server-only";
import { randomUUID } from "crypto";
import { getRepositories } from "@/server/data";
import { isAllowedShipmentTransition } from "@/server/shipping/workflow";
import type { ShipmentActivityType, ShipmentStatus } from "@/types/domain";

/**
 * Shipping webhook processing foundation (Phase 11). NO REAL CARRIER IS
 * CONNECTED — there is no signature verification for a real carrier, and
 * no route is exposed expecting real traffic. This is the internal,
 * testable seam a future integration plugs into: `processShipmentWebhookEvent`
 * takes an already-parsed, carrier-agnostic event and is idempotent by
 * `(carrier, providerEventId)` — replaying the same event is always safe
 * and never double-applies a status change.
 *
 * `orderId` is required on the input, mirroring the payment webhook
 * foundation: a real carrier always echoes back whatever reference it was
 * given at shipment-creation time, and the future adapter is responsible
 * for extracting the order id from that carrier-specific payload before
 * calling this function.
 */

export interface ShipmentWebhookEventInput {
  carrier: string;
  /** The carrier's own event id — the dedup key together with `carrier`. */
  providerEventId: string;
  /** Our order id, as echoed back by the carrier. */
  orderId: string;
  eventType: string;
  /** The status this event claims the shipment reached, mapped by the
   *  (future) carrier adapter to our closed vocabulary — never trusted
   *  blindly, still validated against the state machine below. */
  status: ShipmentStatus;
  metadata?: Record<string, string | number | boolean | null>;
}

export type ShipmentWebhookProcessResult =
  | { outcome: "processed"; shipmentId: string }
  | { outcome: "duplicate"; shipmentId?: string }
  | { outcome: "unmatched"; message: string }
  | { outcome: "rejected"; message: string };

function activityTypeFor(status: ShipmentStatus): ShipmentActivityType {
  switch (status) {
    case "shipped":
      return "shipment_dispatched";
    case "out_for_delivery":
      return "shipment_out_for_delivery";
    case "delivered":
      return "shipment_delivered";
    case "delivery_failed":
      return "shipment_delivery_failed";
    case "returned":
      return "shipment_returned";
    case "cancelled":
      return "shipment_cancelled";
    default:
      return "webhook_processed";
  }
}

/**
 * Process one webhook event idempotently. Steps: check for a prior
 * delivery of the same `(carrier, providerEventId)`; inside a transaction,
 * re-check the race, record the event row, locate the shipment by
 * `orderId`, validate the claimed transition against the state machine,
 * apply it and log activity, then mark the event processed. An event for
 * an unknown shipment or an illegal transition is recorded but NOT
 * applied — it never silently mutates shipment state.
 */
export async function processShipmentWebhookEvent(
  input: ShipmentWebhookEventInput,
): Promise<ShipmentWebhookProcessResult> {
  const repos = getRepositories();

  const existing = await repos.shipmentWebhookEvents.getByProviderEvent(
    input.carrier,
    input.providerEventId,
  );
  if (existing) {
    return {
      outcome: "duplicate",
      ...(existing.shipmentId ? { shipmentId: existing.shipmentId } : {}),
    };
  }

  try {
    return await repos.transaction(async (tx): Promise<ShipmentWebhookProcessResult> => {
      const raced = await tx.shipmentWebhookEvents.getByProviderEvent(
        input.carrier,
        input.providerEventId,
      );
      if (raced) {
        return {
          outcome: "duplicate",
          ...(raced.shipmentId ? { shipmentId: raced.shipmentId } : {}),
        };
      }

      const now = new Date().toISOString();
      const eventRow = await tx.shipmentWebhookEvents.create({
        id: randomUUID(),
        carrier: input.carrier,
        providerEventId: input.providerEventId,
        orderId: input.orderId,
        eventType: input.eventType,
        ...(input.metadata ? { metadata: input.metadata } : {}),
        createdAt: now,
        updatedAt: now,
      });

      const shipment = await tx.shipments.getByOrderId(input.orderId);
      if (!shipment) {
        return { outcome: "unmatched", message: "No shipment matches this event's order." };
      }

      if (!isAllowedShipmentTransition(shipment.status, input.status)) {
        return {
          outcome: "rejected",
          message: `Webhook claimed an illegal transition: ${shipment.status} -> ${input.status}.`,
        };
      }

      const updated = await tx.shipments.transitionStatus(
        shipment.id,
        shipment.status,
        input.status,
        now,
      );
      if (!updated) {
        return { outcome: "rejected", message: "Shipment changed concurrently." };
      }

      const timestampPatch =
        input.status === "shipped"
          ? { shippedAt: now }
          : input.status === "delivered"
            ? { deliveredAt: now }
            : {};
      const finalized =
        Object.keys(timestampPatch).length > 0
          ? await tx.shipments.update({ ...updated, ...timestampPatch })
          : updated;

      await tx.shipmentActivities.create({
        id: randomUUID(),
        shipmentId: finalized.id,
        orderId: finalized.orderId,
        type: activityTypeFor(input.status),
        fromStatus: shipment.status,
        toStatus: input.status,
        createdAt: now,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
      await tx.orderActivities.create({
        id: randomUUID(),
        orderId: finalized.orderId,
        type: "shipment_webhook_processed",
        createdAt: now,
      });
      await tx.shipmentWebhookEvents.markProcessed(
        eventRow.id,
        now,
        finalized.id,
        finalized.orderId,
      );

      return { outcome: "processed", shipmentId: finalized.id };
    });
  } catch (error) {
    if (error instanceof Error && /unique constraint/i.test(error.message)) {
      const winner = await repos.shipmentWebhookEvents.getByProviderEvent(
        input.carrier,
        input.providerEventId,
      );
      return {
        outcome: "duplicate",
        ...(winner?.shipmentId ? { shipmentId: winner.shipmentId } : {}),
      };
    }
    console.error(
      `[shipping] webhook processing failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { outcome: "rejected", message: "Could not process the webhook event." };
  }
}
