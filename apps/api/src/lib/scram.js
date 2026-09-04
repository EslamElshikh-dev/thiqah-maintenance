import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

const DEFAULT_ITERATIONS = 4096;
const KEY_LENGTH = 32;

export function createPostgresScramVerifier(password, options = {}) {
  if (typeof password !== 'string' || password.length < 32 || password.length > 256) {
    throw new Error('PostgreSQL runtime password must be 32-256 characters');
  }
  if (!/^[\x20-\x7E]+$/.test(password)) {
    throw new Error('PostgreSQL runtime password must use printable ASCII characters');
  }

  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < 4096 || iterations > 100000) {
    throw new Error('SCRAM iterations must be an integer between 4096 and 100000');
  }

  const salt = options.salt ? Buffer.from(options.salt) : randomBytes(16);
  if (salt.length < 16) throw new Error('SCRAM salt must be at least 16 bytes');

  const saltedPassword = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, KEY_LENGTH, 'sha256');
  const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', saltedPassword).update('Server Key').digest();

  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

export function isPostgresScramVerifier(value) {
  return /^SCRAM-SHA-256\$[0-9]+:[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/.test(String(value || ''));
}
