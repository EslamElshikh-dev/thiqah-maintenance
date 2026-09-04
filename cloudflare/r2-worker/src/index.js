const encoder = new TextEncoder();
const OBJECT_PREFIX = '/v1/object/';
const MAX_SIGNED_TTL_SECONDS = 15 * 60;
const MAX_OBJECT_BYTES = 15 * 1024 * 1024;

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean));
}

function corsFor(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  if (!allowedOrigins(env).has(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,HEAD,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type,if-none-match',
    'access-control-expose-headers': 'etag,content-length,content-type,content-disposition',
    'access-control-max-age': '3600',
    vary: 'Origin'
  };
}

function base64UrlBytes(value) {
  try {
    const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function canonical(method, key, exp, contentType = '', disposition = '', size = '') {
  return [method.toUpperCase(), key, String(exp), contentType, disposition, String(size)].join('\n');
}

async function verifySignature(env, method, key, params) {
  const exp = Number(params.get('exp'));
  const signature = base64UrlBytes(params.get('sig') || '');
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(exp) || exp < now || exp > now + MAX_SIGNED_TTL_SECONDS || !signature?.length) return false;
  const contentType = params.get('ct') || '';
  const disposition = params.get('disp') || '';
  const size = params.get('size') || '';
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.STORAGE_HMAC_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    'HMAC',
    keyMaterial,
    signature,
    encoder.encode(canonical(method, key, exp, contentType, disposition, size))
  );
}

function objectHeaders(object, cors, overrides = {}) {
  const headers = new Headers(cors || {});
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('content-length', String(object.size));
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  if (overrides.contentType) headers.set('content-type', overrides.contentType);
  if (overrides.disposition) headers.set('content-disposition', overrides.disposition);
  return headers;
}

function text(status, body, cors = {}) {
  return new Response(body, {
    status,
    headers: {
      ...cors,
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, storage: 'r2-binding' }, { headers: { 'cache-control': 'no-store' } });
    }

    const cors = corsFor(request, env);
    if (request.headers.get('origin') && cors === null) return text(403, 'Origin forbidden');
    if (request.method === 'OPTIONS') {
      if (!cors) return text(403, 'Origin forbidden');
      return new Response(null, { status: 204, headers: cors });
    }

    if (!url.pathname.startsWith(OBJECT_PREFIX)) return text(404, 'Not found', cors || {});
    const encodedKey = url.pathname.slice(OBJECT_PREFIX.length);
    let key;
    try {
      key = decodeURIComponent(encodedKey);
    } catch {
      return text(400, 'Invalid object key', cors || {});
    }
    if (!key || key.startsWith('/') || key.includes('\0') || key.length > 1024) return text(400, 'Invalid object key', cors || {});
    if (!['PUT', 'GET', 'HEAD', 'DELETE'].includes(request.method)) return text(405, 'Method not allowed', cors || {});

    if (!(await verifySignature(env, request.method, key, url.searchParams))) {
      return text(401, 'Invalid or expired signature', cors || {});
    }

    if (request.method === 'PUT') {
      const expectedType = url.searchParams.get('ct') || '';
      const expectedSize = Number(url.searchParams.get('size'));
      const actualSize = Number(request.headers.get('content-length') || 0);
      if (!expectedType || !Number.isInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX_OBJECT_BYTES) {
        return text(400, 'Invalid upload contract', cors || {});
      }
      if (request.headers.get('content-type') !== expectedType || request.headers.get('if-none-match') !== '*') {
        return text(400, 'Upload headers do not match intent', cors || {});
      }
      if (!Number.isInteger(actualSize) || actualSize !== expectedSize || !request.body) {
        return text(400, 'Upload size does not match intent', cors || {});
      }
      const onlyIf = new Headers({ 'if-none-match': '*' });
      const stored = await env.MEDIA.put(key, request.body, {
        onlyIf,
        httpMetadata: { contentType: expectedType }
      });
      if (!stored) return text(412, 'Object already exists', cors || {});
      return new Response(null, {
        status: 201,
        headers: { ...(cors || {}), etag: stored.httpEtag, 'cache-control': 'no-store' }
      });
    }

    if (request.method === 'HEAD') {
      const object = await env.MEDIA.head(key);
      if (!object) return text(404, 'Not found', cors || {});
      return new Response(null, { status: 200, headers: objectHeaders(object, cors) });
    }

    if (request.method === 'GET') {
      const object = await env.MEDIA.get(key);
      if (!object) return text(404, 'Not found', cors || {});
      const contentType = url.searchParams.get('ct') || '';
      const disposition = url.searchParams.get('disp') || '';
      return new Response(object.body, {
        status: 200,
        headers: objectHeaders(object, cors, { contentType, disposition })
      });
    }

    await env.MEDIA.delete(key);
    return new Response(null, { status: 204, headers: { ...(cors || {}), 'cache-control': 'no-store' } });
  }
};
