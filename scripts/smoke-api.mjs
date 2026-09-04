const base = String(process.argv[2] || '').replace(/\/$/, '');
if (!base.startsWith('https://')) throw new Error('Usage: node scripts/smoke-api.mjs https://service-url');

async function check(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${base}${path}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) throw new Error(`${path} failed: HTTP ${response.status}`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

await check('/health/live');
await check('/health/ready');
console.log('API smoke checks passed');
