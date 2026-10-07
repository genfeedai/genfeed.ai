import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { validateRuntimeConfig } from './config.mjs';
import { parseEnv } from './core.mjs';

function fixtureUrlWithCredentials(value, username, password) {
  const url = new URL(value);
  url.username = username;
  url.password = password;
  return url.toString();
}

const ci = parseEnv(
  readFileSync(new URL('./cloud-sweep.placeholders', import.meta.url), 'utf8'),
);
ci.CLOUD_SWEEP_RUN_DIR = mkdtempSync(join(tmpdir(), 'tenant-config-'));
after(() => rmSync(ci.CLOUD_SWEEP_RUN_DIR, { recursive: true, force: true }));
const studio = { home: join('/', 'Users', 'decod3rslabs') };
const local = {
  ...ci,
  CLOUD_SWEEP_LOCAL: '1',
  PORT: '51001',
  CLOUD_SWEEP_BASE_URL: 'http://127.0.0.1:51001',
  DATABASE_URL: fixtureUrlWithCredentials(
    'postgresql://localhost:5432/genfeed_cloud_sweep_6175_20261005120000_abcdef12_test',
    'test-user',
    'test-password',
  ),
  REDIS_URL: 'redis://127.0.0.1:51002',
  BETTER_AUTH_TRUSTED_ORIGINS: 'http://127.0.0.1:51001,http://localhost:3000',
};
for (const key of [
  'BETTER_AUTH_URL',
  'GENFEEDAI_API_URL',
  'GENFEEDAI_API_PUBLIC_URL',
  'GENFEEDAI_WEBHOOKS_URL',
])
  local[key] = local.CLOUD_SWEEP_BASE_URL;
for (const [workload, db] of [
  ['QUEUE', '0'],
  ['CACHE', '1'],
  ['RATELIMIT', '2'],
  ['SOCKET', '3'],
]) {
  local[`REDIS_${workload}_URL`] = local.REDIS_URL;
  local[`REDIS_${workload}_DB`] = db;
}

test('default CI configuration remains exact and local mode is Studio-only', () => {
  assert.deepEqual(validateRuntimeConfig(ci), {
    mode: 'ci',
    baseUrl: 'http://127.0.0.1:3010',
  });
  assert.equal(validateRuntimeConfig(local, studio).mode, 'local');
  assert.throws(() =>
    validateRuntimeConfig(local, { home: join('/', 'Users', 'decod3rs') }),
  );
  assert.throws(() =>
    validateRuntimeConfig({ ...local, GITHUB_ACTIONS: 'true' }, studio),
  );
  for (const marker of ['true', '0', '', 'yes'])
    assert.throws(() =>
      validateRuntimeConfig({ ...ci, CLOUD_SWEEP_LOCAL: marker }, studio),
    );
  for (const change of [
    { CI: 'false' },
    { GENFEED_CLOUD: 'false' },
    { NODE_ENV: 'production' },
    { PORT: '51001' },
    { REDIS_URL: local.REDIS_URL },
    { DATABASE_URL: local.DATABASE_URL },
    { CLOUD_SWEEP_BASE_URL: local.CLOUD_SWEEP_BASE_URL },
  ])
    assert.throws(() => validateRuntimeConfig({ ...ci, ...change }));
});

test('local mode rejects remote, malformed, encoded, retained and socket database endpoints', () => {
  for (const url of [
    undefined,
    'bad-url',
    ci.DATABASE_URL,
    local.DATABASE_URL.replace('localhost', 'remote.example'),
    local.DATABASE_URL.replace('localhost', 'localhost.example'),
    local.DATABASE_URL.replace(':5432', ':5433'),
    local.DATABASE_URL.replace('_test', '_retained'),
    local.DATABASE_URL.replace('genfeed_cloud', '%67enfeed_cloud'),
    `${local.DATABASE_URL}?host=/tmp`,
    `${local.DATABASE_URL}#fragment`,
    'postgresql:///genfeed_cloud_sweep_6175_20261005120000_abcdef12_test',
    local.DATABASE_URL.replace('postgresql:', 'https:'),
  ])
    assert.throws(() =>
      validateRuntimeConfig({ ...local, DATABASE_URL: url }, studio),
    );
});

