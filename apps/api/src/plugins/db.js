import pg from 'pg';
import { AuthTypes, Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
const { Pool } = pg;

async function connectionOptions(config) {
  if (config.databaseMode === 'url') {
    return { connector: null, options: { connectionString: config.databaseUrl } };
  }

  const connector = new Connector();
  const ipType = config.cloudSqlIpType === 'PUBLIC'
    ? IpAddressTypes.PUBLIC
    : config.cloudSqlIpType === 'PSC'
      ? IpAddressTypes.PSC
      : IpAddressTypes.PRIVATE;
  const clientOptions = await connector.getOptions({
    instanceConnectionName: config.cloudSqlInstanceConnectionName,
    ipType,
    authType: AuthTypes.IAM
  });
  return {
    connector,
    options: {
      ...clientOptions,
      user: config.cloudSqlIamDbUser,
      database: config.dbName
    }
  };
}

export async function createDb(config) {
  const { connector, options } = await connectionOptions(config);
  const pool = new Pool({
    ...options,
    max: config.dbPoolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    application_name: `thiqah-api-${config.appEnv}`,
    keepAlive: true
  });
  return {
    pool,
    async query(text, params = []) { return pool.query(text, params); },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL search_path TO thiqah, public");
        await client.query("SET LOCAL statement_timeout = '15s'");
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
      connector?.close();
    }
  };
}
