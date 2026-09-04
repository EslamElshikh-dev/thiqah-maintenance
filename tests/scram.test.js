import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresScramVerifier, isPostgresScramVerifier } from '../apps/api/src/lib/scram.js';

const password = 'Thiqah-runtime-demo-password-2026-strong!';
const salt = Buffer.alloc(16, 7);

test('PostgreSQL SCRAM verifier is deterministic with a fixed salt', () => {
  const a = createPostgresScramVerifier(password, { salt });
  const b = createPostgresScramVerifier(password, { salt });
  assert.equal(a, b);
  assert.equal(isPostgresScramVerifier(a), true);
  assert.match(a, /^SCRAM-SHA-256\$4096:/);
});

test('PostgreSQL SCRAM verifier changes with password', () => {
  const a = createPostgresScramVerifier(password, { salt });
  const b = createPostgresScramVerifier(`${password}x`, { salt });
  assert.notEqual(a, b);
});

test('PostgreSQL SCRAM verifier rejects weak runtime passwords', () => {
  assert.throws(() => createPostgresScramVerifier('too-short', { salt }), /32-256/);
});
