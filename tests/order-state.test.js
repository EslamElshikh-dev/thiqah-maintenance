import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, allowedTransitions, assertTransition } from '../packages/core/src/order-state.js';

test('customer can approve a quote but cannot assign a technician', () => {
  assert.equal(canTransition('quoted', 'customer_approved', 'customer'), true);
  assert.equal(canTransition('customer_approved', 'assigned', 'customer'), false);
});

test('technician flow is constrained', () => {
  assert.equal(canTransition('assigned', 'technician_accepted', 'technician'), true);
  assert.equal(canTransition('assigned', 'completed', 'technician'), false);
  assert.deepEqual(allowedTransitions('on_the_way', 'technician'), ['in_progress']);
});

test('terminal states cannot transition', () => {
  assert.equal(allowedTransitions('completed', 'admin').length, 0);
  assert.throws(() => assertTransition('completed', 'in_progress', 'admin'), /Invalid order transition/);
});
