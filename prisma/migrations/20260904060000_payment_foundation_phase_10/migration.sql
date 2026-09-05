-- Phase 10: payment foundation. No real gateway is wired up — this adds
-- the payment domain (Payment, PaymentAttempt, PaymentActivity,
-- PaymentWebhookEvent) alongside orders, one payment per order, append-only
-- attempt/activity history, and a dedup-safe webhook event table for a
-- future provider integration.

CREATE TYPE "payment_provider" AS ENUM ('manual', 'cash_on_delivery', 'online_gateway');
CREATE TYPE "payment_status" AS ENUM ('unpaid', 'pending', 'authorized', 'paid', 'failed', 'cancelled', 'refunded');
CREATE TYPE "payment_attempt_status" AS ENUM ('pending', 'authorized', 'paid', 'failed', 'cancelled');

CREATE TABLE "payments" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "provider" "payment_provider" NOT NULL,
  "provider_payment_id" TEXT,
  "amount" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "method" "payment_provider" NOT NULL,
  "status" "payment_status" NOT NULL,
  "metadata" JSONB,
  "failure_code" TEXT,
  "failure_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_nonnegative" CHECK ("amount" >= 0);

CREATE TABLE "payment_attempts" (
  "id" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "provider" "payment_provider" NOT NULL,
  "provider_reference" TEXT,
  "amount" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "payment_attempt_status" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "failure_code" TEXT,
  "failure_message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_attempts_payment_id_idempotency_key_key" ON "payment_attempts"("payment_id", "idempotency_key");
CREATE INDEX "payment_attempts_payment_id_idx" ON "payment_attempts"("payment_id");
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "payment_attempts_amount_nonnegative" CHECK ("amount" >= 0);

CREATE TABLE "payment_activities" (
  "id" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "from_status" "payment_status",
  "to_status" "payment_status",
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_activities_payment_id_created_at_idx" ON "payment_activities"("payment_id", "created_at");
ALTER TABLE "payment_activities" ADD CONSTRAINT "payment_activities_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_activities" ADD CONSTRAINT "payment_activities_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" "payment_provider" NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "order_id" TEXT,
  "event_type" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_webhook_events_provider_provider_event_id_key" ON "payment_webhook_events"("provider", "provider_event_id");
