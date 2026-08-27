const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function assertIsolatedDatabaseUrl(
  databaseUrl = process.env.DATABASE_URL,
): string {
  if (!databaseUrl || databaseUrl.trim().length === 0) {
    throw new Error(
      'Isolated publish suite refused to start: DATABASE_URL is missing. Provision a disposable Postgres instance; do not fall back to a shared URL.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      'Isolated publish suite refused to start: DATABASE_URL is not a valid URL.',
    );
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      `Isolated publish suite refused to start: DATABASE_URL protocol is ${parsed.protocol}, expected postgresql.`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalHost =
    LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
  if (!isLocalHost) {
    throw new Error(
      `Isolated publish suite refused to start: DATABASE_URL host '${hostname}' is not a disposable local database. Refusing production or shared URLs.`,
    );
  }

  const databaseName = parsed.pathname.replace(/^\//, '');
  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Isolated publish suite refused to start: database '${databaseName}' does not look like a disposable test database.`,
    );
  }

  return databaseUrl;
}
