import { effectiveTechnicianPermissions, hasTechnicianPermission } from '../../../../packages/core/src/admin-permissions.js';
import { requireActor } from './session.js';
import { forbidden } from './http.js';

export async function requireTechnicianPermission({ db, config, request, permission }) {
  const session = await requireActor({ db, config, request, actorTypes: ['technician'] });
  const { rows } = await db.query(
    `SELECT id,name,status,permissions
       FROM thiqah.technicians
      WHERE id=$1 AND status='active'
      LIMIT 1`,
    [session.actor_id]
  );
  const actor = rows[0];
  if (!actor || !hasTechnicianPermission(actor, permission)) throw forbidden('Insufficient permission');
  request.technician = { ...actor, effectivePermissions: effectiveTechnicianPermissions(actor) };
  return { ...session, actor_id: actor.id };
}
