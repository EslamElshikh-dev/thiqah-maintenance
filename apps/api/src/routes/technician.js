import { requireActor } from '../lib/session.js';

export async function technicianRoutes(app,ctx){
  const {db,config}=ctx;
  app.get('/v1/technician/orders',async(request)=>{
    const actor=await requireActor({db,config,request,actorTypes:['technician']});
    const {rows}=await db.query(
      `SELECT o.id,o.order_number,o.status,o.contact_name,o.contact_phone,o.description,o.appointment_date,o.appointment_window,o.address_text,o.latitude,o.longitude,s.name_ar AS service_name
       FROM thiqah.order_assignments a JOIN thiqah.orders o ON o.id=a.order_id JOIN thiqah.services s ON s.id=o.service_id
       WHERE a.technician_id=$1 AND a.ended_at IS NULL ORDER BY o.appointment_date NULLS LAST,o.created_at`,[actor.actor_id]);
    return {ok:true,orders:rows};
  });
}
