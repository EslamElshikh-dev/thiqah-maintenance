import { randomToken, hmacHex, safeEqualText } from './crypto.js';
import { unauthorized, forbidden } from './http.js';

function tokenFromRequest(config, request) {
  const auth = request.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return { token: auth.slice(7).trim(), clientType: 'mobile' };
  const cookie = request.cookies?.[config.sessionCookieName];
  if (cookie) return { token: cookie, clientType: 'web' };
  return null;
}

export async function createSession({ db, config, actorType, actorId, clientType, context }) {
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const tokenHash = hmacHex(config.sessionHmacKey, token);
  const csrfHash = hmacHex(config.sessionHmacKey, csrfToken);
  const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000);
  await db.query(
    `INSERT INTO thiqah.auth_sessions
      (actor_type, actor_id, token_hash, csrf_token_hash, client_type, expires_at, user_agent_hash, ip_prefix_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [actorType, actorId, tokenHash, csrfHash, clientType, expiresAt, context.userAgentHash, context.ipPrefixHash]
  );
  return { token, csrfToken, expiresAt };
}

export async function loadSession({ db, config, request }) {
  const presented = tokenFromRequest(config, request);
  if (!presented?.token) return null;
  const tokenHash = hmacHex(config.sessionHmacKey, presented.token);
  const result = await db.query(
    `SELECT id, actor_type, actor_id, csrf_token_hash, client_type, expires_at
       FROM thiqah.auth_sessions
      WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()
      LIMIT 1`,
    [tokenHash]
  );
  if (!result.rows[0]) return null;
  return { ...result.rows[0], transport: presented.clientType };
}

export function setSessionCookie(reply, config, token, expiresAt) {
  reply.setCookie(config.sessionCookieName, token, {
    path: '/',
    httpOnly: true,
    secure: config.isDeployed,
    sameSite: config.sessionCookieSameSite,
    expires: expiresAt,
    priority: 'high'
  });
}

export function clearSessionCookie(reply, config) {
  reply.clearCookie(config.sessionCookieName, {
    path: '/',
    secure: config.isDeployed,
    sameSite: config.sessionCookieSameSite
  });
}

export async function requireActor({ db, config, request, actorTypes }) {
  const session = await loadSession({ db, config, request });
  if (!session) throw unauthorized();
  if (!actorTypes.includes(session.actor_type)) throw forbidden();
  request.auth = session;
  return session;
}

export function requireCsrf(config, request) {
  if (!request.auth || request.auth.transport !== 'web') return;
  const csrf = request.headers['x-csrf-token'];
  if (!csrf) throw forbidden('Missing CSRF token');
  const provided = hmacHex(config.sessionHmacKey, csrf);
  if (!safeEqualText(provided, request.auth.csrf_token_hash)) throw forbidden('Invalid CSRF token');
  const origin = request.headers.origin;
  if (!origin || !config.publicAppOrigins.includes(origin.replace(/\/$/, ''))) {
    throw forbidden('Invalid request origin');
  }
}
