-- Phase 9: customer customization workflow and request context.
ALTER TYPE "customization_status" ADD VALUE 'pending';
ALTER TYPE "customization_status" ADD VALUE 'reviewing';
ALTER TYPE "customization_status" ADD VALUE 'in_progress';
ALTER TYPE "customization_status" ADD VALUE 'completed';
ALTER TYPE "customization_status" ADD VALUE 'cancelled';

ALTER TABLE "customization_requests"
  ADD COLUMN "order_id" TEXT,
  ADD COLUMN "order_item_id" TEXT;
CREATE INDEX "customization_requests_order_id_idx" ON "customization_requests"("order_id");
CREATE INDEX "customization_requests_order_item_id_idx" ON "customization_requests"("order_item_id");
ALTER TABLE "customization_requests" ADD CONSTRAINT "customization_requests_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customization_requests" ADD CONSTRAINT "customization_requests_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "customization_activities" (
  "id" TEXT NOT NULL,
  "customization_request_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "from_status" "customization_status",
  "to_status" "customization_status",
  "created_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customization_activities_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "customization_notes" (
  "id" TEXT NOT NULL,
  "customization_request_id" TEXT NOT NULL,
  "author_user_id" TEXT,
  "author_name" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customization_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customization_activities_request_created_idx" ON "customization_activities"("customization_request_id", "created_at");
CREATE INDEX "customization_notes_request_created_idx" ON "customization_notes"("customization_request_id", "created_at");
ALTER TABLE "customization_activities" ADD CONSTRAINT "customization_activities_request_fkey"
  FOREIGN KEY ("customization_request_id") REFERENCES "customization_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customization_activities" ADD CONSTRAINT "customization_activities_actor_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customization_notes" ADD CONSTRAINT "customization_notes_request_fkey"
  FOREIGN KEY ("customization_request_id") REFERENCES "customization_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customization_notes" ADD CONSTRAINT "customization_notes_author_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customization_notes"
  ADD CONSTRAINT "customization_notes_body_nonempty" CHECK (length(btrim("body")) BETWEEN 1 AND 2000);
