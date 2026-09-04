import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth.js';
import { orderRoutes } from './routes/orders.js';
import { adminRoutes } from './routes/admin.js';
import { technicianRoutes } from './routes/technician.js';
import { quoteRoutes } from './routes/quotes.js';
import { settingsRoutes } from './routes/settings.js';
import { healthRoutes } from './routes/health.js';
import { privacyRoutes } from './routes/privacy.js';
import { passwordResetRoutes } from './routes/password-reset.js';
import { AppError } from './lib/http.js';

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,80}$/;

function generateRequestId(rawRequest) {
  const supplied = rawRequest.headers?.['x-request-id'];
  if (typeof supplied === 'string' && REQUEST_ID_RE.test(supplied)) return supplied;
  return `req_${randomUUID()}`;
}

function safeError(error, includeMessage) {
  const entry = {
    name: error?.name || 'Error',
    code: typeof error?.code === 'string' ? error.code : undefined,
    statusCode: Number.isInteger(error?.statusCode) ? error.statusCode : undefined
  };
  if (includeMessage) entry.message = String(error?.message || '');
  return entry;
}

export async function buildApp(ctx) {
  const app = Fastify({
    logger: {
      level: ctx.config.isDeployed ? 'info' : 'debug',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers.set-cookie',
          '*.password',
          '*.otp',
          '*.token',
          '*.sessionToken',
          '*.csrfToken',
          '*.challengeToken'
        ],
        censor: '[REDACTED]'
      }
    },
    genReqId: generateRequestId,
    trustProxy: 1,
    bodyLimit: 1024 * 1024,
    requestTimeout: 30_000,
    connectionTimeout: 10_000,
    keepAliveTimeout: 72_000
  });

  await app.register(cookie);
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, '');
      return callback(null, ctx.config.publicAppOrigins.includes(normalized));
    },
    credentials: true,
    strictPreflight: true,
    maxAge: 600,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-csrf-token', 'idempotency-key', 'x-request-id']
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: ctx.config.isDeployed
      ? { maxAge: 63_072_000, includeSubDomains: true, preload: ctx.config.isProduction }
      : false
  });
  const rateLimitPersistence = ctx.redis?.kind === 'upstash-rest'
    ? { store: ctx.redis.rateLimitStore }
    : { redis: ctx.redis || undefined };
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    ...rateLimitPersistence,
    errorResponseBuilder: () => ({ ok: false, error: 'RATE_LIMITED', message: 'Too many requests' })
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Request-Id', request.id);
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  });

  await healthRoutes(app, ctx);
  await settingsRoutes(app, ctx);
  await authRoutes(app, ctx);
  await passwordResetRoutes(app, ctx);
  await orderRoutes(app, ctx);
  await quoteRoutes(app, ctx);
  await adminRoutes(app, ctx);
  await technicianRoutes(app, ctx);
  await privacyRoutes(app, ctx);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      { error: safeError(error, !ctx.config.isProduction), requestId: request.id },
      'request failed'
    );
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({ ok: false, error: error.code, message: error.message, details: error.details });
      return;
    }
    if (error?.code === 'INVALID_PHONE' || error?.code === 'WEAK_PASSWORD') {
      reply.code(400).send({
        ok: false,
        error: error.code,
        message: error?.code === 'INVALID_PHONE' ? 'Invalid Saudi mobile number' : 'Password does not meet security requirements'
      });
      return;
    }
    if (error?.code === 'VALIDATION_ERROR') {
      reply.code(400).send({
        ok: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.field ? { field: error.field } : undefined
      });
      return;
    }
    if (error?.code === 'INVALID_ORDER_TRANSITION') {
      reply.code(409).send({ ok: false, error: 'INVALID_ORDER_TRANSITION', message: 'Order status transition is not allowed' });
      return;
    }
    if (error.statusCode === 429) {
      reply.code(429).send({ ok: false, error: 'RATE_LIMITED', message: 'Too many requests' });
      return;
    }
    reply.code(500).send({ ok: false, error: 'INTERNAL_ERROR', message: 'Unexpected server error' });
  });
  return app;
}
