import { assertSaudiMobile } from '../../../../packages/core/src/phone.js';
import { requireString, optionalString, assertUuid, optionalIsoDate, optionalIsoTimestamp, boundedInteger } from '../../../../packages/core/src/validation.js';
import { createOrderTx, publicTrackOrder, transitionOrder, recoverTrackingToken } from '../services/orders.js';
import { issueOtp, consumeOtpTx } from '../services/otp.js';
import { requestContext } from '../lib/request-context.js';
import { requireActor, requireCsrf } from '../lib/session.js';
import { requireAdminPermission } from '../lib/admin-access.js';
import { requireTechnicianPermission } from '../lib/technician-access.js';
import { beginIdempotency, completeIdempotency } from '../lib/idempotency.js';
import { badRequest } from '../lib/http.js';

function validateOrderInput(body, {guest=false}={}) {
  const latitude = body.latitude === null || body.latitude === undefined ? null : Number(body.latitude);
  const longitude = body.longitude === null || body.longitude === undefined ? null : Number(body.longitude);
  if ((latitude===null)!==(longitude===null) || (latitude!==null && (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180))) {
    throw badRequest('INVALID_LOCATION','Invalid coordinates');
  }
  const result = {
    serviceId: assertUuid(body.serviceId,'serviceId'),
    serviceAreaId: assertUuid(body.serviceAreaId,'serviceAreaId'),
    description: requireString(body.description,'description',{min:5,max:4000}),
    notes: optionalString(body.notes,'notes',{max:2000}),
    appointmentDate: optionalIsoDate(body.appointmentDate,'appointmentDate'),
    appointmentWindow: optionalString(body.appointmentWindow,'appointmentWindow',{max:100}),
    addressText: optionalString(body.addressText,'addressText',{max:500}),
    latitude, longitude,
    contactName: body.contactName ? requireString(body.contactName,'contactName',{min:2,max:100}) : null,
    contactPhone: body.contactPhone ? assertSaudiMobile(body.contactPhone) : null
  };
  if (guest && (!result.contactName || !result.contactPhone)) throw badRequest('CONTACT_REQUIRED','Guest orders require contact name and phone');
  return result;
}

