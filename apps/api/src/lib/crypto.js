import {
  createCipheriv, createDecipheriv, createHash, createHmac,
  randomBytes, scrypt as scryptCb, timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function hmacHex(key, value) {
  return createHmac('sha256', key).update(String(value)).digest('hex');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqualText(a,b){
  const left=Buffer.from(String(a));
  const right=Buffer.from(String(b));
  return left.length===right.length && timingSafeEqual(left,right);
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) {
    const error = new Error('Password must be 10-256 characters');
    error.code = 'WEAK_PASSWORD';
    throw error;
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const [kind, n, r, p, saltB64, hashB64] = String(encoded).split('$');
    if (kind !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const actual = Buffer.from(await scrypt(password, salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024
    }));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext, keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptSecret(encoded, keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  const [ivB64, tagB64, dataB64] = String(encoded).split('.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}
