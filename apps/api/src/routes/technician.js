import { requireTechnicianPermission } from '../lib/technician-access.js';
import { requireCsrf } from '../lib/session.js';
import { assertUuid, requireString } from '../../../../packages/core/src/validation.js';
import { forbidden } from '../lib/http.js';

export async function technicianRoutes(app,ctx){
  const {db,config}=ctx;
  app.get('/v1/technician/orders',async(request)=>{
    const actor=await requireTechnicianPermission({db,config,request,permission:'assigned_orders.read'});
    const {rows}=await db.query(
      `SELECT o.id,o.order_number,o.status,o.contact_name,o.contact_phone,o.description,o.appointment_date,o.appointment_window,o.address_text,o.latitude,o.longitude,s.name_ar AS service_name
       FROM thiqah.order_assignments a JOIN thiqah.orders o ON o.id=a.order_id JOIN thiqah.services s ON s.id=o.service_id
       WHERE a.technician_id=$1 AND a.ended_at IS NULL ORDER BY o.appointment_date NULLS LAST,o.created_at`,[actor.actor_id]);
    return {ok:true,orders:rows};
  });
  app.post('/v1/technician/orders/:orderId/notes',async(request)=>{
    const actor=await requireTechnicianPermission({db,config,request,permission:'work_notes.create'});
    requireCsrf(config,request);
    const orderId=assertUuid(request.params.orderId,'orderId');
    const note=requireString(request.body?.note,'note',{min:2,max:4000});
    const {rows}=await db.query(
      `INSERT INTO thiqah.technician_notes(order_id,technician_id,note)
       SELECT $1,$2,$3
        WHERE EXISTS (
          SELECT 1 FROM thiqah.order_assignments
           WHERE order_id=$1 AND technician_id=$2 AND ended_at IS NULL
        )
       RETURNING id,order_id,note,created_at`,
      [orderId,actor.actor_id,note]
    );
    if(!rows[0]) throw forbidden('Order is not assigned to this technician');
    return {ok:true,note:rows[0]};
  });
}
