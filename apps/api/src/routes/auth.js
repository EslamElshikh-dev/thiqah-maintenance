import { startCustomerRegistration, verifyCustomerRegistration, customerLogin, adminPasswordLogin, verifyAdminMfa, technicianLogin } from '../services/auth.js';
import { requestContext } from '../lib/request-context.js';
import { setSessionCookie, clearSessionCookie, requireActor, requireCsrf } from '../lib/session.js';
import { hmacHex } from '../lib/crypto.js';

function sessionResponse(reply, config, result, clientType) {
  if (clientType === 'web') setSessionCookie(reply,config,result.session.token,result.session.expiresAt);
  return {
    ok:true,
    actor:result.actor,
    csrfToken:clientType==='web'?result.session.csrfToken:undefined,
    sessionToken:clientType==='web'?undefined:result.session.token,
    expiresAt:result.session.expiresAt
  };
}

export async function authRoutes(app, ctx) {
  const {db,config,sms} = ctx;
  app.post('/v1/auth/customer/register/start',{config:{rateLimit:{max:5,timeWindow:'15 minutes'}}}, async (request) => {
    return {ok:true,...await startCustomerRegistration({db,config,sms,input:request.body||{}})};
  });
  app.post('/v1/auth/customer/register/verify',{config:{rateLimit:{max:10,timeWindow:'15 minutes'}}}, async (request,reply) => {
    const input={...(request.body||{}),clientType:request.body?.clientType||'web'};
    const result=await verifyCustomerRegistration({db,config,input,context:requestContext(config,request)});
    return sessionResponse(reply,config,result,input.clientType);
  });
  app.post('/v1/auth/customer/login',{config:{rateLimit:{max:8,timeWindow:'15 minutes'}}}, async (request,reply) => {
    const input={...(request.body||{}),clientType:request.body?.clientType||'web'};
    const result=await customerLogin({db,config,input,context:requestContext(config,request)});
    return sessionResponse(reply,config,result,input.clientType);
  });
  app.post('/v1/auth/admin/login',{config:{rateLimit:{max:5,timeWindow:'15 minutes'}}}, async (request) => {
    const result=await adminPasswordLogin({db,config,input:request.body||{}});
    if (result.mfaRequired) return {ok:true,mfaRequired:true,challengeToken:result.challengeToken,expiresAt:result.expiresAt};
    return {ok:false,error:'MFA enrollment required'};
  });
  app.post('/v1/auth/admin/mfa/verify',{config:{rateLimit:{max:8,timeWindow:'15 minutes'}}}, async (request,reply) => {
    const input={...(request.body||{}),clientType:request.body?.clientType||'web'};
    const result=await verifyAdminMfa({db,config,input,context:requestContext(config,request)});
    return sessionResponse(reply,config,result,input.clientType);
  });
  app.post('/v1/auth/technician/login',{config:{rateLimit:{max:8,timeWindow:'15 minutes'}}}, async (request,reply) => {
    const input={...(request.body||{}),clientType:request.body?.clientType||'web'};
    const result=await technicianLogin({db,config,input,context:requestContext(config,request)});
    return sessionResponse(reply,config,result,input.clientType);
  });
  app.post('/v1/auth/logout', async (request,reply) => {
    const session=await requireActor({db,config,request,actorTypes:['customer','technician','admin']});
    requireCsrf(config,request);
    await db.query(`UPDATE thiqah.auth_sessions SET revoked_at=now() WHERE id=$1`,[session.id]);
    clearSessionCookie(reply,config);
    return {ok:true};
  });
  app.get('/v1/auth/me', async (request) => {
    const session=await requireActor({db,config,request,actorTypes:['customer','technician','admin']});
    let selected;
    if(session.actor_type==='customer') selected=await db.query(`SELECT id FROM thiqah.customers WHERE id=$1`,[session.actor_id]);
    else if(session.actor_type==='technician') selected=await db.query(`SELECT id FROM thiqah.technicians WHERE id=$1`,[session.actor_id]);
    else selected=await db.query(`SELECT id,username,display_name,role,permissions FROM thiqah.admins WHERE id=$1`,[session.actor_id]);
    return {ok:true,actorType:session.actor_type,actorId:selected.rows[0]?.id||null,actor:session.actor_type==='admin'?selected.rows[0]:undefined};
  });
}
