import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  constants,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  privateDecrypt,
} from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BRAND_PATH,
  createState,
  ENVELOPE_LIMIT,
  encryptEvidence,
  loadState,
  parseArguments,
  parseDatasetRecords,
  RAW_LIMIT,
  runBounded,
  STORAGE_PATHS,
  safeFile,
  sealState,
  validateCrunManifest,
  validateOutcome,
  validateOwnerContract,
  validatePublicKey,
  validateReport,
  validateSha,
  validateTiming,
  validateUrl,
  workBudget,
} from './runtime-acceptance.mjs';

const SHA = 'a'.repeat(40);
const CONTROL = 'b'.repeat(40);
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 3072,
});
const PEM = publicKey.export({ type: 'spki', format: 'pem' });
const fingerprint = validatePublicKey(PEM).fingerprint;
const identity = {
  version: 1,
  candidateSHA: SHA,
  controlSHA: CONTROL,
  group: 'dataset-diagnostic',
  fingerprint,
};
const child = { exitCode: 0, signal: null, timedOut: false };
const report = (assertions, name = '/fixture/sample.spec.ts') => ({
  success: true,
  testResults: [{ name, assertionResults: assertions }],
});
const assertion = (fullName, status = 'passed') => ({ fullName, status });
const ownerContract = () => ({
  version: 1,
  brand: {
    path: BRAND_PATH,
    sha256: 'c'.repeat(64),
    passedTitles: ['brand race'],
  },
  storage: STORAGE_PATHS.map((file, index) => ({
    path: file,
    sha256: 'd'.repeat(64),
    passedTitles: [`storage ${index}`],
  })),
});
async function fixture(t) {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'runtime-acceptance-test-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return realpath(directory);
}
function decrypt(envelope, key = privateKey) {
  const secret = privateDecrypt(
    { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(envelope.wrappedKey, 'base64'),
  );
  const decipher = createDecipheriv(
    'aes-256-gcm',
    secret,
    Buffer.from(envelope.nonce, 'base64'),
  );
  const aad = {
    version: envelope.version,
    candidateSHA: envelope.candidateSHA,
    controlSHA: envelope.controlSHA,
    group: envelope.group,
    fingerprint: envelope.fingerprint,
  };
  decipher.setAAD(Buffer.from(JSON.stringify(aad)));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString(),
  );
}
function datasetRecord(kind, size, run, diagnostic = false) {
  return {
    datasetBenchmark: !diagnostic,
    ...(diagnostic ? { datasetDiagnostic: true } : {}),
    samplePurpose: diagnostic
      ? 'diagnostic-only-not-matrix-acceptance'
      : run === 0
        ? 'matrix-warmup'
        : 'matrix-measurement',
    kind,
    size,
    run,
    elapsedMs: 100,
    transactionElapsedMs: 90,
    queries: 1,
    candidatePages: 1,
    graphBatches: 1,
    secondaryGraphBatches: 1,
    decisionLockBatches: 1,
    maxBindParameters: 100,
    selectedRows: size + (kind === 'mixed' ? 1 : 0),
    graphNodesMaxPass: kind === 'owned' ? 0 : 4 * size + 21,
    graphEdgesMaxPass: kind === 'owned' ? 0 : 6 * size + 200,
  };
}
const matrix = () =>
  [1000, 10000, 100000]
    .flatMap((size) =>
      ['owned', 'consented'].flatMap((kind) =>
        [0, 1, 2, 3].map((run) => datasetRecord(kind, size, run)),
      ),
    )
    .concat(datasetRecord('mixed', 10000, 1));
const lines = (records) =>
  records
    .map((record) => `stdout | fixture\n${JSON.stringify(record)}`)
    .join('\n');

