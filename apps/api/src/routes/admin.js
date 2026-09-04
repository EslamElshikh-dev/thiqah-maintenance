import { assertUuid, optionalIsoTimestamp, boundedInteger } from '../../../../packages/core/src/validation.js';
import { ORDER_STATUSES } from '../../../../packages/core/src/order-state.js';
import { requireActor, requireCsrf } from '../lib/session.js';
import { requestContext } from '../lib/request-context.js';
import { transitionOrderTx } from '../services/orders.js';
import { badRequest, conflict, notFound } from '../lib/http.js';

export async function adminRoutes(app,ctx){
  const {db,config}=ctx;
  app.get('/v1/admin/orders',async(request)=>{
    await requireActor({db,config,request,actorTypes:['admin']});
    const limit=boundedInteger(request.query?.limit,'limit',{min:1,max:100,fallback:30});
    const status=request.query?.status||null;
    if(status && !ORDER_STATUSES.includes(status)) throw badRequest('INVALID_STATUS','Invalid order status');
    const before=optionalIsoTimestamp(request.query?.before,'before');
    const {rows}=await db.query(
      `SELECT o.id,o.order_number,o.status,o.contact_name,o.contact_phone,o.appointment_date,o.created_at,s.name_ar AS service_name
       FROM thiqah.orders o JOIN thiqah.services s ON s.id=o.service_id
       WHERE ($1::text IS NULL OR o.status=$1) AND ($2::timestamptz IS NULL OR o.created_at<$2)
       ORDER BY o.created_at DESC LIMIT $3`,[status,before,limit]);
    return {ok:true,orders:rows,nextCursor:rows.length===limit?rows.at(-1).created_at:null};
  });

  app.post('/v1/admin/orders/:orderId/assign',async(request)=>{
    const actor=await requireActor({db,config,request,actorTypes:['admin']}); requireCsrf(config,request);
    const technicianId=assertUuid(request.body?.technicianId,'technicianId');
    const transitioned=await db.tx(async(client)=>{
      const order=(await client.query(`SELECT * FROM thiqah.orders WHERE id=$1 FOR UPDATE`,[assertUuid(request.params.orderId,'orderId')])).rows[0];
      if(!order) throw notFound('Order not found');
      if(order.status!=='customer_approved') throw conflict('ORDER_NOT_ASSIGNABLE','Order must be customer approved before assignment');
      const tech=(await client.query(`SELECT id FROM thiqah.technicians WHERE id=$1 AND status='active' AND availability='available'`,[technicianId])).rows[0];
      if(!tech) throw badRequest('TECHNICIAN_UNAVAILABLE','Technician is unavailable');
      const qualified=(await client.query(`SELECT 1 FROM thiqah.technician_services ts JOIN thiqah.technician_areas ta ON ta.technician_id=ts.technician_id WHERE ts.technician_id=$1 AND ts.service_id=$2 AND ta.area_id=$3 LIMIT 1`,[technicianId,order.service_id,order.service_area_id])).rows[0];
      if(!qualified) throw badRequest('TECHNICIAN_NOT_QUALIFIED','Technician is not qualified for this service and area');
      await client.query(`INSERT INTO thiqah.order_assignments(order_id,technician_id,assigned_by_admin_id) VALUES($1,$2,$3)`,[order.id,technicianId,actor.actor_id]);
      await client.query(`UPDATE thiqah.technicians SET availability='busy',updated_at=now() WHERE id=$1`,[technicianId]);
      return transitionOrderTx({client,actor,orderId:order.id,toStatus:'assigned',reason:'technician_assigned',context:requestContext(config,request)});
    });
    return {ok:true,order:{id:transitioned.id,status:transitioned.status}};
  });

  app.get('/v1/admin/technicians',async(request)=>{
    await requireActor({db,config,request,actorTypes:['admin']});
    const {rows}=await db.query(`SELECT id,name,phone,specialty,status,availability FROM thiqah.technicians ORDER BY name`);
    return {ok:true,technicians:rows};
  });
}
