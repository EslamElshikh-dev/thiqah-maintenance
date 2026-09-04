import { effectiveAdminPermissions, hasAdminPermission } from '../../../../packages/core/src/admin-permissions.js';
import { requireActor } from './session.js';
import { forbidden } from './http.js';

export async function requireAdminPermission({ db, config, request, permission }) {
  const session = await requireActor({ db, config, request, actorTypes: ['admin'] });
  const { rows } = await db.query(
    `SELECT id,username,display_name,email,role,status,permissions
       FROM thiqah.admins
      WHERE id=$1 AND status='active'
      LIMIT 1`,
    [session.actor_id]
  );
  const actor = rows[0];
  if (!actor || !hasAdminPermission(actor, permission)) throw forbidden('Insufficient permission');
  request.admin = { ...actor, effectivePermissions: effectiveAdminPermissions(actor) };
  return request.admin;
}
