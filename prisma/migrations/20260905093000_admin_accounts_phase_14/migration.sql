-- Phase 14: real admin accounts. Replaces the single-shared-password admin
-- gate with per-employee accounts: a User (kind = admin) + AuthCredential
-- (reused, kind-agnostic) + a Role via AdminUser. Role rows are fixed,
-- seeded reference data — the four roles already defined in
-- src/lib/auth/roles.ts, given stable well-known ids so application code
-- can reference them without a lookup.
--
-- SECURITY: nothing in this migration or the tables it creates is reachable
-- from a public/customer-facing code path. Becoming an admin requires a row
-- in admin_users, which only a server-side, already-authorized-owner action
-- (or the one-time bootstrap script) ever inserts.

CREATE TABLE "roles" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "permissions" TEXT[] NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

CREATE TABLE "admin_users" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_users_user_id_key" ON "admin_users"("user_id");
CREATE INDEX "admin_users_role_id_idx" ON "admin_users"("role_id");
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the four fixed roles, matching src/lib/auth/roles.ts exactly.
INSERT INTO "roles" ("id", "name", "permissions", "created_at", "updated_at") VALUES
  ('role-owner', 'owner', ARRAY[
    'orders.read','orders.write','products.read','products.write',
    'inventory.read','inventory.write','customers.read','customers.write',
    'appointments.read','appointments.write','payments.read','payments.write',
    'shipping.read','shipping.write','staff.manage','settings.manage',
    'content.manage','analytics.read','audit.read'
  ], now(), now()),
  ('role-manager', 'manager', ARRAY[
    'orders.read','orders.write','products.read','products.write',
    'inventory.read','inventory.write','customers.read','customers.write',
    'appointments.read','appointments.write','payments.read',
    'shipping.read','shipping.write','analytics.read'
  ], now(), now()),
  ('role-tailor', 'tailor', ARRAY[
    'orders.read','appointments.read','inventory.read'
  ], now(), now()),
  ('role-staff', 'staff', ARRAY[
    'orders.read','customers.read','appointments.read','appointments.write'
  ], now(), now());
