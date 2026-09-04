import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, encryptSecret, decryptSecret, hmacHex } from '../apps/api/src/lib/crypto.js';

test('password hashing is salted and verifiable', async () => {
  const a=await hashPassword('A-strong-demo-password-2026!');
  const b=await hashPassword('A-strong-demo-password-2026!');
  assert.notEqual(a,b);
  assert.equal(await verifyPassword('A-strong-demo-password-2026!',a),true);
  assert.equal(await verifyPassword('wrong-password',a),false);
});

test('encrypted MFA secret round trips', () => {
  const key=Buffer.alloc(32,7).toString('base64');
  const enc=encryptSecret('JBSWY3DPEHPK3PXP',key);
  assert.notEqual(enc,'JBSWY3DPEHPK3PXP');
  assert.equal(decryptSecret(enc,key),'JBSWY3DPEHPK3PXP');
});

test('HMAC is deterministic but keyed', () => {
  assert.equal(hmacHex('a'.repeat(32),'x'),hmacHex('a'.repeat(32),'x'));
  assert.notEqual(hmacHex('a'.repeat(32),'x'),hmacHex('b'.repeat(32),'x'));
});
