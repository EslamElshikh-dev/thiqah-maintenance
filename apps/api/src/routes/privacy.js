import { requireActor, requireCsrf } from '../lib/session.js';
import { verifyPassword } from '../lib/crypto.js';
import { unauthorized } from '../lib/http.js';
import { requestContext } from '../lib/request-context.js';

export async function privacyRoutes(app,ctx){
  const {db,config}=ctx;
  app.delete('/v1/customer/me',async(request,reply)=>{
    const actor=await requireActor({db,config,request,actorTypes:['customer']}); requireCsrf(config,request);
    const customer=(await db.query(`SELECT password_hash FROM thiqah.customers WHERE id=$1 AND status='active'`,[actor.actor_id])).rows[0];
    if(!customer||!await verifyPassword(String(request.body?.password||''),customer.password_hash)) throw unauthorized('Password confirmation failed');
    await db.tx(async(client)=>{
      const active=(await client.query(`SELECT count(*)::int AS n FROM thiqah.orders WHERE customer_id=$1 AND status NOT IN ('completed','cancelled')`,[actor.actor_id])).rows[0].n;
      if(active>0){
        await client.query(`UPDATE thiqah.customers SET status='pending_deletion',updated_at=now() WHERE id=$1`,[actor.actor_id]);
        await client.query(`INSERT INTO thiqah.account_deletion_requests(customer_id,status,created_at) VALUES($1,'identity_verified',now())`,[actor.actor_id]);
      }else{
        await client.query(`UPDATE thiqah.customers SET name='Deleted user',phone=NULL,email=NULL,password_hash='deleted',status='deleted',deleted_at=now(),updated_at=now() WHERE id=$1`,[actor.actor_id]);
        await client.query(`UPDATE thiqah.orders SET contact_name='Deleted user',contact_phone=NULL,guest_name=NULL,guest_phone=NULL,address_text=NULL,latitude=NULL,longitude=NULL,updated_at=now() WHERE customer_id=$1`,[actor.actor_id]);
        await client.query(`INSERT INTO thiqah.outbox_events(event_type,aggregate_type,aggregate_id,payload) VALUES('customer.media_purge_requested','customer',$1,$2::jsonb)`,[actor.actor_id,JSON.stringify({customerId:actor.actor_id})]);
      }
      await client.query(`UPDATE thiqah.auth_sessions SET revoked_at=now() WHERE actor_type='customer' AND actor_id=$1`,[actor.actor_id]);
      const c=requestContext(config,request);
      await client.query(`INSERT INTO thiqah.audit_logs(actor_type,actor_id,action,object_type,object_id,request_id,ip_prefix_hash,metadata) VALUES('customer',$1,'customer.delete_requested','customer',$1,$2,$3,'{}'::jsonb)`,[actor.actor_id,c.requestId,c.ipPrefixHash]);
    });
    reply.clearCookie(config.sessionCookieName,{path:'/'});
    return {ok:true};
  });
}