test('rejects arbitrary runner commands, arguments and nonexact SHAs', () => {
  assert.equal(validateSha(SHA), SHA);
  for (const value of [
    'master',
    SHA.toUpperCase(),
    'a'.repeat(39),
    `${SHA};echo unsafe`,
  ])
    assert.throws(() => validateSha(value));
  const base = [
    'final',
    '--repo',
    '/fixture',
    '--state',
    '/state',
    '--candidate-sha',
    SHA,
    '--control-sha',
    CONTROL,
  ];
  assert.equal(parseArguments(base).command, 'final');
  for (const args of [
    ['shell', ...base.slice(1)],
    [...base, '--command', 'echo'],
    [...base, '--group', 'final'],
    [...base, '--repo', '/again'],
    [...base.slice(0, -1)],
    ['preflight', ...base.slice(1), '--group', 'unknown'],
  ])
    assert.throws(() => parseArguments(args));
});

function postgresFixtureUrl(mutate = () => {}) {
  const url = new URL('postgresql://127.0.0.1:5432/owned_test');
  url.username = 'genfeed';
  url.password = 'genfeed_local';
  mutate(url);
  return url.href;
}
test('requires loopback dedicated PostgreSQL and explicit Redis DB without host overrides', () => {
  validateUrl(postgresFixtureUrl(), 'postgres', 'owned_test');
  validateUrl('redis://localhost:6379/11', 'redis');
  for (const mutate of [
    (url) => {
      url.hostname = 'prod';
    },
    (url) => {
      url.port = '';
    },
    (url) => {
      url.pathname = '/production';
    },
    (url) => {
      url.searchParams.set('HOSTADDR', 'prod');
    },
  ])
    assert.throws(() =>
      validateUrl(postgresFixtureUrl(mutate), 'postgres', 'owned_test'),
    );
  for (const value of [
    'redis://localhost:6379',
    'redis://localhost:6379/foo',
    'redis://user@localhost:6379/1',
    'redis://localhost/1',
    'redis://localhost:6379/1?service=prod',
  ])
    assert.throws(() => validateUrl(value, 'redis'));
});

test('owner contract fixes all seven paths, hashes and nonempty unique title sets', () => {
  assert.deepEqual(
    validateOwnerContract(JSON.stringify(ownerContract())),
    ownerContract(),
  );
  const mutations = [
    (value) => {
      value.version = 2;
    },
    (value) => {
      value.extra = true;
    },
    (value) => {
      value.brand.path = 'elsewhere.spec.ts';
    },
    (value) => {
      value.brand.sha256 = 'unknown';
    },
    (value) => {
      value.brand.passedTitles = [];
    },
    (value) => {
      value.storage.pop();
    },
    (value) => {
      value.storage[1] = value.storage[0];
    },
    (value) => {
      value.storage[0].passedTitles = ['brand race'];
    },
    (value) => {
      value.storage[0].passedTitles = ['one', 'one'];
    },
  ];
  for (const mutate of mutations) {
    const value = ownerContract();
    mutate(value);
    assert.throws(() => validateOwnerContract(value));
  }
  assert.throws(() => validateOwnerContract(''));
});

test('requires actual successful original exit, exact cases, and only permitted skips', () => {
  const contracts = [
    {
      file: 'sample.spec.ts',
      count: 1,
      titles: ['actual case'],
      skipped: ['intentional performance'],
    },
  ];
  const valid = report([
    assertion('actual case'),
    assertion('intentional performance', 'pending'),
  ]);
  assert.equal(validateReport(valid, contracts, child)[0].passed, 1);
  for (const result of [
    { ...child, exitCode: 1 },
    { ...child, signal: 'SIGTERM' },
    { ...child, timedOut: true },
  ])
    assert.throws(() => validateReport(valid, contracts, result));
  for (const value of [
    undefined,
    {},
    report([]),
    report([assertion('actual case', 'pending')]),
    report([assertion('actual case', 'failed')]),
    report([assertion('actual case', 'todo')]),
    report([
      assertion('different'),
      assertion('intentional performance', 'pending'),
    ]),
    report([assertion('actual case'), assertion('unexpected', 'pending')]),
    report([assertion('actual case'), assertion('actual case')]),
    { ...valid, success: false },
  ])
    assert.throws(() => validateReport(value, contracts, child));
  assert.throws(() =>
    validateReport(
      valid,
      [...contracts, { file: 'missing.spec.ts', count: 1 }],
      child,
    ),
  );
  assert.throws(() =>
    validateReport(
      report([assertion('actual case')], '/fixture/elsewhere.spec.ts'),
      contracts,
      child,
    ),
  );
});

