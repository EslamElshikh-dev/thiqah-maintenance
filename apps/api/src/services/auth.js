import { verify } from 'otplib';
import { assertSaudiMobile, normalizeSaudiPhone } from '../../../../packages/core/src/phone.js';
import { assertEmail, requireString } from '../../../../packages/core/src/validation.js';
import { hashPassword, verifyPassword, randomToken, hmacHex, decryptSecret, safeEqualText } from '../lib/crypto.js';
import { badRequest, unauthorized, conflict } from '../lib/http.js';
import { issueOtp, consumeOtpTx } from './otp.js';
import { createSession } from '../lib/session.js';

export async function startCustomerRegistration({ db, config, sms, input }) {
  const name = requireString(input.name,'name',{min:2,max:100});
  const phone = assertSaudiMobile(input.phone);
  const email = assertEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const exists = await db.query(`SELECT 1 FROM thiqah.customers WHERE phone=$1 AND deleted_at IS NULL`, [phone]);
  if (exists.rows[0]) throw conflict('PHONE_ALREADY_REGISTERED','Phone is already registered');
  const challenge = await issueOtp({
    db,config,purpose:'customer_registration',phone,
    payload:{name,phone,email,passwordHash},
    send:(data)=>sms.sendOtp(data)
  });
  return { challengeId:challenge.id, expiresAt:challenge.expires_at };
}

export async function verifyCustomerRegistration({ db, config, input, context }) {
  const phone = assertSaudiMobile(input.phone);
  return db.tx(async (client) => {
    const payload = await consumeOtpTx({client,config,challengeId:input.challengeId,phone,purpose:'customer_registration',otp:String(input.otp||'')});
    const created = await client.query(
      `INSERT INTO thiqah.customers (name,phone,phone_verified_at,email,password_hash)
       VALUES ($1,$2,now(),$3,$4) ON CONFLICT DO NOTHING RETURNING id,name,phone,email,status`,
      [payload.name,payload.phone,payload.email,payload.passwordHash]
    );
    if (!created.rows[0]) throw conflict('ACCOUNT_ALREADY_EXISTS','Account already exists');
    const actor = created.rows[0];
    const session = await createSession({db:client,config,actorType:'customer',actorId:actor.id,clientType:input.clientType||'web',context});
    return { actor, session };
  });
}

export async function customerLogin({ db, config, input, context }) {
  const rawIdentifier = String(input.identifier||'').trim().toLowerCase();
  const normalizedPhone=normalizeSaudiPhone(rawIdentifier);
  const identifier=/^05\d{8}$/.test(normalizedPhone)?normalizedPhone:rawIdentifier;
  const result = await db.query(
    `SELECT id,name,phone,email,password_hash,status,phone_verified_at FROM thiqah.customers
     WHERE deleted_at IS NULL AND (phone=$1 OR lower(email)=$1) LIMIT 1`,
    [identifier]
  );
  const row = result.rows[0];
  if (!row || row.status !== 'active' || !await verifyPassword(input.password,row.password_hash)) throw unauthorized('Invalid credentials');
  if (!row.phone_verified_at) throw unauthorized('Phone verification required');
  const session = await createSession({db,config,actorType:'customer',actorId:row.id,clientType:input.clientType||'web',context});
  return { actor:{id:row.id,name:row.name,phone:row.phone,email:row.email,status:row.status},session };
}

