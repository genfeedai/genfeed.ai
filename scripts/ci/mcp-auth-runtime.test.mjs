import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  assertChildOutcome,
  CONTRACT,
  parseOptions,
  readJourneyFailure,
  readProcessNetworkNamespace,
  scrubRuntimeExport,
  validateContainer,
  validateEnvironment,
  validateJourney,
  validateNamespace,
  validateReceipt,
} from './mcp-auth-runtime.mjs';

const sha = 'a'.repeat(40);
const identity = { candidateSha: sha, testedSha: sha, nonce: 'b'.repeat(32) };
const digest = 'c'.repeat(64);
const fixtureDatabaseUrl = (
  hostname = '127.0.0.1',
  database = CONTRACT.database,
) => {
  const url = new URL(`postgresql://${hostname}:5432/${database}`);
  url.username = 'fixture';
  url.password = 'ephemeral';
  return url.href;
};
const receipt = () => ({
  version: 1,
  ...identity,
  migrationInventoryDigest: digest,
  negativeStateDigest: digest,
  cacheObserved: true,
  cases: CONTRACT.cases.map((id) => ({ id, status: 'passed' })),
  status: 'passed',
  cleanup: 'passed',
  networkAttempts: 0,
  lockDigest: digest,
  apiDigest: digest,
  mcpDigest: digest,
  journeyDigest: digest,
  images: { postgres: `sha256:${digest}`, redis: `sha256:${digest}` },
  runtime: { node: 'v22.0.0', bun: '1.3.0' },
});
const environment = () => ({
  ...Object.fromEntries(
    readFileSync(
      new URL(
        './cloud-tenant-guard-sweep/cloud-sweep.placeholders',
        import.meta.url,
      ),
      'utf8',
    )
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ]),
  ),
  GITHUB_ACTIONS: 'true',
  CHECKPOINT_DISABLE: '1',
  MCP_AUTH_RUNTIME_NONCE: identity.nonce,
  DATABASE_URL: fixtureDatabaseUrl(),
  REDIS_QUEUE_DB: '0',
  REDIS_CACHE_DB: '1',
  REDIS_RATELIMIT_DB: '2',
  REDIS_SOCKET_DB: '3',
});
const owner = { id: 'owned-id', nonce: identity.nonce, network: 'none' };
test('journey diagnostics expose only the finite failure category', () => {
  assert.equal(
    readJourneyFailure('B01_REAL_PRINCIPALS_TOKEN failed'),
    'B01_REAL_PRINCIPALS_TOKEN',
  );
  assert.equal(
    readJourneyFailure(
      'B01_REAL_PRINCIPALS_SIGNIN_HTTP_401_INVALID_EMAIL_OR_PASSWORD failed',
    ),
    'B01_REAL_PRINCIPALS_SIGNIN_HTTP_401_INVALID_EMAIL_OR_PASSWORD',
  );
  assert.equal(
    readJourneyFailure('B01_REAL_PRINCIPALS_KEY_MINT_HTTP_403 failed'),
    'B01_REAL_PRINCIPALS_KEY_MINT_HTTP_403',
  );
  assert.equal(
    readJourneyFailure('B04_KEY_CAP_AND_DIRECT_PARITY_REST_LIST failed'),
    'B04_KEY_CAP_AND_DIRECT_PARITY_REST_LIST',
  );
  assert.equal(
    readJourneyFailure(`private output\n${CONTRACT.cases[0]} failed\n`),
    CONTRACT.cases[0],
  );
  for (const output of [
    'private failure detail',
    'B99_UNDECLARED failed',
    'B04_KEY_CAP_AND_DIRECT_PARITY_PRIVATE_MESSAGE failed',
  ])
    assert.equal(readJourneyFailure(output), 'JOURNEY_INFRASTRUCTURE');
});
const container = () => ({
  Id: owner.id,
  Config: { Labels: { 'genfeed.mcp-auth.nonce': owner.nonce } },
  State: { Running: true, Pid: 100, StartedAt: 'start' },
  HostConfig: { NetworkMode: 'none', PortBindings: {} },
  Mounts: [],
});

test('finite command accepts only the claimed source and case family', () => {
  const args = [
    '--case-family',
    'brand-access',
    '--candidate-sha',
    sha,
    '--tested-sha',
    sha,
    '--state',
    '/runner/state',
  ];
  assert.equal(parseOptions(args).state, '/runner/state');
  for (const change of [
    [...args, '--command', 'anything'],
    args.map((value) => (value === 'brand-access' ? 'oauth' : value)),
    args.map((value) => (value === '/runner/state' ? 'relative' : value)),
    args.map((value) => (value === '--tested-sha' ? '--candidate-sha' : value)),
  ])
    assert.throws(() => parseOptions(change));
});

test('runtime environment rejects ambient secrets, alternate databases and real credentials', () => {
  validateEnvironment(environment());
  for (const override of [
    { GITHUB_TOKEN: 'never-record' },
    { AWS_SECRET_ACCESS_KEY: 'real-secret' },
    { UNDECLARED_SETTING: 'value' },
    { GENFEED_CLOUD: 'false' },
    { CHECKPOINT_DISABLE: undefined },
    { CHECKPOINT_DISABLE: '0' },
    { DATABASE_URL: fixtureDatabaseUrl('127.0.0.1', 'other') },
    {
      DATABASE_URL: fixtureDatabaseUrl('remote'),
    },
    { DATABASE_URL: `${environment().DATABASE_URL}?schema=other` },
    { GENFEEDAI_API_URL: 'https://remote.invalid' },
    { REDIS_CACHE_DB: '0' },
    { ALLOW_EMAIL_VERIFICATION_WITHOUT_MAILER: 'true' },
  ])
    assert.throws(() => validateEnvironment({ ...environment(), ...override }));
});

