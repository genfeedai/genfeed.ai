/**
 * Normalize a Postgres connection string for migration scripts that connect to
 * the production RDS instance from a dev machine or CI.
 *
 * RDS presents a certificate chain that is not in the default trust store, so a
 * plain `sslmode=require`/`verify-full` connection fails with
 * "self signed certificate in certificate chain". These are one-off, operator-run
 * admin migrations against our own database, so we connect over TLS but skip chain
 * verification (equivalent to libpq `sslmode=no-verify`). This is NOT used by the
 * long-running app services — only by the gated migration scripts.
 */
export function normalizePgUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  // Leave an explicit `disable` alone (local/dev without TLS); otherwise force no-verify.
  if (url.searchParams.get('sslmode') !== 'disable') {
    url.searchParams.set('sslmode', 'no-verify');
  }
  return url.toString();
}

/** pg PoolConfig SSL block matching normalizePgUrl — pass alongside the connection string. */
export const PG_SSL_RELAXED = { rejectUnauthorized: false } as const;
