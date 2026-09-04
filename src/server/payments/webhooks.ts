import "server-only";
import { randomUUID } from "crypto";
import { getRepositories } from "@/server/data";
import { isAllowedPaymentTransition } from "@/server/payments/workflow";
import type { PaymentActivityType, PaymentProvider, PaymentStatus } from "@/types/domain";

/**
 * Webhook processing foundation (Phase 10). NO REAL PROVIDER IS CONNECTED —
 * there is no signature verification for a real gateway, and no route is
 * exposed expecting real traffic. This is the internal, testable seam a
 * future integration plugs into: `processPaymentWebhookEvent` takes an
 * already-parsed, provider-agnostic event and is idempotent by
 * `(provider, providerEventId)` — replaying the same event is always safe
 * and never double-applies a status change.
 *
 * `orderId` is required on the input: a real gateway always echoes back
 * whatever reference it was given at payment-initiation time (Razorpay's
 * `notes`, Stripe's `metadata`, etc.), and the future adapter is
 * responsible for extracting the order id from that provider-specific
 * payload before calling this function. No payment lookup by an opaque
 * gateway id exists yet, since no gateway has ever produced one.
 */

export interface WebhookEventInput {
  provider: PaymentProvider;
  /** The provider's own event id — the dedup key together with `provider`. */
  providerEventId: string;
  /** Our order id, as echoed back by the provider. */
  orderId: string;
  /** The provider's payment/reference id, recorded on the Payment row. */
  providerPaymentId?: string;
  eventType: string;
  /** The status this event claims the payment reached, mapped by the
   *  (future) provider adapter to our closed vocabulary — never trusted
   *  blindly, still validated against the state machine below. */
  status: PaymentStatus;
  metadata?: Record<string, string | number | boolean | null>;
}

export type WebhookProcessResult =
  | { outcome: "processed"; paymentId: string }
  | { outcome: "duplicate"; paymentId?: string }
  | { outcome: "unmatched"; message: string }
  | { outcome: "rejected"; message: string };

function activityTypeFor(status: PaymentStatus): PaymentActivityType {
  switch (status) {
    case "paid":
      return "payment_succeeded";
    case "failed":
      return "payment_failed";
    case "cancelled":
      return "payment_cancelled";
    case "refunded":
      return "payment_refunded";
    default:
      return "webhook_processed";
  }
}

/**
 * Process one webhook event idempotently. Steps: check for a prior
 * delivery of the same `(provider, providerEventId)`; inside a
 * transaction, re-check the race, record the event row, locate the
 * payment by `orderId`, validate the claimed transition against the state
 * machine, apply it and log activity, then mark the event processed. An
 * event for an unknown payment or an illegal transition is recorded but
 * NOT applied — it never silently mutates payment state.
 */
export async function processPaymentWebhookEvent(
  input: WebhookEventInput,
): Promise<WebhookProcessResult> {
  const repos = getRepositories();

  const existing = await repos.paymentWebhookEvents.getByProviderEvent(
    input.provider,
    input.providerEventId,
  );
  if (existing) {
    return {
      outcome: "duplicate",
      ...(existing.paymentId ? { paymentId: existing.paymentId } : {}),
    };
  }

  try {
    return await repos.transaction(async (tx): Promise<WebhookProcessResult> => {
      // Re-check for the race where two deliveries of the same event
      // arrive concurrently — the unique constraint is the real backstop,
      // this is the in-transaction fast path.
      const raced = await tx.paymentWebhookEvents.getByProviderEvent(
        input.provider,
        input.providerEventId,
      );
      if (raced) {
        return {
          outcome: "duplicate",
          ...(raced.paymentId ? { paymentId: raced.paymentId } : {}),
        };
      }

      const now = new Date().toISOString();
      const eventRow = await tx.paymentWebhookEvents.create({
        id: randomUUID(),
        provider: input.provider,
        providerEventId: input.providerEventId,
        orderId: input.orderId,
        eventType: input.eventType,
        ...(input.metadata ? { metadata: input.metadata } : {}),
        createdAt: now,
        updatedAt: now,
      });

      const payment = await tx.payments.getByOrderId(input.orderId);
      if (!payment) {
        return { outcome: "unmatched", message: "No payment matches this event's order." };
      }
      if (payment.provider !== input.provider) {
        return { outcome: "unmatched", message: "Event provider does not match the payment's provider." };
      }

      if (!isAllowedPaymentTransition(payment.status, input.status)) {
        return {
          outcome: "rejected",
          message: `Webhook claimed an illegal transition: ${payment.status} -> ${input.status}.`,
        };
      }

      const updated = await tx.payments.transitionStatus(
        payment.id,
        payment.status,
        input.status,
        now,
      );
      if (!updated) {
        return { outcome: "rejected", message: "Payment changed concurrently." };
      }

      const withReference = input.providerPaymentId
        ? await tx.payments.update({
            ...updated,
            providerPaymentId: input.providerPaymentId,
          })
        : updated;

      await tx.paymentActivities.create({
        id: randomUUID(),
        paymentId: withReference.id,
        orderId: withReference.orderId,
        type: activityTypeFor(input.status),
        fromStatus: payment.status,
        toStatus: input.status,
        createdAt: now,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
      await tx.orderActivities.create({
        id: randomUUID(),
        orderId: withReference.orderId,
        type: "payment_webhook_processed",
        createdAt: now,
      });
      await tx.paymentWebhookEvents.markProcessed(
        eventRow.id,
        now,
        withReference.id,
        withReference.orderId,
      );

      return { outcome: "processed", paymentId: withReference.id };
    });
  } catch (error) {
    if (error instanceof Error && /unique constraint/i.test(error.message)) {
      // Cross-process race on the event id — the other request won.
      const winner = await repos.paymentWebhookEvents.getByProviderEvent(
        input.provider,
        input.providerEventId,
      );
      return {
        outcome: "duplicate",
        ...(winner?.paymentId ? { paymentId: winner.paymentId } : {}),
      };
    }
    console.error(
      `[payments] webhook processing failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { outcome: "rejected", message: "Could not process the webhook event." };
  }
}
