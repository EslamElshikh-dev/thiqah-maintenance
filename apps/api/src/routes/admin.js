import { assertUuid, assertEmail, optionalString, requireString, optionalIsoTimestamp, boundedInteger } from '../../../../packages/core/src/validation.js';
import { assertSaudiMobile } from '../../../../packages/core/src/phone.js';
import { ADMIN_PERMISSIONS, ADMIN_ROLE_DEFAULTS, TECHNICIAN_PERMISSIONS, validatePermissions } from '../../../../packages/core/src/admin-permissions.js';
import { ORDER_STATUSES } from '../../../../packages/core/src/order-state.js';
import { requireCsrf } from '../lib/session.js';
import { requireAdminPermission } from '../lib/admin-access.js';
import { requestContext } from '../lib/request-context.js';
import { hashPassword } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { transitionOrderTx } from '../services/orders.js';
import { badRequest, conflict, notFound } from '../lib/http.js';

const EMPLOYEE_ROLES = ['admin', 'operator', 'support', 'finance'];
const ACCOUNT_STATUSES = ['active', 'disabled'];
const TECHNICIAN_AVAILABILITY = ['available', 'busy', 'off_duty'];

function oneOf(value, allowed, field) {
  const normalized = String(value ?? '').trim();
  if (!allowed.includes(normalized)) throw badRequest('VALIDATION_ERROR', `Invalid ${field}`);
  return normalized;
}

function dashboardQueries(db) {
  return Promise.all([
    db.query(`
      SELECT
        (SELECT count(*)::int FROM thiqah.customers WHERE deleted_at IS NULL) AS customers_total,
        (SELECT count(*)::int FROM thiqah.customers WHERE created_at >= date_trunc('month',now()) AND deleted_at IS NULL) AS customers_month,
        (SELECT count(*)::int FROM thiqah.orders) AS orders_total,
        (SELECT count(*)::int FROM thiqah.orders WHERE created_at >= date_trunc('day',now())) AS orders_today,
        (SELECT count(*)::int FROM thiqah.orders WHERE status IN ('assigned','technician_accepted','on_the_way','in_progress','awaiting_customer_confirmation')) AS orders_active,
        (SELECT count(*)::int FROM thiqah.orders WHERE status='completed') AS orders_completed,
        (SELECT count(*)::int FROM thiqah.technicians WHERE status='active') AS technicians_active,
        (SELECT count(*)::int FROM thiqah.technicians WHERE status='active' AND availability='available') AS technicians_available
    `),
    db.query(`
      WITH days AS (
        SELECT generate_series(date_trunc('day',now())-interval '6 days',date_trunc('day',now()),interval '1 day') AS day
      )
      SELECT to_char(days.day,'YYYY-MM-DD') AS day,count(o.id)::int AS orders
        FROM days LEFT JOIN thiqah.orders o ON o.created_at>=days.day AND o.created_at<days.day+interval '1 day'
       GROUP BY days.day ORDER BY days.day
    `),
    db.query(`SELECT status,count(*)::int AS count FROM thiqah.orders GROUP BY status ORDER BY count DESC`),
    db.query(`
      SELECT o.id,o.order_number,o.status,o.contact_name,o.contact_phone,o.appointment_date,o.created_at,s.name_ar AS service_name
        FROM thiqah.orders o JOIN thiqah.services s ON s.id=o.service_id
       ORDER BY o.created_at DESC LIMIT 8
    `),
    db.query(`
      SELECT id,name,phone,email,status,created_at
        FROM thiqah.customers WHERE deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 6
    `),
    db.query(`
      SELECT s.name_ar,count(o.id)::int AS orders,
             count(o.id) FILTER (WHERE o.status='completed')::int AS completed
        FROM thiqah.services s LEFT JOIN thiqah.orders o ON o.service_id=s.id
       WHERE s.active=true GROUP BY s.id,s.name_ar ORDER BY orders DESC,s.name_ar LIMIT 5
    `)
  ]);
}