test('dataset diagnostic cannot satisfy final matrix and matrix coverage is exact', () => {
  const diagnostic = [
    datasetRecord('consented', 10000, 1, true),
    datasetRecord('consented', 100000, 1, true),
  ];
  assert.equal(parseDatasetRecords(lines(diagnostic), 'diagnostic').length, 2);
  assert.equal(parseDatasetRecords(lines(matrix()), 'matrix').length, 25);
  assert.throws(() => parseDatasetRecords(lines(diagnostic), 'matrix'));
  assert.throws(() => parseDatasetRecords(lines(matrix()), 'diagnostic'));
  assert.throws(() => parseDatasetRecords(lines(matrix().slice(1)), 'matrix'));
  const duplicate = matrix();
  duplicate[1] = duplicate[0];
  assert.throws(() => parseDatasetRecords(lines(duplicate), 'matrix'));
  assert.throws(() =>
    parseDatasetRecords(
      `${lines(matrix())}\n{"datasetBenchmark":true,broken`,
      'matrix',
    ),
  );
  assert.throws(() =>
    parseDatasetRecords(
      `${lines(matrix())}\ndatasetDiagnostic malformed`,
      'matrix',
    ),
  );
});

test('retains unchanged dataset latency, SQL, bind and graph bounds', () => {
  for (const [field, value] of [
    ['elapsedMs', 30001],
    ['transactionElapsedMs', 30001],
    ['queries', 100000],
    ['maxBindParameters', 32768],
    ['selectedRows', 999],
    ['graphNodesMaxPass', 1],
    ['graphEdgesMaxPass', 1],
    ['elapsedMs', -1],
  ]) {
    const records = matrix();
    records[0][field] = value;
    assert.throws(() => parseDatasetRecords(lines(records), 'matrix'));
  }
  const records = matrix();
  records[4].elapsedMs = 60001;
  assert.throws(() => parseDatasetRecords(lines(records), 'matrix'));
});

test('accepts only RSA public SPKI keys of at least 3072 bits', () => {
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  for (const value of [
    undefined,
    '',
    'malformed',
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({
      type: 'spki',
      format: 'pem',
    }),
    generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({
      type: 'spki',
      format: 'pem',
    }),
  ])
    assert.throws(() => validatePublicKey(value));
});

test('encrypted evidence roundtrips privately and authenticates both SHAs and contents', () => {
  const payload = {
    outcome: { error: 'private error', prompt: 'private prompt' },
    files: [{ path: 'private-source.ts', bytes: 'private media' }],
  };
  const first = encryptEvidence(payload, identity, PEM);
  const second = encryptEvidence(payload, identity, PEM);
  assert.deepEqual(decrypt(first), payload);
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.wrappedKey, second.wrappedKey);
  for (const plaintext of [
    'private error',
    'private prompt',
    'private-source.ts',
    'private media',
  ])
    assert.ok(!JSON.stringify(first).includes(plaintext));
  assert.throws(() => decrypt({ ...first, candidateSHA: CONTROL }));
  assert.throws(() => decrypt({ ...first, controlSHA: SHA }));
  assert.throws(() =>
    decrypt({
      ...first,
      ciphertext: Buffer.from('tampered').toString('base64'),
    }),
  );
  const wrong = generateKeyPairSync('rsa', { modulusLength: 3072 }).privateKey;
  assert.throws(() => decrypt(first, wrong));
  assert.throws(() =>
    encryptEvidence(payload, { ...identity, fingerprint: 'wrong' }, PEM),
  );
});

test('size policy rejects oversized raw evidence rather than truncating it', () => {
  assert.equal(RAW_LIMIT, 50 * 1024 * 1024);
  assert.equal(ENVELOPE_LIMIT, 100 * 1024 * 1024);
  assert.throws(() =>
    encryptEvidence(
      { bytes: 'x'.repeat(Math.ceil(RAW_LIMIT * 1.4 + 65537)) },
      identity,
      PEM,
    ),
  );
});

