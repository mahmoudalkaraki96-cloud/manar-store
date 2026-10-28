/** Permission resolution for admin users. Authentication is a separate concern. */
export const ADMIN_PERMISSIONS = [
  'dashboard.read', 'analytics.read', 'orders.read', 'orders.write',
  'orders.delete', 'customers.read', 'customers.write', 'customers.password',
  'products.read', 'products.write', 'categories.read', 'categories.write',
  'content.read', 'content.write', 'inventory.read', 'inventory.write',
  'suppliers.read', 'suppliers.write', 'shipping.read', 'shipping.write',
  'settings.read', 'settings.write', 'notifications.write', 'users.manage',
  'groups.manage', 'audit.read',
] as const;

export type AdminPermission = typeof ADMIN_PERMISSIONS[number];
const known = new Set<string>(ADMIN_PERMISSIONS);

export function effectivePermissions(
  groups: readonly (readonly string[])[],
  direct: readonly string[],
): Set<AdminPermission> {
  const result = new Set<AdminPermission>();
  for (const permission of [...groups.flat(), ...direct]) {
    if (known.has(permission)) result.add(permission as AdminPermission);
  }
  return result;
}

export function hasPermission(
  permissions: ReadonlySet<AdminPermission>, permission: AdminPermission,
): boolean {
  return permissions.has(permission);
}

