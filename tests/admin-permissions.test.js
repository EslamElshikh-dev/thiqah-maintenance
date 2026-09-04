import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_DEFAULTS,
  TECHNICIAN_PERMISSIONS,
  effectiveAdminPermissions,
  effectiveTechnicianPermissions,
  hasAdminPermission,
  hasTechnicianPermission,
  validatePermissions
} from '../packages/core/src/admin-permissions.js';

test('owner always receives the complete admin permission set', () => {
  assert.deepEqual(effectiveAdminPermissions({ role: 'owner', permissions: [] }), [...ADMIN_PERMISSIONS]);
});

test('legacy employee rows use role defaults when permissions are null', () => {
  assert.deepEqual(effectiveAdminPermissions({ role: 'support', permissions: null }), ADMIN_ROLE_DEFAULTS.support);
  assert.equal(hasAdminPermission({ role: 'support', permissions: null }, 'customers.read'), true);
  assert.equal(hasAdminPermission({ role: 'support', permissions: null }, 'staff.manage'), false);
});

test('explicit permission grants override employee role defaults', () => {
  const actor = { role: 'operator', permissions: ['dashboard.read'] };
  assert.equal(hasAdminPermission(actor, 'dashboard.read'), true);
  assert.equal(hasAdminPermission(actor, 'orders.manage'), false);
});

test('permission validation rejects unsupported grants and removes duplicates', () => {
  assert.deepEqual(validatePermissions(['assigned_orders.read', 'assigned_orders.read'], TECHNICIAN_PERMISSIONS), ['assigned_orders.read']);
  assert.throws(
    () => validatePermissions(['staff.manage'], TECHNICIAN_PERMISSIONS),
    (error) => error.code === 'VALIDATION_ERROR' && error.field === 'permissions'
  );
});

test('technician grants default safely and explicit restrictions are enforced', () => {
  assert.deepEqual(effectiveTechnicianPermissions({ permissions: null }), [...TECHNICIAN_PERMISSIONS]);
  assert.equal(hasTechnicianPermission({ permissions: ['assigned_orders.read'] }, 'assigned_orders.read'), true);
  assert.equal(hasTechnicianPermission({ permissions: ['assigned_orders.read'] }, 'work_media.upload'), false);
});
