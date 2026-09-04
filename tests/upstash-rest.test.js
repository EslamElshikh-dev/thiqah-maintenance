import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpstashRestRedis } from '../apps/api/src/plugins/upstash-rest-rate-limit.js';

function callbackResult(invoke) {
  return new Promise((resolve, reject) => invoke((error, value) => error ? reject(error) : resolve(value)));
}

test('Upstash REST adapter pings without exposing credentials in payload', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, async json() { return { result: 'PONG' }; } };
  };
  const redis = createUpstashRestRedis({
    upstashRedisRestUrl: 'https://example.upstash.io',
    upstashRedisRestToken: 'x'.repeat(32)
  }, { fetchImpl });
  assert.equal(await redis.ping(), 'PONG');
  assert.equal(redis.kind, 'upstash-rest');
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), ['PING']);
  assert.match(calls[0].options.headers.authorization, /^Bearer /);
});

test('Upstash REST rate-limit store uses atomic EVAL with millisecond TTL', async () => {
  const commands = [];
  const fetchImpl = async (url, options) => {
    const command = JSON.parse(options.body);
    commands.push(command);
    return { ok: true, status: 200, async json() { return { result: [1, 60000] }; } };
  };
  const redis = createUpstashRestRedis({
    upstashRedisRestUrl: 'https://example.upstash.io',
    upstashRedisRestToken: 'y'.repeat(32)
  }, { fetchImpl });
  const Store = redis.rateLimitStore;
  const store = new Store({ max: 120 });
  const result = await callbackResult((cb) => store.incr('203.0.113.7', cb, 60000, 120));
  assert.deepEqual(result, { current: 1, ttl: 60000 });
  assert.equal(commands.length, 1);
  assert.equal(commands[0][0], 'EVAL');
  assert.equal(commands[0][2], '1');
  assert.equal(commands[0][3], 'thiqah:ratelimit:203.0.113.7');
  assert.equal(commands[0][4], '60000');
  assert.match(commands[0][1], /INCR/);
  assert.match(commands[0][1], /PEXPIRE/);
  assert.match(commands[0][1], /PTTL/);
});

test('Upstash REST store read is non-mutating and child preserves behavior', async () => {
  const commands = [];
  const fetchImpl = async (url, options) => {
    commands.push(JSON.parse(options.body));
    return { ok: true, status: 200, async json() { return { result: [4, 12500] }; } };
  };
  const redis = createUpstashRestRedis({
    upstashRedisRestUrl: 'https://example.upstash.io',
    upstashRedisRestToken: 'z'.repeat(32)
  }, { fetchImpl });
  const store = new redis.rateLimitStore({ max: 10 });
  const child = store.child({ max: 5 });
  const result = await callbackResult((cb) => child.read('198.51.100.8', cb, 30000, 5));
  assert.deepEqual(result, { current: 4, ttl: 12500 });
  assert.equal(commands[0][0], 'EVAL');
  assert.match(commands[0][1], /GET/);
  assert.doesNotMatch(commands[0][1], /INCR/);
});
