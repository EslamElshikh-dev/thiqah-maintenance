import Redis from 'ioredis';

export function createRedis(config) {
  if (!config.redisUrl) return null;
  const tls = config.redisUrl.startsWith('rediss://')
    ? {
        minVersion: 'TLSv1.2',
        ...(config.redisCaCertBase64 ? { ca: Buffer.from(config.redisCaCertBase64, 'base64').toString('utf8') } : {})
      }
    : undefined;
  return new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    connectTimeout: 8_000,
    commandTimeout: 5_000,
    tls
  });
}
