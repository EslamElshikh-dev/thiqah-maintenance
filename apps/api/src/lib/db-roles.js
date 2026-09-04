export function validateRuntimeIamDbUser(value) {
  const user = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9-]*\.iam$/.test(user)) {
    throw new Error('RUNTIME_IAM_DB_USER must be a trimmed Cloud SQL PostgreSQL service-account IAM username');
  }
  return user;
}

export async function grantRuntimeRole(db, runtimeUser) {
  const user = validateRuntimeIamDbUser(runtimeUser);
  const quoted = `"${user.replaceAll('"', '""')}"`;
  await db.query(`GRANT thiqah_app TO ${quoted}`);
}
