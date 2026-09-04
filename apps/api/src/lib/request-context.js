import { hmacHex } from './crypto.js';

function prefixIp(value) {
  const raw = String(value || '');
  if (!raw) return '';
  if (raw.includes(':')) {
    return raw.split(':').slice(0, 4).join(':');
  }
  return raw.split('.').slice(0, 3).join('.');
}

export function requestContext(config, request) {
  return {
    requestId: request.id,
    userAgentHash: hmacHex(config.piiHashKey, request.headers['user-agent'] || ''),
    ipPrefixHash: hmacHex(config.piiHashKey, prefixIp(request.ip))
  };
}
