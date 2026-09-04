import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/r2-worker/src/index.js';
import { signR2WorkerUrl } from '../apps/api/src/services/storage-r2-worker.js';

const secret = 'r2-worker-test-key-0123456789-abcdef';
const config = {
  r2WorkerUrl: 'https://r2-broker.example.test',
  r2WorkerHmacKey: secret
};

function env(overrides = {}) {
  return {
    STORAGE_HMAC_KEY: secret,
    ALLOWED_ORIGINS: 'https://app.example.test',
    MEDIA: {
      async put() { return { httpEtag: '"etag-test"' }; },
      async head() { return null; },
      async get() { return null; },
      async delete() {},
      ...overrides
    }
  };
}

test('API signer and Worker verifier agree on a short-lived PUT contract', async () => {
  const signed = signR2WorkerUrl(config, 'PUT', 'orders/123/customer_problem/file.jpg', 300, {
    contentType: 'image/jpeg',
    size: 5
  });
  const response = await worker.fetch(new Request(signed.url, {
    method: 'PUT',
    headers: {
      'content-type': 'image/jpeg',
      'if-none-match': '*',
      'content-length': '5',
      origin: 'https://app.example.test'
    },
    body: 'abcde'
  }), env());
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.example.test');
});

test('R2 broker rejects tampered signatures and disallowed origins', async () => {
  const signed = signR2WorkerUrl(config, 'GET', 'orders/123/customer_problem/file.jpg', 300);
  const tampered = new URL(signed.url);
  tampered.searchParams.set('sig', `${tampered.searchParams.get('sig')}x`);
  const badSig = await worker.fetch(new Request(tampered), env());
  assert.equal(badSig.status, 401);

  const badOrigin = await worker.fetch(new Request(signed.url, {
    headers: { origin: 'https://evil.example' }
  }), env());
  assert.equal(badOrigin.status, 403);
});

test('R2 broker rejects a PUT whose declared size does not match the request', async () => {
  const signed = signR2WorkerUrl(config, 'PUT', 'orders/123/customer_problem/file.jpg', 300, {
    contentType: 'image/jpeg',
    size: 6
  });
  const response = await worker.fetch(new Request(signed.url, {
    method: 'PUT',
    headers: {
      'content-type': 'image/jpeg',
      'if-none-match': '*',
      'content-length': '5'
    },
    body: 'abcde'
  }), env());
  assert.equal(response.status, 400);
});
