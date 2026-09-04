import { createHash } from 'node:crypto';
import { conflict, badRequest } from './http.js';

function bodyHash(body) {
  return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
}

export async function beginIdempotency(db, { scope, key, actorType, actorId, body, ttlHours=24 }) {
  if (!key || key.length < 12 || key.length > 200) throw badRequest('INVALID_IDEMPOTENCY_KEY', 'A valid Idempotency-Key is required');
  const hash = bodyHash(body);
  const inserted = await db.query(
    `INSERT INTO thiqah.idempotency_keys (scope,idempotency_key,actor_type,actor_id,request_hash,expires_at)
     VALUES ($1,$2,$3,$4,$5,now()+make_interval(hours=>$6))
     ON CONFLICT (scope,idempotency_key) DO NOTHING
     RETURNING id`,
    [scope,key,actorType,actorId,hash,ttlHours]
  );
  if (inserted.rows[0]) return { fresh: true, id: inserted.rows[0].id, requestHash: hash };
  const existing = await db.query(
    `SELECT id, request_hash, response_status, response_body FROM thiqah.idempotency_keys
      WHERE scope=$1 AND idempotency_key=$2 AND expires_at > now() LIMIT 1`,
    [scope,key]
  );
  const row = existing.rows[0];
  if (!row) throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency key is unavailable');
  if (row.request_hash !== hash) throw conflict('IDEMPOTENCY_BODY_MISMATCH', 'Idempotency key was already used for a different request');
  if (row.response_status) return { fresh: false, replay: true, status: row.response_status, body: row.response_body };
  throw conflict('IDEMPOTENCY_IN_PROGRESS', 'An identical request is still being processed');
}

export async function completeIdempotency(db, id, status, body) {
  await db.query(`UPDATE thiqah.idempotency_keys SET response_status=$2,response_body=$3::jsonb WHERE id=$1`, [id,status,JSON.stringify(body)]);
}
