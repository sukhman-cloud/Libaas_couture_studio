import "server-only";
import { randomUUID } from "crypto";
import { getRepositories } from "@/server/data";
import type { StoreRepositories } from "@/server/data/repositories";
import { isAllowedPaymentTransition } from "@/server/payments/workflow";
import type {
  Money,
  Order,
  OrderActivityType,
  Payment,
  PaymentActivityType,
  PaymentProvider,
} from "@/types/domain";

/** PaymentActivityType and OrderActivityType share every payment-related
 *  name except one: "webhook_processed" vs "payment_webhook_processed". */
function toOrderActivityType(type: PaymentActivityType): OrderActivityType {
  return type === "webhook_processed" ? "payment_webhook_processed" : type;
}

/**
 * Payment foundation (Phase 10) — the order → payment seam.
 *
 * NO REAL GATEWAY EXISTS YET. `initiatePayment` creates (or replays) the
 * ONE Payment row for an order and, for an online-gateway attempt, records
 * a PaymentAttempt and stops at "pending" — there is nothing to redirect
 * to, and nothing here may claim a payment succeeded. `recordManualPayment`
 * is the admin-only path for cash/offline confirmation. Both follow the
 * same discipline as order creation: re-read fresh rows inside a lock +
 * transaction, validate against the order's AUTHORITATIVE total (never a
 * client-submitted amount), and log activity for every transition.
 *
 * TRUST BOUNDARY — the amount and currency of a Payment are ALWAYS derived
 * from `order.total`, never accepted from a caller. The only inputs a
 * caller contributes are the order identity, the chosen provider, and (for
 * manual payments) an idempotency key.
 */

export type InitiatePaymentResult =
  | { outcome: "created" | "replayed"; payment: Payment }
  | {
      outcome: "rejected";
      reason: "order_not_found" | "payment_exists" | "invalid_provider";
      message: string;
    }
  | { outcome: "failed"; message: string };

class PaymentRejection extends Error {
  constructor(public readonly result: InitiatePaymentResult) {
    super("payment rejected");
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("Payment already exists") || /unique constraint/i.test(message)
  );
}

const VALID_PROVIDERS: PaymentProvider[] = ["manual", "cash_on_delivery", "online_gateway"];

async function logActivity(
  tx: StoreRepositories,
  payment: Payment,
  type: PaymentActivityType,
  now: string,
  extra?: {
    actorUserId?: string;
    fromStatus?: Payment["status"];
    toStatus?: Payment["status"];
    metadata?: Record<string, string | number | boolean | null>;
  },
) {
  await tx.paymentActivities.create({
    id: randomUUID(),
    paymentId: payment.id,
    orderId: payment.orderId,
    type,
    createdAt: now,
    ...(extra?.actorUserId ? { actorUserId: extra.actorUserId } : {}),
    ...(extra?.fromStatus ? { fromStatus: extra.fromStatus } : {}),
    ...(extra?.toStatus ? { toStatus: extra.toStatus } : {}),
    ...(extra?.metadata ? { metadata: extra.metadata } : {}),
  });
  await tx.orderActivities.create({
    id: randomUUID(),
    orderId: payment.orderId,
    type: toOrderActivityType(type),
    createdAt: now,
    ...(extra?.actorUserId ? { actorUserId: extra.actorUserId } : {}),
  });
}

/**
 * Create (or idempotently replay) the payment for an order. Called right
 * after checkout, or by a customer choosing to (re)start payment. The
 * order's CURRENT total is the only source of the amount; a provider of
 * `online_gateway` is recorded as a payment attempt in `pending` — there
 * is no gateway to redirect to, so the caller must show a "payment not
 * completed yet" state, never a success state.
 */
