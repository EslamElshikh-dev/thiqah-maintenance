import { randomToken, hmacHex, hashPassword } from '../lib/crypto.js';
import { badRequest } from '../lib/http.js';

export async function requestPasswordReset({db,config,emailProvider,role,email,context}){
  if(!['customer','technician','admin'].includes(role)) return;
  const normalized=String(email||'').trim().toLowerCase();
  if(!normalized) return;
  let actor;
  if(role==='customer') actor=(await db.query(`SELECT id,email,status FROM thiqah.customers WHERE lower(email)=$1 LIMIT 1`,[normalized])).rows[0];
  else if(role==='technician') actor=(await db.query(`SELECT id,email,status FROM thiqah.technicians WHERE lower(email)=$1 LIMIT 1`,[normalized])).rows[0];
  else actor=(await db.query(`SELECT id,email,status FROM thiqah.admins WHERE lower(email)=$1 LIMIT 1`,[normalized])).rows[0];
  if(!actor||actor.status!=='active') return;
  const token=randomToken(32);
  const tokenHash=hmacHex(config.sessionHmacKey,`reset:${role}:${token}`);
  await db.query(`UPDATE thiqah.password_reset_tokens SET used_at=now() WHERE actor_type=$1 AND actor_id=$2 AND used_at IS NULL`,[role,actor.id]);
  await db.query(`INSERT INTO thiqah.password_reset_tokens(actor_type,actor_id,token_hash,expires_at,requested_ip_prefix_hash) VALUES($1,$2,$3,now()+interval '30 minutes',$4)`,[role,actor.id,tokenHash,context.ipPrefixHash]);
  await emailProvider.sendPasswordReset({email:actor.email,role,token});
}

export async function resetPassword({db,config,role,token,newPassword}){
  if(!['customer','technician','admin'].includes(role)) throw badRequest('RESET_INVALID','Reset token is invalid or expired');
  const tokenHash=hmacHex(config.sessionHmacKey,`reset:${role}:${String(token||'')}`);
  const passwordHash=await hashPassword(newPassword);
  await db.tx(async(client)=>{
    const row=(await client.query(`SELECT * FROM thiqah.password_reset_tokens WHERE actor_type=$1 AND token_hash=$2 FOR UPDATE`,[role,tokenHash])).rows[0];
    if(!row||row.used_at||new Date(row.expires_at)<=new Date()) throw badRequest('RESET_INVALID','Reset token is invalid or expired');
    if(role==='customer') await client.query(`UPDATE thiqah.customers SET password_hash=$2,updated_at=now() WHERE id=$1`,[row.actor_id,passwordHash]);
    else if(role==='technician') await client.query(`UPDATE thiqah.technicians SET password_hash=$2,updated_at=now() WHERE id=$1`,[row.actor_id,passwordHash]);
    else await client.query(`UPDATE thiqah.admins SET password_hash=$2,updated_at=now() WHERE id=$1`,[row.actor_id,passwordHash]);
    await client.query(`UPDATE thiqah.password_reset_tokens SET used_at=now() WHERE id=$1`,[row.id]);
    await client.query(`UPDATE thiqah.auth_sessions SET revoked_at=now() WHERE actor_type=$1 AND actor_id=$2 AND revoked_at IS NULL`,[role,row.actor_id]);
  });
}