test('evidence reader refuses traversal, symlinks and nonprivate modes', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'safe'), 'private', { mode: 0o600 });
  assert.equal((await safeFile(root, 'safe')).toString(), 'private');
  await assert.rejects(safeFile(root, '../safe'));
  await assert.rejects(safeFile(root, '/safe'));
  await symlink(path.join(root, 'safe'), path.join(root, 'link'));
  await assert.rejects(safeFile(root, 'link'));
  await chmod(path.join(root, 'safe'), 0o644);
  await assert.rejects(safeFile(root, 'safe'));
  await chmod(path.join(root, 'safe'), 0o600);
  await assert.rejects(safeFile(root, 'safe', 1));
});

test('Crun manifest accepts owner atomic replacement content but refuses broad cleanup keys', () => {
  const directory = '/tmp/crun-owned-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const manifest = {
    version: 1,
    schema: `crun_flow_${'a'.repeat(32)}`,
    ownedDirectory: directory,
    redisKeys: [
      `crun:requests:${'b'.repeat(64)}`,
      `crun:quote:${'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:'.repeat(2)}aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:consumed`,
    ],
  };
  assert.deepEqual(validateCrunManifest(manifest, directory), manifest);
  for (const value of [
    { ...manifest, ownedDirectory: '/tmp/other' },
    { ...manifest, schema: 'public' },
    { ...manifest, redisKeys: ['*'] },
    { ...manifest, redisKeys: [...manifest.redisKeys, manifest.redisKeys[0]] },
    { ...manifest, redisKeys: Array(1025).fill('key') },
    { ...manifest, unknown: true },
  ])
    assert.throws(() => validateCrunManifest(value, directory));
});

test('a failed outcome or incomplete coverage can never produce a successful receipt', () => {
  const outcome = {
    ...identity,
    status: 'passed',
    completed: [
      'dataset-correctness',
      'dataset-typecheck',
      'dataset-diagnostic',
    ].map((stage) => ({ stage })),
    failures: [],
    cleanup: { passed: true },
  };
  assert.equal(validateOutcome(outcome, outcome, identity), 'passed');
  assert.throws(() => validateOutcome(outcome, undefined, identity));
  assert.throws(() =>
    validateOutcome(
      { ...outcome, completed: [] },
      { ...outcome, completed: [] },
      identity,
    ),
  );
  assert.throws(() =>
    validateOutcome({ ...outcome, candidateSHA: CONTROL }, outcome, identity),
  );
  const failed = { ...outcome, status: 'failed' };
  assert.equal(validateOutcome(failed, undefined, identity), 'failed');
  assert.throws(() => validateOutcome(failed, outcome, identity));
});

async function stateFixture(t) {
  const root = await fixture(t);
  const state = path.join(root, 'state');
  await mkdir(state, { mode: 0o700 });
  const metadata = await lstat(state);
  await mkdir(path.join(state, 'raw'), { mode: 0o700 });
  const value = {
    ...identity,
    ...validateTiming('dataset-diagnostic', Date.now()),
    state,
    repo: root,
    phase: 'prepared',
    device: metadata.dev,
    inode: metadata.ino,
    evidence: [],
    resources: { databases: [], containers: [] },
  };
  await writeFile(path.join(state, 'identity.json'), JSON.stringify(value), {
    mode: 0o600,
  });
  return {
    value,
    options: {
      repo: root,
      state,
      'candidate-sha': SHA,
      'control-sha': CONTROL,
    },
    env: { RUNTIME_ACCEPTANCE_PUBLIC_KEY: PEM },
  };
}

test('state reuse requires matching identity, key and private directory', async (t) => {
  const { value, options, env } = await stateFixture(t);
  assert.deepEqual(await loadState(options, env), value);
  await assert.rejects(
    loadState({ ...options, 'candidate-sha': CONTROL }, env),
  );
  await chmod(value.state, 0o755);
  await assert.rejects(loadState(options, env));
});

