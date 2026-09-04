import { randomInt } from 'node:crypto';
import { assertUuid } from '../../../../packages/core/src/validation.js';
import { hmacHex, safeEqualText } from '../lib/crypto.js';
import { badRequest } from '../lib/http.js';

function code() { return String(randomInt(100000, 1000000)); }

export async function issueOtp({ db, config, purpose, phone, payload, send }) {
  const otp = code();
  const codeHash = hmacHex(config.sessionHmacKey, `${purpose}:${phone}:${otp}`);
  const result = await db.tx(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`otp:${purpose}:${phone}`]);
    await client.query(
      `UPDATE thiqah.otp_challenges SET consumed_at=now()
        WHERE phone=$1 AND purpose=$2 AND consumed_at IS NULL`,
      [phone, purpose]
    );
    return client.query(
      `INSERT INTO thiqah.otp_challenges (purpose,phone,code_hash,payload,expires_at)
       VALUES ($1,$2,$3,$4::jsonb,now()+interval '5 minutes') RETURNING id,expires_at`,
      [purpose, phone, codeHash, JSON.stringify(payload || {})]
    );
  });
  if (config.otpProvider === 'log') console.log(`[DEV OTP] ${purpose} ${phone}: ${otp}`);
  else await send({ phone, code: otp, purpose });
  return result.rows[0];
}

export async function consumeOtpTx({ client, config, challengeId, phone, purpose, otp }) {
  const id = assertUuid(challengeId, 'challengeId');
  const selected = await client.query(
    `SELECT * FROM thiqah.otp_challenges WHERE id=$1 AND phone=$2 AND purpose=$3 FOR UPDATE`,
    [id, phone, purpose]
  );
  const row = selected.rows[0];
  if (!row || row.consumed_at || new Date(row.expires_at) <= new Date() || row.attempts >= row.max_attempts) {
    throw badRequest('OTP_INVALID_OR_EXPIRED', 'OTP is invalid or expired');
  }
  const expected = hmacHex(config.sessionHmacKey, `${purpose}:${phone}:${otp}`);
  if (!safeEqualText(expected, row.code_hash)) {
    await client.query(`UPDATE thiqah.otp_challenges SET attempts=attempts+1 WHERE id=$1`, [row.id]);
    throw badRequest('OTP_INVALID_OR_EXPIRED', 'OTP is invalid or expired');
  }
  await client.query(`UPDATE thiqah.otp_challenges SET consumed_at=now(),attempts=attempts+1 WHERE id=$1`, [row.id]);
  return row.payload;
}

export async function consumeOtp({ db, ...args }) {
  return db.tx((client) => consumeOtpTx({ client, ...args }));
}
