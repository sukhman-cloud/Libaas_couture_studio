-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending');

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "order_status" NOT NULL,
    "currency" TEXT NOT NULL,
    "subtotal_amount" BIGINT NOT NULL,
    "shipping_amount" BIGINT NOT NULL,
    "tax_amount" BIGINT NOT NULL,
    "discount_amount" BIGINT NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "ship_full_name" TEXT NOT NULL,
    "ship_phone" TEXT NOT NULL,
    "ship_line1" TEXT NOT NULL,
    "ship_line2" TEXT,
    "ship_locality" TEXT,
    "ship_city" TEXT NOT NULL,
    "ship_state" TEXT NOT NULL,
    "ship_postal_code" TEXT NOT NULL,
    "ship_country" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "slug_snapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_amount" BIGINT NOT NULL,
    "line_subtotal_amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "configuration_key" TEXT NOT NULL,
    "stitching" JSONB,
    "customization_request_id" TEXT,
    "notes" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_user_id_idempotency_key_key" ON "orders"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Check constraints (hand-added; Prisma's DSL cannot express these) ──
-- Order money is integer paise and can never be negative; quantities
-- start at 1. Same policy as the Phase 5D constraints.

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_subtotal_amount_nonnegative" CHECK ("subtotal_amount" >= 0),
  ADD CONSTRAINT "orders_shipping_amount_nonnegative" CHECK ("shipping_amount" >= 0),
  ADD CONSTRAINT "orders_tax_amount_nonnegative" CHECK ("tax_amount" >= 0),
  ADD CONSTRAINT "orders_discount_amount_nonnegative" CHECK ("discount_amount" >= 0),
  ADD CONSTRAINT "orders_total_amount_nonnegative" CHECK ("total_amount" >= 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" >= 1),
  ADD CONSTRAINT "order_items_unit_price_amount_nonnegative" CHECK ("unit_price_amount" >= 0),
  ADD CONSTRAINT "order_items_line_subtotal_amount_nonnegative" CHECK ("line_subtotal_amount" >= 0);
