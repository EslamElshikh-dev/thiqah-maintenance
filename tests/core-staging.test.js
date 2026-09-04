import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUnavailableService } from '../apps/api/src/services/unavailable.js';

test('core staging unavailable dependencies fail closed with HTTP 503 semantics', async () => {
  const service = createUnavailableService('storage');
  assert.equal(service.kind, 'unavailable');
  assert.equal(service.status, 'unavailable');
  await assert.rejects(
    () => service.createUploadIntent({}),
    (error) => error?.statusCode === 503 && error?.code === 'DEPENDENCY_NOT_CONFIGURED'
  );
});

test('Render core staging blueprint asks only for Neon and Upstash runtime secrets', () => {
  const yaml = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');
  assert.match(yaml, /CORE_STAGING_MODE\n\s+value: "true"/);
  assert.match(yaml, /R2_ACCOUNT_ID\n\s+value: not-configured/);
  assert.match(yaml, /UNIFONIC_APPSID\n\s+value: not-configured/);
  assert.match(yaml, /RESEND_API_KEY\n\s+value: not-configured/);
  assert.equal((yaml.match(/sync: false/g) || []).length, 3);
  assert.match(yaml, /DATABASE_URL\n\s+sync: false/);
  assert.match(yaml, /UPSTASH_REDIS_REST_URL\n\s+sync: false/);
  assert.match(yaml, /UPSTASH_REDIS_REST_TOKEN\n\s+sync: false/);
});
