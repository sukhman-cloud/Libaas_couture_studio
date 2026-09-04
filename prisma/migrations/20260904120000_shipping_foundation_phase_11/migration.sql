-- Phase 11: shipping & fulfillment foundation. No real carrier is
-- integrated — this adds the shipment domain (Shipment, ShipmentActivity,
-- ShipmentWebhookEvent) alongside orders, one shipment per order,
-- append-only activity history, and a dedup-safe webhook event table for a
-- future carrier integration. The delivery address is never duplicated
-- here — it stays exclusively on "orders" (ship_* columns, Phase 6C).

CREATE TYPE "shipment_status" AS ENUM ('not_ready', 'preparing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled');
CREATE TYPE "shipment_method" AS ENUM ('standard', 'local_delivery', 'pickup', 'provider_managed');

CREATE TABLE "shipments" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "status" "shipment_status" NOT NULL,
  "method" "shipment_method" NOT NULL,
  "carrier" TEXT,
  "tracking_number" TEXT,
  "estimated_delivery" TEXT,
  "shipped_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipments"
  ADD CONSTRAINT "shipments_carrier_length" CHECK ("carrier" IS NULL OR length(btrim("carrier")) BETWEEN 1 AND 80);
ALTER TABLE "shipments"
  ADD CONSTRAINT "shipments_tracking_number_length" CHECK ("tracking_number" IS NULL OR length(btrim("tracking_number")) BETWEEN 1 AND 100);

CREATE TABLE "shipment_activities" (
  "id" TEXT NOT NULL,
  "shipment_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "from_status" "shipment_status",
  "to_status" "shipment_status",
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipment_activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "shipment_activities_shipment_id_created_at_idx" ON "shipment_activities"("shipment_id", "created_at");
ALTER TABLE "shipment_activities" ADD CONSTRAINT "shipment_activities_shipment_id_fkey"
  FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipment_activities" ADD CONSTRAINT "shipment_activities_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "shipment_webhook_events" (
  "id" TEXT NOT NULL,
  "carrier" TEXT NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "shipment_id" TEXT,
  "order_id" TEXT,
  "event_type" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipment_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shipment_webhook_events_carrier_provider_event_id_key" ON "shipment_webhook_events"("carrier", "provider_event_id");