export async function orderRoutes(app, ctx) {
  const {db,config,sms,storage} = ctx;

  app.post('/v1/orders/guest/start',{config:{rateLimit:{max:5,timeWindow:'10 minutes'}}},async(request)=>{
    const input=validateOrderInput(request.body||{},{guest:true});
    const challenge=await issueOtp({db,config,purpose:'phone_verification',phone:input.contactPhone,payload:input,send:(d)=>sms.sendOtp(d)});
    return {ok:true,challengeId:challenge.id,expiresAt:challenge.expires_at};
  });

  app.post('/v1/orders/guest/verify',{config:{rateLimit:{max:10,timeWindow:'10 minutes'}}},async(request)=>{
    const phone=assertSaudiMobile(request.body?.phone);
    const challengeId=assertUuid(request.body?.challengeId,'challengeId');
    const key=request.headers['idempotency-key'];
    return db.tx(async(client)=>{
      const idem=await beginIdempotency(client,{scope:'guest-order-create',key,actorType:'guest',actorId:null,body:{challengeId,phone}});
      if (idem.replay) {
        const trackingToken=await recoverTrackingToken({db:client,config,orderId:idem.body.order.id});
        return {ok:true,order:{...idem.body.order,trackingToken}};
      }
      const input=await consumeOtpTx({client,config,challengeId,phone,purpose:'phone_verification',otp:String(request.body?.otp||'')});
      const created=await createOrderTx({client,config,actor:null,input,context:requestContext(config,request)});
      const safeBody={ok:true,order:{id:created.id,orderNumber:created.order_number,status:created.status}};
      await completeIdempotency(client,idem.id,201,safeBody);
      return {ok:true,order:{...safeBody.order,trackingToken:created.trackingToken}};
    });
  });

  app.post('/v1/orders',async(request)=>{
    const actor=await requireActor({db,config,request,actorTypes:['customer']});
    requireCsrf(config,request);
    const input=validateOrderInput(request.body||{});
    const key=request.headers['idempotency-key'];
    return db.tx(async(client)=>{
      const idem=await beginIdempotency(client,{scope:'customer-order-create',key,actorType:'customer',actorId:actor.actor_id,body:input});
      if (idem.replay) {
        const trackingToken=await recoverTrackingToken({db:client,config,orderId:idem.body.order.id});
        return {ok:true,order:{...idem.body.order,trackingToken}};
      }
      const created=await createOrderTx({client,config,actor,input,context:requestContext(config,request)});
      const safeBody={ok:true,order:{id:created.id,orderNumber:created.order_number,status:created.status}};
      await completeIdempotency(client,idem.id,201,safeBody);
      return {ok:true,order:{...safeBody.order,trackingToken:created.trackingToken}};
    });
  });

  app.get('/v1/orders/track',{config:{rateLimit:{max:20,timeWindow:'10 minutes'}}},async(request)=>{
    const orderNumber=requireString(request.query?.orderNumber,'orderNumber',{min:10,max:30}).toUpperCase();
    const trackingToken=requireString(request.query?.token,'token',{min:20,max:100});
    return {ok:true,order:await publicTrackOrder({db,config,orderNumber,trackingToken})};
  });

  app.get('/v1/customer/orders',async(request)=>{
    const actor=await requireActor({db,config,request,actorTypes:['customer']});
    const limit=boundedInteger(request.query?.limit,'limit',{min:1,max:50,fallback:20});
    const before=optionalIsoTimestamp(request.query?.before,'before');
    const {rows}=await db.query(
      `SELECT o.id,o.order_number,o.status,o.appointment_date,o.appointment_window,o.created_at,s.name_ar AS service_name
       FROM thiqah.orders o JOIN thiqah.services s ON s.id=o.service_id
       WHERE o.customer_id=$1 AND ($2::timestamptz IS NULL OR o.created_at < $2)
       ORDER BY o.created_at DESC LIMIT $3`,[actor.actor_id,before,limit]
    );
    return {ok:true,orders:rows,nextCursor:rows.length===limit?rows.at(-1).created_at:null};
  });

  app.post('/v1/orders/:orderId/transition',async(request)=>{
    let actor=await requireActor({db,config,request,actorTypes:['customer','technician','admin']});
    if(actor.actor_type==='admin') {
      const admin=await requireAdminPermission({db,config,request,permission:'orders.manage'});
      actor={...actor,actor_id:admin.id};
    }
    if(actor.actor_type==='technician') actor=await requireTechnicianPermission({db,config,request,permission:'order_status.update'});
    requireCsrf(config,request);
    const result=await transitionOrder({db,actor,orderId:assertUuid(request.params.orderId,'orderId'),toStatus:request.body?.toStatus,reason:request.body?.reason,context:requestContext(config,request)});
    return {ok:true,order:{id:result.id,status:result.status}};
  });

  app.post('/v1/orders/:orderId/media/upload-intent',async(request)=>{
    let actor=await requireActor({db,config,request,actorTypes:['customer','technician','admin']});
    if(actor.actor_type==='admin') {
      const admin=await requireAdminPermission({db,config,request,permission:'orders.manage'});
      actor={...actor,actor_id:admin.id};
    }
    if(actor.actor_type==='technician') actor=await requireTechnicianPermission({db,config,request,permission:'work_media.upload'});
    requireCsrf(config,request);
    const result=await storage.createUploadIntent({db,actor,orderId:assertUuid(request.params.orderId,'orderId'),kind:request.body?.kind,mimeType:request.body?.mimeType,sizeBytes:Number(request.body?.sizeBytes)});
    return {ok:true,...result};
  });

  app.get('/v1/orders/:orderId/media/:mediaId/read-url',async(request)=>{
    let actor=await requireActor({db,config,request,actorTypes:['customer','technician','admin']});
    if(actor.actor_type==='admin') {
      const admin=await requireAdminPermission({db,config,request,permission:'orders.read'});
      actor={...actor,actor_id:admin.id};
    }
    if(actor.actor_type==='technician') actor=await requireTechnicianPermission({db,config,request,permission:'assigned_orders.read'});
    const result=await storage.createReadUrl({
      db,
      actor,
      orderId:assertUuid(request.params.orderId,'orderId'),
      mediaId:assertUuid(request.params.mediaId,'mediaId')
    });
    return {ok:true,...result};
  });

  app.post('/v1/orders/:orderId/media/complete',async(request)=>{
    let actor=await requireActor({db,config,request,actorTypes:['customer','technician','admin']});
    if(actor.actor_type==='admin') {
      const admin=await requireAdminPermission({db,config,request,permission:'orders.manage'});
      actor={...actor,actor_id:admin.id};
    }
    if(actor.actor_type==='technician') actor=await requireTechnicianPermission({db,config,request,permission:'work_media.upload'});
    requireCsrf(config,request);
    const result=await storage.completeUpload({db,actor,intentId:assertUuid(request.body?.intentId,'intentId'),sha256Hex:String(request.body?.sha256Hex||'').toLowerCase()});
    return {ok:true,media:result};
  });
}
