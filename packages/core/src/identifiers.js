import { randomBytes } from 'node:crypto';

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function publicTrackingToken() {
  return randomToken(24);
}

export function requestId() {
  return `req_${randomToken(12)}`;
}