export async function adminPasswordLogin({ db, config, input, context }) {
  const username = requireString(input.username,'username',{min:2,max:100}).toLowerCase();
  const result = await db.query(
    `SELECT a.id,a.username,a.display_name,a.email,a.password_hash,a.role,a.status,a.mfa_required,m.totp_secret_ciphertext
       FROM thiqah.admins a LEFT JOIN thiqah.admin_mfa m ON m.admin_id=a.id
      WHERE lower(a.username)=$1 LIMIT 1`,
    [username]
  );
  const row = result.rows[0];
  if (!row || row.status !== 'active' || !await verifyPassword(input.password,row.password_hash)) throw unauthorized('Invalid credentials');
  if (config.adminMfaRequired && (!row.mfa_required || !row.totp_secret_ciphertext)) throw unauthorized('Administrator MFA enrollment required');
  if (config.adminMfaRequired) {
    const token = randomToken(32);
    const tokenHash = hmacHex(config.sessionHmacKey,token);
    const challenge = await db.query(
      `INSERT INTO thiqah.login_challenges (actor_type,actor_id,purpose,token_hash,expires_at)
       VALUES ('admin',$1,'mfa',$2,now()+interval '5 minutes') RETURNING id,expires_at`,
      [row.id,tokenHash]
    );
    return { mfaRequired:true, challengeToken:token, expiresAt:challenge.rows[0].expires_at };
  }
  const actor={id:row.id,username:row.username,display_name:row.display_name,email:row.email,role:row.role,status:row.status};
  const session=await createSession({db,config,actorType:'admin',actorId:row.id,clientType:input.clientType||'web',context});
  return {mfaRequired:false,actor,session};
}

export async function verifyAdminMfa({ db, config, input, context }) {
  const hash = hmacHex(config.sessionHmacKey,String(input.challengeToken||''));
  return db.tx(async (client) => {
    const challengeResult = await client.query(
      `SELECT * FROM thiqah.login_challenges WHERE token_hash=$1 AND actor_type='admin' AND purpose='mfa' FOR UPDATE`,
      [hash]
    );
    const challenge = challengeResult.rows[0];
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at)<=new Date() || challenge.attempts>=5) throw unauthorized('MFA challenge invalid or expired');
    const mfa = await client.query(`SELECT totp_secret_ciphertext,last_totp_code_hash FROM thiqah.admin_mfa WHERE admin_id=$1 FOR UPDATE`, [challenge.actor_id]);
    const encrypted = mfa.rows[0]?.totp_secret_ciphertext;
    if (!encrypted) throw unauthorized('MFA is not configured');
    const secret = decryptSecret(encrypted,config.mfaEncryptionKeyBase64);
    const code = String(input.code||'');
    const codeHash = hmacHex(config.sessionHmacKey,`totp:${challenge.actor_id}:${code}`);
    if (mfa.rows[0]?.last_totp_code_hash && safeEqualText(mfa.rows[0].last_totp_code_hash,codeHash)) {
      throw unauthorized('MFA code was already used');
    }
    const verification=await verify({secret,token:code});
    if (!verification.valid) {
      await client.query(`UPDATE thiqah.login_challenges SET attempts=attempts+1 WHERE id=$1`, [challenge.id]);
      throw unauthorized('Invalid MFA code');
    }
    await client.query(`UPDATE thiqah.login_challenges SET attempts=attempts+1,consumed_at=now() WHERE id=$1`, [challenge.id]);
    await client.query(`UPDATE thiqah.admin_mfa SET last_verified_at=now(),last_totp_code_hash=$2 WHERE admin_id=$1`, [challenge.actor_id,codeHash]);
    const actorResult = await client.query(`SELECT id,username,display_name,email,role,status FROM thiqah.admins WHERE id=$1`, [challenge.actor_id]);
    const actor = actorResult.rows[0];
    const session = await createSession({db:{query:(q,p)=>client.query(q,p)},config,actorType:'admin',actorId:actor.id,clientType:input.clientType||'web',context});
    return { actor,session };
  });
}

export async function technicianLogin({ db, config, input, context }) {
  const phone = assertSaudiMobile(input.phone);
  const result = await db.query(`SELECT id,name,phone,email,password_hash,status,specialty FROM thiqah.technicians WHERE phone=$1 LIMIT 1`, [phone]);
  const row = result.rows[0];
  if (!row || row.status!=='active' || !await verifyPassword(input.password,row.password_hash)) throw unauthorized('Invalid credentials');
  const session = await createSession({db,config,actorType:'technician',actorId:row.id,clientType:input.clientType||'web',context});
  return {actor:{id:row.id,name:row.name,phone:row.phone,email:row.email,specialty:row.specialty},session};
}
