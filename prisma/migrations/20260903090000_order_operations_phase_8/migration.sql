-- Phase 8: order workflow, immutable activity history, and private notes.
ALTER TYPE "order_status" ADD VALUE 'confirmed';
ALTER TYPE "order_status" ADD VALUE 'processing';
ALTER TYPE "order_status" ADD VALUE 'ready';
ALTER TYPE "order_status" ADD VALUE 'completed';
ALTER TYPE "order_status" ADD VALUE 'cancelled';

CREATE TABLE "order_activities" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "from_status" "order_status",
    "to_status" "order_status",
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "order_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_notes" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "author_user_id" TEXT,
    "author_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_activities_order_id_created_at_idx" ON "order_activities"("order_id", "created_at");
CREATE INDEX "order_notes_order_id_created_at_idx" ON "order_notes"("order_id", "created_at");

ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_notes"
  ADD CONSTRAINT "order_notes_body_nonempty" CHECK (length(btrim("body")) BETWEEN 1 AND 2000);
