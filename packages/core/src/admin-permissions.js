export const ADMIN_PERMISSIONS = Object.freeze([
  'dashboard.read',
  'customers.read',
  'orders.read',
  'orders.manage',
  'quotes.manage',
  'technicians.read',
  'technicians.manage',
  'staff.manage'
]);

export const TECHNICIAN_PERMISSIONS = Object.freeze([
  'assigned_orders.read',
  'order_status.update',
  'work_media.upload',
  'work_notes.create'
]);

export const ADMIN_ROLE_DEFAULTS = Object.freeze({
  owner: ADMIN_PERMISSIONS,
  admin: ADMIN_PERMISSIONS.filter((permission) => permission !== 'staff.manage'),
  operator: ['dashboard.read', 'customers.read', 'orders.read', 'orders.manage', 'technicians.read'],
  support: ['dashboard.read', 'customers.read', 'orders.read'],
  finance: ['dashboard.read', 'orders.read', 'quotes.manage']
});

export function validatePermissions(input, allowed, field = 'permissions') {
  if (!Array.isArray(input)) {
    const error = new Error(`${field} must be an array`);
    error.code = 'VALIDATION_ERROR';
    error.field = field;
    throw error;
  }
  const unique = [...new Set(input.map((value) => String(value).trim()))];
  if (unique.some((permission) => !allowed.includes(permission))) {
    const error = new Error(`${field} contains an unsupported permission`);
    error.code = 'VALIDATION_ERROR';
    error.field = field;
    throw error;
  }
  return unique;
}

export function effectiveAdminPermissions(actor) {
  if (actor?.role === 'owner') return [...ADMIN_PERMISSIONS];
  if (Array.isArray(actor?.permissions)) return actor.permissions;
  return [...(ADMIN_ROLE_DEFAULTS[actor?.role] || [])];
}

export function hasAdminPermission(actor, permission) {
  return effectiveAdminPermissions(actor).includes(permission);
}

export function effectiveTechnicianPermissions(actor) {
  if (Array.isArray(actor?.permissions)) return actor.permissions;
  return [...TECHNICIAN_PERMISSIONS];
}

export function hasTechnicianPermission(actor, permission) {
  return effectiveTechnicianPermissions(actor).includes(permission);
}
