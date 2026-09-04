const RATE_LIMIT_PREFIX = 'thiqah:ratelimit:';
const INCR_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;
const READ_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then ttl = tonumber(ARGV[1]) end
return {current, ttl}
`;

function validateEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.upstash.io') || url.username || url.password) {
    throw new Error('UPSTASH_REDIS_REST_URL must be an HTTPS Upstash endpoint');
  }
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function normalizeCounterResult(result, fallbackTtl) {
  if (!Array.isArray(result) || result.length < 2) throw new Error('Unexpected Upstash rate-limit response');
  const current = Number(result[0]);
  const ttl = Number(result[1]);
  if (!Number.isFinite(current) || current < 0) throw new Error('Invalid Upstash rate-limit counter');
  return {
    current,
    ttl: Number.isFinite(ttl) && ttl >= 0 ? ttl : fallbackTtl
  };
}

export function createUpstashRestRedis(config, { fetchImpl = globalThis.fetch } = {}) {
  const endpoint = validateEndpoint(config.upstashRedisRestUrl);
  const token = String(config.upstashRedisRestToken || '');
  if (token.length < 16) throw new Error('UPSTASH_REDIS_REST_TOKEN is missing or invalid');
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is required for Upstash REST');

  const command = async (args) => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5_000)
    });
    if (!response.ok) throw new Error(`Upstash REST request failed with status ${response.status}`);
    const payload = await response.json();
    if (payload?.error) throw new Error('Upstash REST command failed');
    return payload?.result;
  };

  class UpstashRateLimitStore {
    constructor(options = {}) {
      this.options = { ...options };
    }

    incr(key, callback, timeWindow) {
      command(['EVAL', INCR_SCRIPT, '1', `${RATE_LIMIT_PREFIX}${key}`, String(timeWindow)])
        .then((result) => callback(null, normalizeCounterResult(result, timeWindow)))
        .catch((error) => callback(error));
    }

    read(key, callback, timeWindow) {
      command(['EVAL', READ_SCRIPT, '1', `${RATE_LIMIT_PREFIX}${key}`, String(timeWindow)])
        .then((result) => callback(null, normalizeCounterResult(result, timeWindow)))
        .catch((error) => callback(error));
    }

    child(routeOptions = {}) {
      return new UpstashRateLimitStore({ ...this.options, ...routeOptions });
    }
  }

  return {
    kind: 'upstash-rest',
    status: 'ready',
    rateLimitStore: UpstashRateLimitStore,
    async connect() { return this.ping(); },
    async ping() {
      const result = await command(['PING']);
      if (result !== 'PONG') throw new Error('Upstash REST ping failed');
      return result;
    },
    disconnect() {}
  };
}