export async function adminRoutes(app, ctx) {
  const { db, config } = ctx;

  app.get('/v1/admin/dashboard', async (request) => {
    const actor = await requireAdminPermission({ db, config, request, permission: 'dashboard.read' });
    const [summary, weekly, statuses, recentOrders, recentCustomers, services] = await dashboardQueries(db);
    const totals = summary.rows[0];
    const completionRate = totals.orders_total ? Math.round((totals.orders_completed / totals.orders_total) * 100) : 0;
    return {
      ok: true,
      actor: {
        id: actor.id,
        username: actor.username,
        displayName: actor.display_name,
        role: actor.role,
        permissions: actor.effectivePermissions
      },
      summary: { ...totals, completion_rate: completionRate },
      weeklyOrders: weekly.rows,
      orderStatuses: statuses.rows,
      recentOrders: recentOrders.rows,
      recentCustomers: actor.effectivePermissions.includes('customers.read') ? recentCustomers.rows : [],
      servicePerformance: services.rows
    };
  });

  app.get('/v1/admin/orders', async (request) => {
    await requireAdminPermission({ db, config, request, permission: 'orders.read' });
    const limit = boundedInteger(request.query?.limit, 'limit', { min: 1, max: 100, fallback: 30 });
    const status = request.query?.status || null;
    if (status && !ORDER_STATUSES.includes(status)) throw badRequest('INVALID_STATUS', 'Invalid order status');
    const before = optionalIsoTimestamp(request.query?.before, 'before');
    const { rows } = await db.query(
      `SELECT o.id,o.order_number,o.status,o.contact_name,o.contact_phone,o.appointment_date,o.created_at,s.name_ar AS service_name
       FROM thiqah.orders o JOIN thiqah.services s ON s.id=o.service_id
       WHERE ($1::text IS NULL OR o.status=$1) AND ($2::timestamptz IS NULL OR o.created_at<$2)
       ORDER BY o.created_at DESC LIMIT $3`, [status, before, limit]);
    return { ok: true, orders: rows, nextCursor: rows.length === limit ? rows.at(-1).created_at : null };
  });

  app.post('/v1/admin/orders/:orderId/assign', async (request) => {
    const actor = await requireAdminPermission({ db, config, request, permission: 'orders.manage' });
    requireCsrf(config, request);
    const technicianId = assertUuid(request.body?.technicianId, 'technicianId');
    const transitioned = await db.tx(async (client) => {
      const order = (await client.query(`SELECT * FROM thiqah.orders WHERE id=$1 FOR UPDATE`, [assertUuid(request.params.orderId, 'orderId')])).rows[0];
      if (!order) throw notFound('Order not found');
      if (order.status !== 'customer_approved') throw conflict('ORDER_NOT_ASSIGNABLE', 'Order must be customer approved before assignment');
      const tech = (await client.query(`SELECT id FROM thiqah.technicians WHERE id=$1 AND status='active' AND availability='available'`, [technicianId])).rows[0];
      if (!tech) throw badRequest('TECHNICIAN_UNAVAILABLE', 'Technician is unavailable');
      const qualified = (await client.query(`SELECT 1 FROM thiqah.technician_services ts JOIN thiqah.technician_areas ta ON ta.technician_id=ts.technician_id WHERE ts.technician_id=$1 AND ts.service_id=$2 AND ta.area_id=$3 LIMIT 1`, [technicianId, order.service_id, order.service_area_id])).rows[0];
      if (!qualified) throw badRequest('TECHNICIAN_NOT_QUALIFIED', 'Technician is not qualified for this service and area');
      await client.query(`INSERT INTO thiqah.order_assignments(order_id,technician_id,assigned_by_admin_id) VALUES($1,$2,$3)`, [order.id, technicianId, actor.id]);
      await client.query(`UPDATE thiqah.technicians SET availability='busy',updated_at=now() WHERE id=$1`, [technicianId]);
      return transitionOrderTx({ client, actor: { actor_type: 'admin', actor_id: actor.id }, orderId: order.id, toStatus: 'assigned', reason: 'technician_assigned', context: requestContext(config, request) });
    });
    return { ok: true, order: { id: transitioned.id, status: transitioned.status } };
  });

  app.get('/v1/admin/technicians', async (request) => {
    await requireAdminPermission({ db, config, request, permission: 'technicians.read' });
    const { rows } = await db.query(`SELECT id,name,phone,email,specialty,status,availability,permissions,created_at FROM thiqah.technicians ORDER BY name`);
    return { ok: true, technicians: rows };
  });

  app.get('/v1/admin/access', async (request) => {
    await requireAdminPermission({ db, config, request, permission: 'staff.manage' });
    const [staff, technicians] = await Promise.all([
      db.query(`SELECT id,username,display_name,email,role,status,permissions,created_at FROM thiqah.admins ORDER BY created_at DESC`),
      db.query(`SELECT id,name,phone,email,specialty,status,availability,permissions,created_at FROM thiqah.technicians ORDER BY created_at DESC`)
    ]);
    return {
      ok: true,
      staff: staff.rows,
      technicians: technicians.rows,
      permissionCatalog: {
        employee: ADMIN_PERMISSIONS,
        technician: TECHNICIAN_PERMISSIONS,
        roleDefaults: ADMIN_ROLE_DEFAULTS
      }
    };
  });

  app.post('/v1/admin/staff', async (request) => {
    const actor = await requireAdminPermission({ db, config, request, permission: 'staff.manage' });
    requireCsrf(config, request);
    const displayName = requireString(request.body?.displayName, 'displayName', { min: 2, max: 100 });
    const username = requireString(request.body?.username, 'username', { min: 2, max: 100 }).toLowerCase();
    const email = assertEmail(request.body?.email);
    if (!email) throw badRequest('VALIDATION_ERROR', 'Email is required');
    const role = oneOf(request.body?.role, EMPLOYEE_ROLES, 'role');
    const permissions = validatePermissions(request.body?.permissions ?? ADMIN_ROLE_DEFAULTS[role], ADMIN_PERMISSIONS);
    const passwordHash = await hashPassword(request.body?.password);
    const inserted = await db.query(
      `INSERT INTO thiqah.admins(username,display_name,email,password_hash,role,mfa_required,permissions)
       VALUES($1,$2,$3,$4,$5,true,$6::text[])
       RETURNING id,username,display_name,email,role,status,permissions,created_at`,
      [username, displayName, email, passwordHash, role, permissions]
    ).catch((error) => {
      if (error?.code === '23505') throw conflict('ACCOUNT_ALREADY_EXISTS', 'Username or email is already registered');
      throw error;
    });
    const created = inserted.rows[0];
    await audit(db, { actorType: 'admin', actorId: actor.id, action: 'staff.create', objectType: 'admin', objectId: created.id, context: requestContext(config, request), metadata: { role, permissions } });
    return { ok: true, staff: created };
  });

  app.patch('/v1/admin/staff/:staffId', async (request) => {
    const actor = await requireAdminPermission({ db, config, request, permission: 'staff.manage' });
    requireCsrf(config, request);
    const staffId = assertUuid(request.params.staffId, 'staffId');
    const current = (await db.query(`SELECT id,role FROM thiqah.admins WHERE id=$1`, [staffId])).rows[0];
    if (!current) throw notFound('Staff account not found');
    if (current.role === 'owner') throw badRequest('OWNER_ACCOUNT_PROTECTED', 'Owner account cannot be changed here');
    const role = request.body?.role === undefined ? null : oneOf(request.body.role, EMPLOYEE_ROLES, 'role');
    const status = request.body?.status === undefined ? null : oneOf(request.body.status, ACCOUNT_STATUSES, 'status');
    const permissions = request.body?.permissions === undefined ? null : validatePermissions(request.body.permissions, ADMIN_PERMISSIONS);
    if (role === null && status === null && permissions === null) throw badRequest('VALIDATION_ERROR', 'No changes supplied');
    const updated = (await db.query(
      `UPDATE thiqah.admins SET
         role=COALESCE($2,role),status=COALESCE($3,status),permissions=COALESCE($4::text[],permissions),updated_at=now()
       WHERE id=$1 RETURNING id,username,display_name,email,role,status,permissions,updated_at`,
      [staffId, role, status, permissions]
    )).rows[0];
    if (status === 'disabled') await db.query(`UPDATE thiqah.auth_sessions SET revoked_at=now() WHERE actor_type='admin' AND actor_id=$1 AND revoked_at IS NULL`, [staffId]);
    await audit(db, { actorType: 'admin', actorId: actor.id, action: 'staff.update', objectType: 'admin', objectId: staffId, context: requestContext(config, request), metadata: { role, status, permissions } });
    return { ok: true, staff: updated };
  });

  app.post('/v1/admin/technicians', async (request) => {
    const actor = await requireAdminPermission({ db, config, request, permission: 'technicians.manage' });
    requireCsrf(config, request);
    const name = requireString(request.body?.name, 'name', { min: 2, max: 100 });
    const phone = assertSaudiMobile(request.body?.phone);
    const email = assertEmail(request.body?.email);
    const specialty = optionalString(request.body?.specialty, 'specialty', { max: 150 });
    const permissions = validatePermissions(request.body?.permissions ?? TECHNICIAN_PERMISSIONS, TECHNICIAN_PERMISSIONS);
    const passwordHash = await hashPassword(request.body?.password);
    const inserted = await db.query(
      `INSERT INTO thiqah.technicians(name,phone,email,password_hash,specialty,permissions)
       VALUES($1,$2,$3,$4,$5,$6::text[])
       RETURNING id,name,phone,email,specialty,status,availability,permissions,created_at`,
      [name, phone, email, passwordHash, specialty, permissions]
    ).catch((error) => {
      if (error?.code === '23505') throw conflict('ACCOUNT_ALREADY_EXISTS', 'Phone or email is already registered');
      throw error;
    });
    const created = inserted.rows[0];
    await audit(db, { actorType: 'admin', actorId: actor.id, action: 'technician.create', objectType: 'technician', objectId: created.id, context: requestContext(config, request), metadata: { specialty, permissions } });
    return { ok: true, technician: created };
  });

  app.patch('/v1/admin/technicians/:technicianId', async (request) => {
    const actor = await requireAdminPermission({ db, config, request, permission: 'technicians.manage' });
    requireCsrf(config, request);
    const technicianId = assertUuid(request.params.technicianId, 'technicianId');
    const status = request.body?.status === undefined ? null : oneOf(request.body.status, ACCOUNT_STATUSES, 'status');
    const availability = request.body?.availability === undefined ? null : oneOf(request.body.availability, TECHNICIAN_AVAILABILITY, 'availability');
    const specialty = request.body?.specialty === undefined ? undefined : optionalString(request.body.specialty, 'specialty', { max: 150 });
    const permissions = request.body?.permissions === undefined ? null : validatePermissions(request.body.permissions, TECHNICIAN_PERMISSIONS);
    if (status === null && availability === null && specialty === undefined && permissions === null) throw badRequest('VALIDATION_ERROR', 'No changes supplied');
    const updated = (await db.query(
      `UPDATE thiqah.technicians SET
         status=COALESCE($2,status),availability=COALESCE($3,availability),
         specialty=CASE WHEN $4::boolean THEN $5 ELSE specialty END,
         permissions=COALESCE($6::text[],permissions),updated_at=now()
       WHERE id=$1 RETURNING id,name,phone,email,specialty,status,availability,permissions,updated_at`,
      [technicianId, status, availability, specialty !== undefined, specialty ?? null, permissions]
    )).rows[0];
    if (!updated) throw notFound('Technician not found');
    if (status === 'disabled') await db.query(`UPDATE thiqah.auth_sessions SET revoked_at=now() WHERE actor_type='technician' AND actor_id=$1 AND revoked_at IS NULL`, [technicianId]);
    await audit(db, { actorType: 'admin', actorId: actor.id, action: 'technician.update', objectType: 'technician', objectId: technicianId, context: requestContext(config, request), metadata: { status, availability, specialty, permissions } });
    return { ok: true, technician: updated };
  });
}
