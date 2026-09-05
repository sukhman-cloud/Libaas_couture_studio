import "server-only";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/admin-guard";
import { hasPermission } from "@/lib/auth/roles";
import { getRepositories } from "@/server/data";
import type { RoleName } from "@/types/domain";

export interface AdminAccountListItem {
  id: string;
  name: string;
  email?: string;
  isActive: boolean;
  role: RoleName;
  createdAt: string;
}

async function requireStaffRead() {
  const session = await requireAdminSession();
  if (!hasPermission(session.role, "staff.manage")) redirect("/admin");
  return session;
}

/**
 * Every admin account, newest first — the roster shown on /admin/staff.
 * Gated on "staff.manage" (the same permission createStaffAccount
 * requires), so only an owner/authorized admin can see who has access.
 */
export async function listAdminAccounts(): Promise<AdminAccountListItem[]> {
  await requireStaffRead();
  const repos = getRepositories();

  const adminUsers = await repos.adminUsers.list();
  const [users, roles] = await Promise.all([
    Promise.all(adminUsers.map((a) => repos.users.getById(a.userId))),
    repos.roles.list(),
  ]);
  const roleById = new Map(roles.map((r) => [r.id, r.name]));

  return adminUsers
    .map((adminUser, index) => {
      const user = users[index];
      if (!user) return null;
      const role = roleById.get(adminUser.roleId);
      if (!role) return null;
      return {
        id: user.id,
        name: user.name,
        ...(user.email ? { email: user.email } : {}),
        isActive: user.isActive,
        role,
        createdAt: adminUser.createdAt,
      };
    })
    .filter((item): item is AdminAccountListItem => item !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
