import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSaudiPhone, assertSaudiMobile } from '../packages/core/src/phone.js';

test('normalizes Saudi mobile variants', () => {
  assert.equal(normalizeSaudiPhone('+966 55 123 4567'), '0551234567');
  assert.equal(normalizeSaudiPhone('00966551234567'), '0551234567');
  assert.equal(normalizeSaudiPhone('551234567'), '0551234567');
});

test('rejects malformed numbers', () => {
  assert.throws(() => assertSaudiMobile('123'), /Invalid Saudi mobile/);
});