test('sealing failed preparation preserves failure and refuses successful output', async (t) => {
  const { value, env } = await stateFixture(t);
  const receipt = await sealState(value, env);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.cleanup, false);
  assert.equal(receipt.passed, 0);
  const envelope = JSON.parse(
    await readFile(path.join(value.state, 'public/evidence.encrypted.json')),
  );
  assert.equal(decrypt(envelope).outcome.status, 'failed');
  assert.equal(decrypt(envelope).receipt, undefined);
  assert.equal(value.phase, 'sealed');
  assert.deepEqual(await sealState(value, env), receipt);
  await writeFile(
    path.join(value.state, 'public/evidence.encrypted.json'),
    '{}',
  );
  await assert.rejects(sealState(value, env));
});

test('seal rejects missing successful receipt, malformed outcome and illegal phase', async (t) => {
  const { value, env } = await stateFixture(t);
  value.phase = 'running';
  await assert.rejects(sealState(value, env));
  value.phase = 'finished';
  await assert.rejects(sealState(value, env));
  await writeFile(
    path.join(value.state, 'outcome.json'),
    JSON.stringify({
      ...identity,
      status: 'passed',
      completed: [],
      cleanup: { passed: true },
      failures: [],
    }),
    { mode: 0o600 },
  );
  await assert.rejects(sealState(value, env));
});

test('bounded child preserves nonzero exit and records cleanup failure independently', async (t) => {
  const root = await fixture(t);
  const result = await runBounded({
    executable: process.execPath,
    args: ['-e', 'process.stdout.write("private payload");process.exit(7)'],
    cwd: root,
    env: process.env,
    stdoutPath: path.join(root, 'stdout'),
    stderrPath: path.join(root, 'stderr'),
    timeoutMs: 1000,
    graceMs: 50,
    cleanup: async () => {
      throw Object.assign(new Error('private cleanup'), {
        code: 'FIXTURE_CLEANUP',
      });
    },
  });
  assert.equal(result.exitCode, 7);
  assert.equal(result.cleanupError, 'FIXTURE_CLEANUP');
  assert.equal(
    (await readFile(path.join(root, 'stdout'))).toString(),
    'private payload',
  );
});

test('spawn and stream preparation failures still run cleanup', async (t) => {
  const root = await fixture(t);
  let cleaned = 0;
  const result = await runBounded({
    executable: '/missing-executable',
    args: [],
    cwd: root,
    env: process.env,
    stdoutPath: path.join(root, 'stdout'),
    stderrPath: path.join(root, 'stderr'),
    timeoutMs: 1000,
    graceMs: 50,
    cleanup: async () => {
      cleaned++;
    },
  });
  assert.equal(result.spawnError, 'SPAWN_FAILED');
  assert.equal(cleaned, 1);
  const second = await runBounded({
    executable: process.execPath,
    args: [],
    cwd: root,
    env: process.env,
    stdoutPath: path.join(root, 'stdout'),
    stderrPath: path.join(root, 'stderr'),
    timeoutMs: 1000,
    graceMs: 50,
    cleanup: async () => {
      cleaned++;
    },
  });
  assert.equal(second.spawnError, 'CHILD_CONTROL_FAILED');
  assert.equal(cleaned, 2);
});

