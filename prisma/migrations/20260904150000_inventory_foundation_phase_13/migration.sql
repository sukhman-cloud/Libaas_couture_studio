-- Phase 13: inventory & stock management foundation. One inventory row per
-- PRODUCT (this catalog has no variant/option concept — confirmed no
-- size/color splits exist). A product with no row here behaves exactly as
-- before this phase: purchasability is governed solely by
-- products.availability. quantity_available is intentionally NOT a column
-- — every reader computes it as quantity_on_hand - quantity_reserved so it
-- can never drift from its two inputs.

CREATE TYPE "inventory_movement_type" AS ENUM ('initial_stock', 'restock', 'sale', 'reservation', 'reservation_release', 'adjustment', 'return', 'damaged', 'correction');

CREATE TABLE "inventory_items" (
  "id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "tracking_enabled" BOOLEAN NOT NULL,
  "quantity_on_hand" INTEGER NOT NULL,
  "quantity_reserved" INTEGER NOT NULL,
  "low_stock_threshold" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_items_product_id_key" ON "inventory_items"("product_id");
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_on_hand_nonnegative" CHECK ("quantity_on_hand" >= 0);
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_reserved_nonnegative" CHECK ("quantity_reserved" >= 0);
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_reserved_le_on_hand" CHECK ("quantity_reserved" <= "quantity_on_hand");
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_threshold_nonnegative" CHECK ("low_stock_threshold" >= 0);

CREATE TABLE "inventory_movements" (
  "id" TEXT NOT NULL,
  "inventory_item_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "type" "inventory_movement_type" NOT NULL,
  "quantity_change" INTEGER NOT NULL,
  "quantity_after" INTEGER NOT NULL,
  "actor_user_id" TEXT,
  "order_id" TEXT,
  "order_item_id" TEXT,
  "reason" TEXT,
  "idempotency_key" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_movements_inventory_item_id_idempotency_key_key" ON "inventory_movements"("inventory_item_id", "idempotency_key");
CREATE INDEX "inventory_movements_inventory_item_id_created_at_idx" ON "inventory_movements"("inventory_item_id", "created_at");
CREATE INDEX "inventory_movements_order_id_idx" ON "inventory_movements"("order_id");
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_fkey"
  FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_reason_length" CHECK ("reason" IS NULL OR length(btrim("reason")) BETWEEN 1 AND 500);
