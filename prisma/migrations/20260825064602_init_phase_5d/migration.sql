-- CreateEnum
CREATE TYPE "user_kind" AS ENUM ('customer', 'admin');

-- CreateEnum
CREATE TYPE "catalog_status" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "product_availability" AS ENUM ('available', 'made_to_order', 'out_of_stock', 'discontinued');

-- CreateEnum
CREATE TYPE "address_label" AS ENUM ('home', 'work', 'other');

-- CreateEnum
CREATE TYPE "measurement_unit" AS ENUM ('cm', 'in');

-- CreateEnum
CREATE TYPE "fit_preference" AS ENUM ('fitted', 'regular', 'relaxed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "kind" "user_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "session_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "default_address_id" TEXT,
    "accepts_marketing" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" "address_label" NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "locality" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "country" TEXT NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" "measurement_unit" NOT NULL,
    "fit_preference" "fit_preference",
    "notes" TEXT,
    "is_default" BOOLEAN NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "measurement_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_values" (
    "profile_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "measurement_values_pkey" PRIMARY KEY ("profile_id","key")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "media_id" TEXT,
    "sort_order" INTEGER NOT NULL,
    "status" "catalog_status" NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cover_media_id" TEXT,
    "sort_order" INTEGER NOT NULL,
    "status" "catalog_status" NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_description" TEXT,
    "description" TEXT NOT NULL,
    "category_id" TEXT,
    "price_amount" BIGINT NOT NULL,
    "price_currency" TEXT NOT NULL,
    "sale_price_amount" BIGINT,
    "sale_price_currency" TEXT,
    "status" "catalog_status" NOT NULL,
    "availability" "product_availability" NOT NULL,
    "is_featured" BOOLEAN NOT NULL,
    "fabric" TEXT,
    "colour" TEXT,
    "occasion" TEXT,
    "work" TEXT,
    "fit" TEXT,
    "attributes_extra" JSONB,
    "tags" TEXT[],
    "stitching_available" BOOLEAN NOT NULL,
    "customization_available" BOOLEAN NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_secondary_categories" (
    "product_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "product_secondary_categories_pkey" PRIMARY KEY ("product_id","category_id")
);

-- CreateTable
CREATE TABLE "product_collections" (
    "product_id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "product_collections_pkey" PRIMARY KEY ("product_id","collection_id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "wishlist_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" TEXT NOT NULL,
    "cart_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_amount" BIGINT NOT NULL,
    "unit_price_currency" TEXT NOT NULL,
    "configuration_key" TEXT NOT NULL,
    "stitching" JSONB,
    "customization_request_id" TEXT,
    "notes" TEXT,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_credentials_user_id_key" ON "auth_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_user_id_key" ON "customer_profiles"("user_id");

-- CreateIndex
CREATE INDEX "customer_addresses_profile_id_idx" ON "customer_addresses"("profile_id");

-- CreateIndex
CREATE INDEX "measurement_profiles_user_id_idx" ON "measurement_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_status_idx" ON "categories"("status");

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");

-- CreateIndex
CREATE INDEX "collections_status_idx" ON "collections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_availability_idx" ON "products"("availability");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "product_secondary_categories_category_id_idx" ON "product_secondary_categories"("category_id");

-- CreateIndex
CREATE INDEX "product_collections_collection_id_idx" ON "product_collections"("collection_id");

-- CreateIndex
CREATE INDEX "product_media_product_id_idx" ON "product_media"("product_id");

-- CreateIndex
CREATE INDEX "product_media_media_id_idx" ON "product_media"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_media_product_id_media_id_key" ON "product_media"("product_id", "media_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_user_id_key" ON "wishlists"("user_id");

-- CreateIndex
CREATE INDEX "wishlist_items_wishlist_id_idx" ON "wishlist_items"("wishlist_id");

-- CreateIndex
CREATE INDEX "wishlist_items_product_id_idx" ON "wishlist_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_wishlist_id_product_id_key" ON "wishlist_items"("wishlist_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");

-- CreateIndex
CREATE INDEX "cart_items_product_id_idx" ON "cart_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_product_id_configuration_key_key" ON "cart_items"("cart_id", "product_id", "configuration_key");

-- AddForeignKey
ALTER TABLE "auth_credentials" ADD CONSTRAINT "auth_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_default_address_id_fkey" FOREIGN KEY ("default_address_id") REFERENCES "customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_profiles" ADD CONSTRAINT "measurement_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_values" ADD CONSTRAINT "measurement_values_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "measurement_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_secondary_categories" ADD CONSTRAINT "product_secondary_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_secondary_categories" ADD CONSTRAINT "product_secondary_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_fkey" FOREIGN KEY ("wishlist_id") REFERENCES "wishlists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Check constraints (hand-added; Prisma's DSL cannot express these) ──
-- Money is integer paise and can never be negative; quantities start at 1;
-- sessionVersion starts at 1 and only counts up (monotonicity itself is
-- enforced in the repository layer — this guards the floor).

ALTER TABLE "products"
  ADD CONSTRAINT "products_price_amount_nonnegative" CHECK ("price_amount" >= 0),
  ADD CONSTRAINT "products_sale_price_amount_nonnegative" CHECK ("sale_price_amount" IS NULL OR "sale_price_amount" >= 0);

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_positive" CHECK ("quantity" >= 1),
  ADD CONSTRAINT "cart_items_unit_price_amount_nonnegative" CHECK ("unit_price_amount" >= 0);

ALTER TABLE "auth_credentials"
  ADD CONSTRAINT "auth_credentials_session_version_positive" CHECK ("session_version" >= 1);
