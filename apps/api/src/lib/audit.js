export async function audit(db, { actorType='system', actorId=null, action, objectType, objectId=null, outcome='success', context, metadata={} }) {
  await db.query(
    `INSERT INTO thiqah.audit_logs
      (actor_type, actor_id, action, object_type, object_id, outcome, request_id, ip_prefix_hash, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [actorType, actorId, action, objectType, objectId, outcome, context?.requestId || null, context?.ipPrefixHash || null, JSON.stringify(metadata)]
  );
}