test('namespace admission and cleanup remain bound to nonce, identity and unconnected network', () => {
  validateContainer(container(), owner);
  validateNamespace([{ ifname: 'lo' }], []);
  for (const override of [
    { Id: 'other-id' },
    { Config: { Labels: {} } },
    { HostConfig: { NetworkMode: 'bridge', PortBindings: {} } },
    { HostConfig: { NetworkMode: 'none', PortBindings: { '5432/tcp': [] } } },
    { Mounts: [{ Type: 'bind' }] },
    { State: { Running: false, Pid: 0 } },
  ])
    assert.throws(() =>
      validateContainer({ ...container(), ...override }, owner),
    );
  assert.throws(() =>
    validateContainer(container(), { ...owner, pid: 101, startedAt: 'start' }),
  );
  assert.throws(() =>
    validateNamespace([{ ifname: 'lo' }, { ifname: 'eth0' }], []),
  );
  assert.throws(() =>
    validateNamespace([{ ifname: 'lo' }], [{ dst: 'default' }]),
  );
  validateContainer(
    { ...container(), State: { Running: false, Pid: 0 } },
    owner,
    { allowStopped: true },
  );
  assert.throws(() =>
    validateContainer(
      { ...container(), Id: 'other', State: { Running: false, Pid: 0 } },
      owner,
      { allowStopped: true },
    ),
  );
});

test('nonzero, signal and timeout outcomes cannot produce acceptance', () => {
  assertChildOutcome({ code: 0, signal: null, timedOut: false });
  for (const result of [
    { code: 1, signal: null, timedOut: false },
    { code: 0, signal: 'SIGTERM', timedOut: false },
    { code: 0, signal: null, timedOut: true },
    { code: null, signal: 'START_FAILED', timedOut: false },
  ])
    assert.throws(() => assertChildOutcome(result));
});

test('receipt requires all immutable cases and independently supplied source identity', () => {
  validateReceipt(receipt(), identity);
  const journey = Object.fromEntries(
    [
      'version',
      'candidateSha',
      'testedSha',
      'nonce',
      'migrationInventoryDigest',
      'negativeStateDigest',
      'cacheObserved',
    ].map((key) => [key, receipt()[key]]),
  );
  journey.cases = receipt().cases.slice(0, 11);
  validateJourney(journey, identity);
  for (const override of [
    { candidateSha: 'd'.repeat(40) },
    { testedSha: 'd'.repeat(40) },
    { nonce: 'd'.repeat(32) },
    { cleanup: 'failed' },
    { status: 'failed' },
    { networkAttempts: 1 },
    { cacheObserved: false },
    { token: 'never-upload' },
    { lockDigest: '' },
    { images: {} },
    { cases: receipt().cases.slice(1) },
    {
      cases: receipt().cases.map((entry, index) =>
        index === 7 ? { ...entry, status: 'skipped' } : entry,
      ),
    },
    {
      cases: receipt().cases.map((entry, index) =>
        index === 7 ? receipt().cases[6] : entry,
      ),
    },
  ])
    assert.throws(() =>
      validateReceipt({ ...receipt(), ...override }, identity),
    );
});

test('runtime export removes machine-local agent inputs before validating runtime symlinks', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-auth-export-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const destination = join(root, 'export');
  mkdirSync(join(destination, 'apps/app/.agents/skills'), { recursive: true });
  symlinkSync(
    '/missing-machine-local-skill',
    join(destination, 'apps/app/.agents/skills/local'),
  );
  writeFileSync(join(destination, '.env.local'), 'LOCAL_INPUT=fixture');
  writeFileSync(
    join(destination, 'runtime.js'),
    'export const runtime = true;',
  );
  symlinkSync(join(destination, 'runtime.js'), join(destination, 'safe-link'));
  scrubRuntimeExport(destination);
  assert.equal(existsSync(join(destination, 'apps/app/.agents')), false);
  assert.equal(existsSync(join(destination, '.env.local')), false);
  assert.equal(existsSync(join(destination, 'safe-link')), true);
  const outside = join(root, 'outside.js');
  writeFileSync(outside, 'outside');
  symlinkSync(outside, join(destination, 'unsafe-link'));
  assert.throws(
    () => scrubRuntimeExport(destination),
    /OUTSIDE_EXPORT_SYMLINK/,
  );
});

test('namespace reads use the validated root-owned PID with noninteractive privilege', () => {
  const calls = [];
  const run = (exe, args) => {
    calls.push([exe, args]);
    return 'net:[1234]';
  };
  assert.equal(readProcessNetworkNamespace(42, run), 'net:[1234]');
  assert.deepEqual(calls, [['sudo', ['-n', 'readlink', '/proc/42/ns/net']]]);
  for (const pid of [0, -1, '42', NaN, 1.5]) {
    assert.throws(
      () => readProcessNetworkNamespace(pid, run),
      /INVALID_NAMESPACE_PID/,
    );
  }
  assert.equal(calls.length, 1);
  assert.throws(
    () =>
      readProcessNetworkNamespace(42, () => {
        throw new Error('private host error');
      }),
    /NETWORK_NAMESPACE_READ/,
  );
});
