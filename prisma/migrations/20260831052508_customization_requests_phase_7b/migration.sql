-- CreateEnum
CREATE TYPE "customization_status" AS ENUM ('draft', 'quoted', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "customization_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT,
    "measurement_profile_id" TEXT,
    "details" TEXT NOT NULL,
    "status" "customization_status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customization_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customization_requests_user_id_idx" ON "customization_requests"("user_id");

-- AddForeignKey
ALTER TABLE "customization_requests" ADD CONSTRAINT "customization_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customization_requests" ADD CONSTRAINT "customization_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customization_requests" ADD CONSTRAINT "customization_requests_measurement_profile_id_fkey" FOREIGN KEY ("measurement_profile_id") REFERENCES "measurement_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-appended (Phase 7B discipline): customer free text is app-capped at
-- 1000 chars; the database refuses anything the application layer missed.
ALTER TABLE "customization_requests"
  ADD CONSTRAINT "customization_requests_details_length" CHECK (char_length("details") BETWEEN 1 AND 1000);