test('timeout terminates owned descendants before cleanup and retains the timeout', async (t) => {
  const root = await fixture(t);
  const pidFile = path.join(root, 'descendant.pid');
  let cleaned = false;
  const source = `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});fs.writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000);`;
  const result = await runBounded({
    executable: process.execPath,
    args: ['-e', source, pidFile],
    cwd: root,
    env: process.env,
    stdoutPath: path.join(root, 'stdout'),
    stderrPath: path.join(root, 'stderr'),
    timeoutMs: 500,
    graceMs: 50,
    cleanup: async () => {
      cleaned = true;
      const pid = Number(await readFile(pidFile, 'utf8'));
      try {
        const status = await readFile(`/proc/${pid}/stat`, 'utf8');
        assert.match(status, /\) Z /);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.cleanupError, null);
  assert.equal(cleaned, true);
});

test('immutable job deadlines reject stale, future and missing anchors without resetting setup time', () => {
  const now = 10000000;
  const timing = validateTiming('visual-connected', now - 100000, now);
  assert.equal(timing.setupDeadline, now - 100000 + 720000);
  assert.equal(timing.overallDeadline, now - 100000 + 6300000);
  for (const value of [undefined, '', 0, now + 1, now - 6300000, 'arbitrary'])
    assert.throws(() => validateTiming('visual-connected', value, now));
  assert.equal(
    workBudget({ ...timing, group: 'visual-connected' }, now),
    timing.overallDeadline - 300000,
  );
  assert.throws(() =>
    workBudget(
      { ...timing, group: 'visual-connected' },
      timing.overallDeadline - 300000,
    ),
  );
});

async function preflightFixture(t) {
  const repo = await fixture(t);
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(['init', '--quiet']);
  await writeFile(path.join(repo, 'fixture'), 'synthetic repository');
  git(['add', 'fixture']);
  git([
    '-c',
    'user.name=Acceptance Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--quiet',
    '-m',
    'Synthetic fixture',
  ]);
  const head = git(['rev-parse', 'HEAD']);
  return {
    repo,
    options: {
      repo,
      state: path.join(repo, 'private-state'),
      'candidate-sha': head,
      'control-sha': head,
      group: 'dataset-diagnostic',
    },
    env: {
      ...process.env,
      RUNNER_TEMP: repo,
      RUNTIME_ACCEPTANCE_PUBLIC_KEY: PEM,
      RUNTIME_ACCEPTANCE_JOB_STARTED_MS: String(Date.now()),
    },
  };
}

test('preflight exclusively creates private identity and later commands must reuse it', async (t) => {
  const { options, env } = await preflightFixture(t);
  const value = await createState(options, env);
  assert.equal(value.phase, 'prepared');
  assert.equal((await lstat(options.state)).mode & 0o777, 0o700);
  assert.equal(
    (await lstat(path.join(options.state, 'identity.json'))).mode & 0o777,
    0o600,
  );
  assert.deepEqual(await loadState(options, env), value);
  await assert.rejects(createState(options, env));
  await assert.rejects(
    loadState(options, {
      ...env,
      RUNTIME_ACCEPTANCE_PUBLIC_KEY: generateKeyPairSync('rsa', {
        modulusLength: 3072,
      }).publicKey.export({ type: 'spki', format: 'pem' }),
    }),
  );
});

test('preflight rejects control or candidate SHA mismatch before creating state', async (t) => {
  const { options, env } = await preflightFixture(t);
  await assert.rejects(
    createState({ ...options, 'control-sha': CONTROL }, env),
  );
  await assert.rejects(lstat(options.state));
  await assert.rejects(
    createState(
      { ...options, group: 'visual-isolation', 'candidate-sha': SHA },
      env,
    ),
  );
  await assert.rejects(lstat(options.state));
});

test('final preflight refuses absent or changed owner source before expensive work or state creation', async (t) => {
  const { options, env, repo } = await preflightFixture(t);
  const contract = ownerContract();
  const finalOptions = { ...options, group: 'final' };
  const finalEnv = {
    ...env,
    RUNTIME_ACCEPTANCE_OWNER_CONTRACT: JSON.stringify(contract),
  };
  await assert.rejects(createState(finalOptions, finalEnv));
  await assert.rejects(lstat(options.state));
  for (const entry of [contract.brand, ...contract.storage]) {
    const file = path.join(repo, entry.path);
    await mkdir(path.dirname(file), { recursive: true });
    const contents = `synthetic ${entry.path}`;
    await writeFile(file, contents);
    entry.sha256 = createHash('sha256').update(contents).digest('hex');
  }
  await writeFile(
    path.join(repo, contract.storage[0].path),
    'changed after owner inspection',
  );
  await assert.rejects(
    createState(finalOptions, {
      ...finalEnv,
      RUNTIME_ACCEPTANCE_OWNER_CONTRACT: JSON.stringify(contract),
    }),
  );
  await assert.rejects(lstat(options.state));
});

test('overlarge child output preserves a bounded failed prefix while draining termination', async (t) => {
  const root = await fixture(t);
  const result = await runBounded({
    executable: process.execPath,
    args: [
      '-e',
      'const bytes=Buffer.alloc(1024*1024,120);for(let i=0;i<60;i++)process.stdout.write(bytes);setInterval(()=>{},1000)',
    ],
    cwd: root,
    env: process.env,
    stdoutPath: path.join(root, 'stdout'),
    stderrPath: path.join(root, 'stderr'),
    timeoutMs: 10000,
    graceMs: 50,
  });
  assert.equal(result.outputLimit, true);
  const total =
    (await lstat(path.join(root, 'stdout'))).size +
    (await lstat(path.join(root, 'stderr'))).size;
  assert.ok(total > 0 && total <= RAW_LIMIT);
  assert.notEqual(result.signal, null);
});

test('dataset marker-bearing extra records never disappear from coverage validation', () => {
  for (const record of [
    { datasetBenchmark: false },
    { datasetBenchmark: 'true' },
    { datasetDiagnostic: false },
    { datasetDiagnostic: 1 },
  ])
    assert.throws(() =>
      parseDatasetRecords(
        `${lines(matrix())}\n${JSON.stringify(record)}`,
        'matrix',
      ),
    );
  assert.equal(
    parseDatasetRecords(
      `${lines(matrix())}\n{"unrelated":"metadata"}`,
      'matrix',
    ).length,
    25,
  );
});

test('successful buffered child output is completely flushed before cleanup', async (t) => {
  const root = await fixture(t);
  const stdout = path.join(root, 'stdout');
  const terminal = 'FINAL-OUTPUT-MARKER';
  let cleaned = false;
  const result = await runBounded({
    executable: process.execPath,
    args: [
      '-e',
      `process.stdout.write(Buffer.alloc(1024*1024,120));process.stdout.write(Buffer.alloc(1024*1024,121));process.stdout.write('${terminal}');`,
    ],
    cwd: root,
    env: process.env,
    stdoutPath: stdout,
    stderrPath: path.join(root, 'stderr'),
    timeoutMs: 5000,
    graceMs: 50,
    cleanup: async () => {
      const bytes = await readFile(stdout);
      assert.equal(bytes.length, 2 * 1024 * 1024 + terminal.length);
      assert.equal(bytes.subarray(-terminal.length).toString(), terminal);
      cleaned = true;
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.streamError, null);
  assert.equal(result.cleanupError, null);
  assert.equal(cleaned, true);
});

const CLI_PATH = new URL('./runtime-acceptance.mjs', import.meta.url);
function actualCli(command, options, env = {}) {
  const args = [
    command,
    '--repo',
    options.repo,
    '--state',
    options.state,
    '--candidate-sha',
    options['candidate-sha'],
    '--control-sha',
    options['control-sha'],
  ];
  if (command === 'preflight') args.push('--group', options.group);
  return spawnSync(process.execPath, [CLI_PATH.pathname, ...args], {
    cwd: options.repo,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 128 * 1024,
  });
}
function assertUnqualifiedCli(result) {
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /runtime-acceptance UNQUALIFIED_RUNTIME_GROUP/);
  assert.doesNotMatch(result.stdout, /prepared|passed|result=passed/);
}
async function snapshotState(root) {
  const files = {};
  const visit = async (directory, relative = '') => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory())
        await visit(path.join(directory, entry.name), name);
      else
        files[name] = (
          await readFile(path.join(directory, entry.name))
        ).toString('base64');
    }
  };
  await visit(root);
  return files;
}
for (const group of ['final', 'visual-isolation', 'visual-connected'])
  test(`actual CLI rejects unqualified ${group} preflight and direct command before side effects`, async (t) => {
    const { options, env } = await preflightFixture(t);
    const output = path.join(options.repo, 'cli.output');
    const marker = path.join(options.repo, 'child-command.marker');
    const testEnv = {
      ...env,
      GITHUB_OUTPUT: output,
      RUNTIME_ACCEPTANCE_QUALIFIED_GROUPS: group,
      CHILD_COMMAND_MARKER: marker,
    };
    assertUnqualifiedCli(
      actualCli('preflight', { ...options, group }, testEnv),
    );
    assertUnqualifiedCli(actualCli(group, options, testEnv));
    await assert.rejects(lstat(options.state));
    await assert.rejects(lstat(output));
    await assert.rejects(lstat(marker));
  });
