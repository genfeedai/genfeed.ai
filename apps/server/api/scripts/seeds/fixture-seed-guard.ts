const LOCAL_DATABASE_HOSTS = new Set([
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '[::1]',
  'localhost',
]);

export function assertFixtureSeedAllowed(
  environment: NodeJS.ProcessEnv,
  databaseUrl: URL,
): void {
  if (environment.GENFEED_CLOUD === 'true') {
    throw new Error(
      'Refusing to run the fixture seed against a hosted cloud environment',
    );
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run the fixture seed when NODE_ENV=production',
    );
  }
  const isLocal =
    LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname) ||
    databaseUrl.hostname.endsWith('.localhost');
  if (!isLocal) {
    throw new Error(
      `Refusing to seed a non-local database host: ${databaseUrl.hostname || 'unknown'}`,
    );
  }
}
