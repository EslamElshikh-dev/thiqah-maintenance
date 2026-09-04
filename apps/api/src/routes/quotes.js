import { assertUuid, optionalIsoTimestamp } from '../../../../packages/core/src/validation.js';
import { requireActor, requireCsrf } from '../lib/session.js';
import { requestContext } from '../lib/request-context.js';
import { createAndSendQuote, approveQuote } from '../services/quotes.js';

export async function quoteRoutes(app,ctx){
  const {db,config}=ctx;
  app.post('/v1/admin/orders/:orderId/quotes',async(request)=>{
    const actor=await requireActor({db,config,request,actorTypes:['admin']}); requireCsrf(config,request);
    const quote=await createAndSendQuote({db,actor,orderId:assertUuid(request.params.orderId,'orderId'),items:request.body?.items,notes:request.body?.notes,validUntil:optionalIsoTimestamp(request.body?.validUntil,'validUntil'),context:requestContext(config,request)});
    return {ok:true,quote};
  });
  app.post('/v1/customer/quotes/:quoteId/approve',async(request)=>{
    const actor=await requireActor({db,config,request,actorTypes:['customer']}); requireCsrf(config,request);
    const quote=await approveQuote({db,actor,quoteId:assertUuid(request.params.quoteId,'quoteId'),context:requestContext(config,request)});
    return {ok:true,quoteId:quote.id,orderId:quote.order_id,status:'approved'};
  });
  app.get('/v1/customer/orders/:orderId/quotes',async(request)=>{
    const actor=await requireActor({db,config,request,actorTypes:['customer']});
    const {rows}=await db.query(`SELECT q.id,q.quote_number,q.status,q.subtotal,q.tax_rate,q.tax_amount,q.total,q.valid_until,q.notes,q.created_at,q.sent_at FROM thiqah.quotes q JOIN thiqah.orders o ON o.id=q.order_id WHERE q.order_id=$1 AND o.customer_id=$2 ORDER BY q.created_at DESC`,[assertUuid(request.params.orderId,'orderId'),actor.actor_id]);
    return {ok:true,quotes:rows};
  });
}
