import type { Permission, RoleName } from "@/types/domain";

/**
 * Role → permission map (foundation).
 * Later phases load roles from the database; UI code should keep calling
 * `hasPermission` so the storage swap is invisible.
 */
export const rolePermissions: Record<RoleName, ReadonlyArray<Permission>> = {
  owner: [
    "orders.read",
    "orders.write",
    "products.read",
    "products.write",
    "inventory.read",
    "inventory.write",
    "customers.read",
    "customers.write",
    "appointments.read",
    "appointments.write",
    "payments.read",
    "payments.write",
    "shipping.read",
    "shipping.write",
    "staff.manage",
    "settings.manage",
    "content.manage",
    "analytics.read",
    "audit.read",
  ],
  manager: [
    "orders.read",
    "orders.write",
    "products.read",
    "products.write",
    "inventory.read",
    "inventory.write",
    "customers.read",
    "customers.write",
    "appointments.read",
    "appointments.write",
    "payments.read",
    "shipping.read",
    "shipping.write",
    "analytics.read",
  ],
  tailor: ["orders.read", "appointments.read", "inventory.read"],
  staff: ["orders.read", "customers.read", "appointments.read", "appointments.write"],
};

export function hasPermission(role: RoleName, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}
