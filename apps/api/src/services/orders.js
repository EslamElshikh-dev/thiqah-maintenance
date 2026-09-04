import { assertTransition } from '../../../../packages/core/src/order-state.js';
import { publicTrackingToken, randomToken } from '../../../../packages/core/src/identifiers.js';
import { hmacHex, encryptSecret, decryptSecret } from '../lib/crypto.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';

export async function nextOrderNumber(client) {
  const { rows } = await client.query(`SELECT nextval('thiqah.order_number_seq') AS n`);
  const year = new Date().getUTCFullYear();
  return `ORD-${year}-${String(rows[0].n).padStart(6, '0')}`;
}

export async function createOrderTx({ client, config, actor, input, context }) {
  const service = await client.query(`SELECT id,name_ar FROM thiqah.services WHERE id=$1 AND active=true`, [input.serviceId]);
  if (!service.rows[0]) throw badRequest('INVALID_SERVICE', 'Service is unavailable');
  const area = await client.query(`SELECT id,name_ar FROM thiqah.service_areas WHERE id=$1 AND active=true`, [input.serviceAreaId]);
  if (!area.rows[0]) throw badRequest('INVALID_SERVICE_AREA', 'Service area is unavailable');
  const orderNumber = await nextOrderNumber(client);
  const trackingToken = publicTrackingToken();
  const trackingHash = hmacHex(config.sessionHmacKey, trackingToken);
  const trackingCiphertext = encryptSecret(trackingToken, config.tokenEncryptionKeyBase64);

  let customerId = null;
  let contactName = input.contactName;
  let contactPhone = input.contactPhone;
  let guestName = input.contactName;
  let guestPhone = input.contactPhone;

  if (actor?.actor_type === 'customer') {
    customerId = actor.actor_id;
    const customer = await client.query(`SELECT name,phone FROM thiqah.customers WHERE id=$1 AND status='active'`, [customerId]);
    if (!customer.rows[0]) throw forbidden();
    guestName = null;
    guestPhone = null;
    if (!contactName) contactName = customer.rows[0].name;
    if (!contactPhone) contactPhone = customer.rows[0].phone;
  }

  const inserted = await client.query(
    `INSERT INTO thiqah.orders (
       order_number,tracking_token_hash,tracking_token_ciphertext,customer_id,guest_name,guest_phone,contact_name,contact_phone,
       service_id,service_area_id,description,customer_notes,appointment_date,appointment_window,address_text,latitude,longitude,status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'new') RETURNING id,order_number,status,created_at`,
    [orderNumber,trackingHash,trackingCiphertext,customerId,guestName,guestPhone,contactName,contactPhone,input.serviceId,input.serviceAreaId,input.description,input.notes,
     input.appointmentDate,input.appointmentWindow,input.addressText,input.latitude,input.longitude]
  );
  const order = inserted.rows[0];
  await client.query(
    `INSERT INTO thiqah.order_status_events (order_id,from_status,to_status,actor_type,actor_id,reason)
     VALUES ($1,NULL,'new',$2,$3,'order_created')`,
    [order.id, actor?.actor_type || 'system', actor?.actor_id || null]
  );
  await client.query(
    `INSERT INTO thiqah.audit_logs (actor_type,actor_id,action,object_type,object_id,request_id,ip_prefix_hash,metadata)
     VALUES ($1,$2,'order.create','order',$3,$4,$5,$6::jsonb)`,
    [actor?.actor_type || 'system', actor?.actor_id || null, order.id, context.requestId, context.ipPrefixHash,
     JSON.stringify({ orderNumber, serviceId: input.serviceId, serviceAreaId: input.serviceAreaId })]
  );
  return { ...order, trackingToken };
}

export async function createOrder({ db, ...args }) {
  return db.tx((client) => createOrderTx({ client, ...args }));
}