test('local mode rejects invalid or credential-bearing API and Redis URLs and equal ports', () => {
  for (const url of [
    undefined,
    'http://localhost:51001',
    'https://127.0.0.1:51001',
    'http://127.0.0.1:3010',
    'http://127.0.0.1:65536',
    fixtureUrlWithCredentials('http://127.0.0.1:51001', 'user', 'pass'),
    'http://127.0.0.1:51001/path',
    'http://127.0.0.1:51001?q=1',
    'http://127.0.0.1:51001#x',
    'http://0x7f000001:51001',
  ])
    assert.throws(() =>
      validateRuntimeConfig({ ...local, CLOUD_SWEEP_BASE_URL: url }, studio),
    );
  for (const url of [
    undefined,
    ci.REDIS_URL,
    'redis://localhost:51002',
    'rediss://127.0.0.1:51002',
    'redis://127.0.0.1:51001',
    fixtureUrlWithCredentials('redis://127.0.0.1:51002', 'user', 'pass'),
    'redis://127.0.0.1:51002/4',
    'redis://127.0.0.1:51002?q=1',
    'redis://127.0.0.1:51002#x',
    'redis://0x7f000001:51002',
  ])
    assert.throws(() =>
      validateRuntimeConfig({ ...local, REDIS_URL: url }, studio),
    );
});

test('all API self URLs, Redis workloads and security settings must remain isolated', () => {
  for (const key of [
    'BETTER_AUTH_URL',
    'GENFEEDAI_API_URL',
    'GENFEEDAI_API_PUBLIC_URL',
    'GENFEEDAI_WEBHOOKS_URL',
  ])
    assert.throws(() =>
      validateRuntimeConfig(
        { ...local, [key]: 'http://localhost:3010' },
        studio,
      ),
    );
  for (const workload of ['QUEUE', 'CACHE', 'RATELIMIT', 'SOCKET']) {
    assert.throws(() =>
      validateRuntimeConfig(
        { ...local, [`REDIS_${workload}_URL`]: ci.REDIS_URL },
        studio,
      ),
    );
    assert.throws(() =>
      validateRuntimeConfig(
        { ...local, [`REDIS_${workload}_DB`]: '8' },
        studio,
      ),
    );
  }
  for (const change of [
    { PORT: '51003' },
    { REDIS_PASSWORD: 'inherited' },
    { REDIS_TLS: 'true' },
    { RESEND_API_KEY: 'real-key' },
    { ALLOW_EMAIL_VERIFICATION_WITHOUT_MAILER: 'true' },
    { ALLOW_EMAIL_VERIFICATION_WITHOUT_MAILER: '1' },
    { GENFEEDAI_API_KEY: 'real-key' },
    {
      GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL:
        'https://notifications.example',
    },
    {
      BETTER_AUTH_TRUSTED_ORIGINS: `${local.BETTER_AUTH_TRUSTED_ORIGINS},http://localhost:3010`,
    },
  ])
    assert.throws(() => validateRuntimeConfig({ ...local, ...change }, studio));
});

test('CI rejects external mail and unsafe statistics directories too', () => {
  for (const change of [
    { RESEND_API_KEY: 'external' },
    { ALLOW_EMAIL_VERIFICATION_WITHOUT_MAILER: 'true' },
    { GENFEEDAI_API_KEY: 'external' },
    { CLOUD_SWEEP_RUN_DIR: undefined },
    { CLOUD_SWEEP_RUN_DIR: '/tmp' },
  ])
    assert.throws(() => validateRuntimeConfig({ ...ci, ...change }));
});
