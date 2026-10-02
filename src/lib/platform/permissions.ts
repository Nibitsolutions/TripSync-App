// Permission map (architecture §4.2 / §4.4). The role → permission matrix lives
// only here so it can change without touching endpoint code.

export const PERMISSIONS = [
  "agencies.read",
  "agencies.create_trial",
  "agencies.edit_profile",
  "agencies.suspend",
  "agencies.activate",
  "agencies.extend_complimentary",
  "agencies.set_limits",
  "agencies.offboard",
  "agencies.assign_owner",
  "orders.read",
  "orders.create",
  "orders.approve",
  "orders.reject",
  "orders.reverse",
  "pricing.read",
  "pricing.write",
  "earners.read",
  "earners.write",
  "payouts.write",
  "analytics.read",
  "support.read",
  "support.reply",
  "support.reassign",
  "broadcast.read",
  "broadcast.send",
  "maintenance.read",
  "maintenance.write",
  "archive.read",
  "archive.manage",
  "costs.read",
  "costs.write",
  "team.manage",
  "audit.read",
  "settings.read",
  "settings.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type PlatformRole = "SuperAdmin" | "Manager" | "SalesExecutive";

const MANAGER: Permission[] = [
  "agencies.read",
  "agencies.create_trial",
  "agencies.edit_profile",
  "orders.read",
  "orders.create",
  "orders.approve",
  "orders.reject",
  "pricing.read",
  "earners.read",
  "analytics.read",
  "support.read",
  "support.reply",
  "support.reassign",
  "broadcast.read",
  "maintenance.read",
  "archive.read",
  "costs.read",
  "audit.read",
  "settings.read",
];

// Sales Executive permissions are additionally row-scoped (see scope.ts).
const SALES_EXECUTIVE: Permission[] = [
  "agencies.read",
  "agencies.create_trial",
  "orders.read",
  "orders.create",
  "pricing.read",
  "earners.read",
  "support.read",
  "support.reply",
];

export const ROLE_PERMISSIONS: Record<PlatformRole, readonly Permission[]> = {
  SuperAdmin: PERMISSIONS,
  Manager: MANAGER,
  SalesExecutive: SALES_EXECUTIVE,
};

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  SuperAdmin: "Super Admin",
  Manager: "Manager",
  SalesExecutive: "Sales Executive",
};

export function isPlatformRole(role: string | undefined | null): role is PlatformRole {
  return role === "SuperAdmin" || role === "Manager" || role === "SalesExecutive";
}

export function can(role: string | undefined | null, permission: Permission): boolean {
  if (!isPlatformRole(role)) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: string | undefined | null): Permission[] {
  if (!isPlatformRole(role)) return [];
  return [...ROLE_PERMISSIONS[role]];
}