export async function initiatePayment(input: {
  orderId: string;
  provider: PaymentProvider;
}): Promise<InitiatePaymentResult> {
  const { orderId } = input;
  if (!VALID_PROVIDERS.includes(input.provider)) {
    return {
      outcome: "rejected",
      reason: "invalid_provider",
      message: "That payment method is not available.",
    };
  }
  const provider = input.provider;
  const repos = getRepositories();

  try {
    return await repos.transaction(async (tx): Promise<InitiatePaymentResult> => {
      const order = await tx.orders.getById(orderId);
      if (!order) {
        throw new PaymentRejection({
          outcome: "rejected",
          reason: "order_not_found",
          message: "Order not found.",
        });
      }

      const existing = await tx.payments.getByOrderId(order.id);
      if (existing) {
        // Idempotent replay: initiating payment again for an order that
        // already has one returns the existing record rather than erroring
        // — covers double-click / refresh / retry.
        return { outcome: "replayed", payment: existing };
      }

      const now = new Date().toISOString();
      const payment: Payment = {
        id: randomUUID(),
        orderId: order.id,
        provider,
        amount: order.total,
        currency: order.currency,
        method: provider,
        status: "unpaid",
        createdAt: now,
        updatedAt: now,
      };

      const created = await tx.payments.create(payment);
      await logActivity(tx, created, "payment_created", now, {
        metadata: { provider },
      });

      if (provider === "online_gateway") {
        // Foundation only: record the attempt and stop at "pending". No
        // gateway exists to authorize or capture it.
        const attemptNow = new Date().toISOString();
        await tx.paymentAttempts.create({
          id: randomUUID(),
          paymentId: created.id,
          orderId: order.id,
          provider,
          amount: order.total,
          currency: order.currency,
          status: "pending",
          idempotencyKey: randomUUID(),
          createdAt: attemptNow,
          updatedAt: attemptNow,
        });
        const pending = await tx.payments.transitionStatus(
          created.id,
          "unpaid",
          "pending",
          attemptNow,
        );
        if (pending) {
          await logActivity(tx, pending, "payment_attempt_started", attemptNow, {
            fromStatus: "unpaid",
            toStatus: "pending",
          });
          return { outcome: "created", payment: pending };
        }
      }

      return { outcome: "created", payment: created };
    });
  } catch (error) {
    if (error instanceof PaymentRejection) return error.result;
    if (isDuplicateKeyError(error)) {
      try {
        const winner = await repos.payments.getByOrderId(orderId);
        if (winner) return { outcome: "replayed", payment: winner };
      } catch {
        /* fall through */
      }
    }
    console.error(
      `[payments] initiation failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return {
      outcome: "failed",
      message: "Something went wrong while starting payment. Please try again.",
    };
  }
}

export type ManualPaymentResult =
  | { ok: true; payment: Payment }
  | { ok: false; error: string };

/**
 * Admin-only foundation for recording an offline/manual payment (cash,
 * bank transfer confirmed by phone, etc). The amount is ALWAYS the order's
 * authoritative total — there is no field for an admin to type a different
 * number, so a payment can never silently diverge from what was ordered.
 * Idempotent by (payment id, expected status): re-submitting the same
 * confirmation on an already-paid order is a safe no-op reported as such.
 */
export async function recordManualPayment(input: {
  orderId: string;
  actorUserId?: string;
}): Promise<ManualPaymentResult> {
  const { orderId, actorUserId } = input;
  const repos = getRepositories();

  try {
    return await repos.transaction(async (tx): Promise<ManualPaymentResult> => {
      const order = await tx.orders.getById(orderId);
      if (!order) return { ok: false, error: "Order not found." };

      let payment = await tx.payments.getByOrderId(order.id);
      const now = new Date().toISOString();

      if (!payment) {
        payment = await tx.payments.create({
          id: randomUUID(),
          orderId: order.id,
          provider: "manual",
          amount: order.total,
          currency: order.currency,
          method: "manual",
          status: "unpaid",
          createdAt: now,
          updatedAt: now,
        });
        await logActivity(tx, payment, "payment_created", now, {
          ...(actorUserId ? { actorUserId } : {}),
          metadata: { provider: "manual" },
        });
      }

      if (payment.status === "paid") {
        // Already recorded — safe no-op, not an error.
        return { ok: true, payment };
      }

      if (!isAllowedPaymentTransition(payment.status, "paid")) {
        return {
          ok: false,
          error: `A payment in "${payment.status}" status cannot be marked paid.`,
        };
      }

      const updated = await tx.payments.transitionStatus(
        payment.id,
        payment.status,
        "paid",
        now,
      );
      if (!updated) {
        return { ok: false, error: "This payment changed. Refresh and try again." };
      }

      await logActivity(tx, updated, "payment_succeeded", now, {
        ...(actorUserId ? { actorUserId } : {}),
        fromStatus: payment.status,
        toStatus: "paid",
        metadata: { recordedManually: true },
      });

      return { ok: true, payment: updated };
    });
  } catch (error) {
    console.error(
      `[payments] manual record failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { ok: false, error: "Could not record the payment." };
  }
}

/**
 * Admin-only controlled transition for statuses other than the manual-paid
 * shortcut above (e.g. cancelling an unpaid payment). Server-validated
 * against the same state machine; no client-controlled amount or status
 * bypass exists here or anywhere else in this module.
 */
export async function transitionPaymentStatus(input: {
  orderId: string;
  nextStatus: Payment["status"];
  actorUserId?: string;
  failureCode?: string;
  failureMessage?: string;
}): Promise<ManualPaymentResult> {
  const { orderId, nextStatus, actorUserId } = input;
  const repos = getRepositories();

  try {
    return await repos.transaction(async (tx): Promise<ManualPaymentResult> => {
      const payment = await tx.payments.getByOrderId(orderId);
      if (!payment) return { ok: false, error: "No payment exists for this order." };
      if (!isAllowedPaymentTransition(payment.status, nextStatus)) {
        return {
          ok: false,
          error: `Cannot move a payment from "${payment.status}" to "${nextStatus}".`,
        };
      }

      const now = new Date().toISOString();
      const updated = await tx.payments.transitionStatus(
        payment.id,
        payment.status,
        nextStatus,
        now,
      );
      if (!updated) {
        return { ok: false, error: "This payment changed. Refresh and try again." };
      }

      const finalized =
        input.failureCode || input.failureMessage
          ? await tx.payments.update({
              ...updated,
              ...(input.failureCode ? { failureCode: input.failureCode } : {}),
              ...(input.failureMessage ? { failureMessage: input.failureMessage } : {}),
            })
          : updated;

      const activityType: PaymentActivityType =
        nextStatus === "failed"
          ? "payment_failed"
          : nextStatus === "cancelled"
            ? "payment_cancelled"
            : nextStatus === "refunded"
              ? "payment_refunded"
              : nextStatus === "paid"
                ? "payment_succeeded"
                : "payment_attempt_started";

      await logActivity(tx, finalized, activityType, now, {
        ...(actorUserId ? { actorUserId } : {}),
        fromStatus: payment.status,
        toStatus: nextStatus,
      });

      return { ok: true, payment: finalized };
    });
  } catch (error) {
    console.error(
      `[payments] transition failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return { ok: false, error: "Could not update the payment." };
  }
}

/* ── read models ────────────────────────────────────────────────── */

export interface PaymentView {
  provider: PaymentProvider;
  method: PaymentProvider;
  status: Payment["status"];
  amount: Money;
  currency: Payment["currency"];
  providerPaymentId?: string;
  createdAt: string;
  updatedAt: string;
}

function toPaymentView(payment: Payment): PaymentView {
  return {
    provider: payment.provider,
    method: payment.method,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    ...(payment.providerPaymentId
      ? { providerPaymentId: payment.providerPaymentId }
      : {}),
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

/** Ownership-checked payment lookup for a customer's own order. */
export async function getOwnPaymentForOrder(
  userId: string,
  order: Order,
): Promise<PaymentView | null> {
  if (order.userId !== userId) return null;
  const payment = await getRepositories().payments.getByOrderId(order.id);
  return payment ? toPaymentView(payment) : null;
}

export interface AdminPaymentAttemptView {
  provider: PaymentProvider;
  status: string;
  amount: Money;
  providerReference?: string;
  failureCode?: string;
  failureMessage?: string;
  createdAt: string;
}

export interface AdminPaymentActivityView {
  type: PaymentActivityType;
  fromStatus?: Payment["status"];
  toStatus?: Payment["status"];
  actorName: string;
  createdAt: string;
}

export interface AdminPaymentView extends PaymentView {
  attempts: AdminPaymentAttemptView[];
  activities: AdminPaymentActivityView[];
}

/** Full payment detail for the admin order page — no secrets, no raw
 *  provider payloads, just what the studio owner needs operationally. */
export async function getAdminPaymentForOrder(
  order: Order,
): Promise<AdminPaymentView | null> {
  const repos = getRepositories();
  const payment = await repos.payments.getByOrderId(order.id);
  if (!payment) return null;

  const [attempts, activities] = await Promise.all([
    repos.paymentAttempts.listByPaymentId(payment.id),
    repos.paymentActivities.listByPaymentId(payment.id),
  ]);

  return {
    ...toPaymentView(payment),
    attempts: attempts.map((attempt) => ({
      provider: attempt.provider,
      status: attempt.status,
      amount: attempt.amount,
      ...(attempt.providerReference
        ? { providerReference: attempt.providerReference }
        : {}),
      ...(attempt.failureCode ? { failureCode: attempt.failureCode } : {}),
      ...(attempt.failureMessage ? { failureMessage: attempt.failureMessage } : {}),
      createdAt: attempt.createdAt,
    })),
    activities: activities.map((activity) => ({
      type: activity.type,
      ...(activity.fromStatus ? { fromStatus: activity.fromStatus } : {}),
      ...(activity.toStatus ? { toStatus: activity.toStatus } : {}),
      actorName: activity.actorUserId ?? "System",
      createdAt: activity.createdAt,
    })),
  };
}
