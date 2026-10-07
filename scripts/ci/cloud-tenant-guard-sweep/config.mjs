import { homedir } from 'node:os';
import { validateRunDirectory } from './local-mail-stub.mjs';

const CI_DATABASE = 'postgresql://genfeed:genfeed_local@localhost:5432/test';
const CI_API = 'http://127.0.0.1:3010';
const CI_REDIS = 'redis://localhost:6379';

function requireValue(condition, message) {
  if (!condition)
    throw new Error(`Invalid CLOUD sweep configuration: ${message}`);
}

function highPort(value) {
  return (
    /^\d+$/.test(value ?? '') &&
    Number(value) >= 49152 &&
    Number(value) <= 65535
  );
}

export function validateRuntimeConfig(env, { home = homedir() } = {}) {
  requireValue(
    env.CI === 'true' &&
      env.GENFEED_CLOUD === 'true' &&
      env.NODE_ENV === 'test',
    'CI/CLOUD/test markers required',
  );
  requireValue(
    env.GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL === 'http://localhost:3011',
    'restricted local mail adapter required',
  );
  requireValue(
    !env.RESEND_API_KEY &&
      !['true', '1', 'yes', 'on'].includes(
        (env.ALLOW_EMAIL_VERIFICATION_WITHOUT_MAILER ?? '').toLowerCase(),
      ),
    'external mail keys or email-verification bypass rejected',
  );
  requireValue(
    env.GENFEEDAI_API_KEY === 'ci-placeholder-internal-service-api-key',
    'synthetic internal bearer key required',
  );
  validateRunDirectory(env.CLOUD_SWEEP_RUN_DIR);
  if (env.CLOUD_SWEEP_LOCAL === undefined) {
    requireValue(
      env.DATABASE_URL === CI_DATABASE &&
        env.REDIS_URL === CI_REDIS &&
        env.PORT === '3010',
      'default CI endpoints must remain unchanged',
    );
    requireValue(
      env.CLOUD_SWEEP_BASE_URL === undefined ||
        env.CLOUD_SWEEP_BASE_URL === CI_API,
      'CI API override rejected',
    );
    return { mode: 'ci', baseUrl: CI_API };
  }
  requireValue(
    env.CLOUD_SWEEP_LOCAL === '1' &&
      env.GITHUB_ACTIONS !== 'true' &&
      home === '/Users/decod3rslabs',
    'local mode is Studio-only and never GitHub Actions',
  );
  let api;
  let database;
  let redis;
  try {
    api = new URL(env.CLOUD_SWEEP_BASE_URL);
    database = new URL(env.DATABASE_URL);
    redis = new URL(env.REDIS_URL);
  } catch {
    throw new Error(
      'Invalid CLOUD sweep configuration: explicit valid local URLs required',
    );
  }
  requireValue(
    /^http:\/\/127\.0\.0\.1:[0-9]+\/?$/.test(env.CLOUD_SWEEP_BASE_URL) &&
      api.protocol === 'http:' &&
      api.hostname === '127.0.0.1' &&
      highPort(api.port) &&
      api.port === env.PORT &&
      !api.username &&
      !api.password &&
      !api.search &&
      !api.hash &&
      api.pathname === '/',
    'dedicated loopback API endpoint required',
  );
  requireValue(
    ['postgres:', 'postgresql:'].includes(database.protocol) &&
      ['localhost', '127.0.0.1'].includes(database.hostname) &&
      database.port === '5432' &&
      !database.search &&
      !database.hash &&
      /^\/genfeed_cloud_sweep_6175_[0-9]{14}_[a-f0-9]{8}_test$/.test(
        database.pathname,
      ) &&
      database.username,
    'new owned disposable loopback database required',
  );
  requireValue(
    /^redis:\/\/127\.0\.0\.1:[0-9]+(?:\/0)?$/.test(env.REDIS_URL) &&
      redis.protocol === 'redis:' &&
      redis.hostname === '127.0.0.1' &&
      highPort(redis.port) &&
      redis.port !== api.port &&
      !redis.username &&
      !redis.password &&
      !redis.search &&
      !redis.hash &&
      ['', '/', '/0'].includes(redis.pathname),
    'dedicated credential-free loopback Redis required',
  );
  for (const [workload, db] of [
    ['QUEUE', '0'],
    ['CACHE', '1'],
    ['RATELIMIT', '2'],
    ['SOCKET', '3'],
  ]) {
    requireValue(
      env[`REDIS_${workload}_URL`] === env.REDIS_URL &&
        env[`REDIS_${workload}_DB`] === db,
      `explicit isolated ${workload} Redis endpoint/database required`,
    );
  }
  requireValue(
    !env.REDIS_PASSWORD && !env.REDIS_TLS,
    'inherited Redis password/TLS override rejected',
  );
  for (const key of [
    'BETTER_AUTH_URL',
    'GENFEEDAI_API_URL',
    'GENFEEDAI_API_PUBLIC_URL',
    'GENFEEDAI_WEBHOOKS_URL',
  ]) {
    requireValue(
      env[key] === api.origin,
      'API self URLs must match isolated origin',
    );
  }
  const origins = new Set((env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(','));
  requireValue(
    origins.size === 2 &&
      origins.has(api.origin) &&
      origins.has('http://localhost:3000'),
    'trusted origins must contain only isolated API and placeholder application',
  );
  return {
    mode: 'local',
    baseUrl: api.origin,
    databaseName: database.pathname.slice(1),
    apiPort: Number(api.port),
    redisPort: Number(redis.port),
  };
}