for (const group of ['final', 'visual-isolation', 'visual-connected'])
  for (const phase of ['prepared', 'finished', 'sealed'])
    test(`actual CLI rejects forged ${group} ${phase} identity without mutation`, async (t) => {
      const { value, options, env } = await stateFixture(t);
      Object.assign(value, {
        group,
        phase,
        ...validateTiming(group, Date.now()),
      });
      await writeFile(
        path.join(value.state, 'identity.json'),
        JSON.stringify(value),
        { mode: 0o600 },
      );
      const before = await snapshotState(value.state);
      assertUnqualifiedCli(actualCli('seal', options, env));
      assertUnqualifiedCli(actualCli('dataset-diagnostic', options, env));
      assert.deepEqual(await snapshotState(value.state), before);
    });
for (const relative of [
  'outcome.json',
  'receipt.json',
  'public/receipt.json',
  'public/evidence.encrypted.json',
])
  test(`actual dataset seal rejects a future-group ${relative} rather than implying acceptance`, async (t) => {
    const { value, options, env } = await stateFixture(t);
    value.phase =
      relative === 'public/evidence.encrypted.json' ? 'sealed' : 'prepared';
    await writeFile(
      path.join(value.state, 'identity.json'),
      JSON.stringify(value),
      { mode: 0o600 },
    );
    const file = path.join(value.state, relative);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        candidateSHA: value.candidateSHA,
        controlSHA: value.controlSHA,
        fingerprint: value.fingerprint,
        group: 'final',
        status: 'passed',
      }),
      { mode: 0o600 },
    );
    const before = await snapshotState(value.state);
    assertUnqualifiedCli(actualCli('seal', options, env));
    assert.deepEqual(await snapshotState(value.state), before);
  });
