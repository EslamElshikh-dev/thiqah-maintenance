import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const webRoot = new URL('../apps/web/', import.meta.url);

test('browser API traffic stays first-party through the Vercel proxy', () => {
  const vercel = JSON.parse(readFileSync(new URL('vercel.json', webRoot), 'utf8'));
  assert.deepEqual(vercel.rewrites, [{
    source: '/api/:path*',
    destination: 'https://thiqah-staging-api.onrender.com/:path*'
  }]);

  for (const page of ['index.html', 'admin.html', 'customer-login.html']) {
    const html = readFileSync(new URL(page, webRoot), 'utf8');
    assert.match(html, /<meta name="api-base" content="\/api">/);
    assert.doesNotMatch(html, /<meta name="api-base" content="https:\/\//);
  }
});
