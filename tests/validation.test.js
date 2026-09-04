import test from 'node:test';
import assert from 'node:assert/strict';
import { assertUuid, assertEmail, requireString } from '../packages/core/src/validation.js';

test('assertUuid accepts RFC-compatible UUID values', () => {
  assert.equal(assertUuid('550e8400-e29b-41d4-a716-446655440000'), '550e8400-e29b-41d4-a716-446655440000');
});

test('assertUuid rejects malformed identifiers before database access', () => {
  assert.throws(
    () => assertUuid('not-a-uuid', 'orderId'),
    (error) => error?.code === 'VALIDATION_ERROR' && error?.field === 'orderId'
  );
});

test('email validation normalizes case and rejects malformed addresses', () => {
  assert.equal(assertEmail('  USER@Example.COM '), 'user@example.com');
  assert.throws(() => assertEmail('invalid'), (error) => error?.code === 'VALIDATION_ERROR');
});

test('requireString enforces length constraints', () => {
  assert.equal(requireString('  ثقة  ', 'name', { min: 2, max: 20 }), 'ثقة');
  assert.throws(() => requireString('x', 'name', { min: 2, max: 20 }), (error) => error?.code === 'VALIDATION_ERROR');
});

test('date, timestamp and integer validators reject database-type garbage early', async () => {
  const { optionalIsoDate, optionalIsoTimestamp, boundedInteger } = await import('../packages/core/src/validation.js');
  assert.equal(optionalIsoDate('2026-09-04', 'date'), '2026-09-04');
  assert.throws(() => optionalIsoDate('2026-02-31', 'date'), (error) => error?.code === 'VALIDATION_ERROR');
  assert.equal(optionalIsoTimestamp('2026-09-04T00:00:00Z', 'cursor'), '2026-09-04T00:00:00.000Z');
  assert.throws(() => optionalIsoTimestamp('yesterday-ish', 'cursor'), (error) => error?.code === 'VALIDATION_ERROR');
  assert.equal(boundedInteger('20', 'limit', { min: 1, max: 50, fallback: 10 }), 20);
  assert.throws(() => boundedInteger('NaN', 'limit', { min: 1, max: 50, fallback: 10 }), (error) => error?.code === 'VALIDATION_ERROR');
});