export async function transitionOrderTx({ client, actor, orderId, toStatus, reason, context }) {
  const selected = await client.query(`SELECT * FROM thiqah.orders WHERE id=$1 FOR UPDATE`, [orderId]);
  const order = selected.rows[0];
  if (!order) throw notFound('Order not found');
  assertTransition(order.status, toStatus, actor.actor_type);

  if (actor.actor_type === 'customer' && order.customer_id !== actor.actor_id) throw forbidden();
  if (actor.actor_type === 'technician') {
    const assigned = await client.query(
      `SELECT 1 FROM thiqah.order_assignments WHERE order_id=$1 AND technician_id=$2 AND ended_at IS NULL`,
      [orderId,actor.actor_id]
    );
    if (!assigned.rows[0]) throw forbidden();
  }

  await client.query(
    `UPDATE thiqah.orders SET status=$2,updated_at=now(),
     completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END,
     cancelled_at=CASE WHEN $2='cancelled' THEN now() ELSE cancelled_at END WHERE id=$1`,
    [orderId,toStatus]
  );
  if (['customer_approved','completed','cancelled'].includes(toStatus)) {
    const released = await client.query(
      `UPDATE thiqah.order_assignments SET ended_at=now()
        WHERE order_id=$1 AND ended_at IS NULL
        RETURNING technician_id`,
      [orderId]
    );
    for (const row of released.rows) {
      await client.query(
        `UPDATE thiqah.technicians t SET availability='available',updated_at=now()
          WHERE t.id=$1
            AND NOT EXISTS (
              SELECT 1 FROM thiqah.order_assignments a
               WHERE a.technician_id=t.id AND a.ended_at IS NULL
            )`,
        [row.technician_id]
      );
    }
  }
  await client.query(
    `INSERT INTO thiqah.order_status_events (order_id,from_status,to_status,actor_type,actor_id,reason)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [orderId,order.status,toStatus,actor.actor_type,actor.actor_id,reason || null]
  );
  await client.query(
    `INSERT INTO thiqah.outbox_events (event_type,aggregate_type,aggregate_id,payload)
     VALUES ('order.status_changed','order',$1,$2::jsonb)`,
    [orderId,JSON.stringify({ orderId, from: order.status, to: toStatus })]
  );
  await client.query(
    `INSERT INTO thiqah.audit_logs (actor_type,actor_id,action,object_type,object_id,request_id,ip_prefix_hash,metadata)
     VALUES ($1,$2,'order.transition','order',$3,$4,$5,$6::jsonb)`,
    [actor.actor_type,actor.actor_id,orderId,context.requestId,context.ipPrefixHash,JSON.stringify({ from: order.status,to:toStatus })]
  );
  return { ...order, status: toStatus };
}

export async function transitionOrder({ db, actor, orderId, toStatus, reason, context }) {
  return db.tx((client) => transitionOrderTx({ client, actor, orderId, toStatus, reason, context }));
}

export async function recoverTrackingToken({ db, config, orderId }) {
  const {rows}=await db.query(`SELECT tracking_token_ciphertext FROM thiqah.orders WHERE id=$1 LIMIT 1`,[orderId]);
  const encrypted=rows[0]?.tracking_token_ciphertext;
  if(!encrypted) throw notFound('Tracking secret unavailable');
  return decryptSecret(encrypted,config.tokenEncryptionKeyBase64);
}

export async function publicTrackOrder({ db, config, orderNumber, trackingToken }) {
  const trackingHash = hmacHex(config.sessionHmacKey, trackingToken);
  const { rows } = await db.query(
    `SELECT o.id,o.order_number,o.status,o.appointment_date,o.appointment_window,s.name_ar AS service_name
       FROM thiqah.orders o JOIN thiqah.services s ON s.id=o.service_id
      WHERE o.order_number=$1 AND o.tracking_token_hash=$2 LIMIT 1`,
    [orderNumber,trackingHash]
  );
  if (!rows[0]) throw notFound('Order not found');
  return rows[0];
}

export function newUploadObjectKey(orderId, kind, extension) {
  return `orders/${orderId}/${kind}/${randomToken(18)}.${extension}`;
}