test('actual dataset preflight remains qualified and preparation-only seal retains failure', async (t) => {
  const { options, env } = await preflightFixture(t);
  const output = path.join(options.repo, 'cli.output');
  const testEnv = { ...env, GITHUB_OUTPUT: output };
  const prepared = actualCli('preflight', options, testEnv);
  assert.ifError(prepared.error);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.match(await readFile(output, 'utf8'), /prepared=true/);
  const sealed = actualCli('seal', options, testEnv);
  assert.ifError(sealed.error);
  assert.equal(sealed.status, 1);
  assert.match(sealed.stdout, /runtime-acceptance failed/);
  assert.doesNotMatch(sealed.stderr, /UNQUALIFIED_RUNTIME_GROUP/);
  const receipt = JSON.parse(
    await readFile(path.join(options.state, 'public/receipt.json'), 'utf8'),
  );
  assert.equal(receipt.group, 'dataset-diagnostic');
  assert.equal(receipt.status, 'failed');
  assert.doesNotMatch(await readFile(output, 'utf8'), /result=passed/);
  assert.equal(
    decrypt(
      JSON.parse(
        await readFile(
          path.join(options.state, 'public/evidence.encrypted.json'),
          'utf8',
        ),
      ),
    ).outcome.status,
    'failed',
  );
});

test('actual dataset seal rejects qualified documents with a mismatched identity tuple', async (t) => {
  for (const field of ['candidateSHA', 'controlSHA', 'fingerprint']) {
    const { value, options, env } = await stateFixture(t);
    const document = {
      version: 1,
      group: 'dataset-diagnostic',
      candidateSHA: value.candidateSHA,
      controlSHA: value.controlSHA,
      fingerprint: value.fingerprint,
      status: 'failed',
    };
    document[field] = field === 'fingerprint' ? 'e'.repeat(64) : 'e'.repeat(40);
    await writeFile(
      path.join(value.state, 'outcome.json'),
      JSON.stringify(document),
      { mode: 0o600 },
    );
    const before = await snapshotState(value.state);
    const result = actualCli('seal', options, env);
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /QUALIFIED_RECEIPT_IDENTITY_MISMATCH/);
    assert.doesNotMatch(result.stdout, /passed/);
    assert.deepEqual(await snapshotState(value.state), before);
  }
});
