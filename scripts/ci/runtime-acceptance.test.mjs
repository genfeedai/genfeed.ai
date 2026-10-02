import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  constants,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  privateDecrypt,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AGENT_PRODUCTION_FILES,
  AGENT_PRODUCTION_TITLES,
  BASELINE_SOURCE_CONTRACT,
  BRAND_PATH,
  BRAND_SOURCE_CONTRACT,
  buildLearningRedisReceipt,
  CRUN_SOURCE_CONTRACT,
  cleanupFinalCrunResources,
  cleanupFinalOwnedDatabase,
  collectConnectedEvidence,
  collectIsolationEvidence,
  createFinalOwnedDatabase,
  createState,
  DEDICATED_BUDGETS,
  DELEGATED_API_FILES,
  databaseUrl,
  dedicatedChildEnvironment,
  ENVELOPE_LIMIT,
  encryptEvidence,
  FINAL_LEARNING_BUDGET,
  hasFinalCrunTerminationProof,
  hasFinalLearningTerminationProof,
  LEARNING_SOURCE_CONTRACT,
  learningChildEnvironment,
  learningCiIdentity,
  learningRedisRunId,
  loadState,
  parseArguments,
  parseDatasetRecords,
  parseProtocolTotals,
  performDedicatedCleanup,
  persistVisualJournal,
  postgresClientInvocation,
  RAW_LIMIT,
  readPostgresCredentials,
  removeValidatedVisualRenderers,
  rendererContainerNames,
  requireLearningRedisBlank,
  requireLearningSourceContract,
  runBounded,
  runFinalCrunBounded,
  runFinalLearningBounded,
  STORAGE_PATHS,
  safeFile,
  sealState,
  startDedicatedControlProcess,
  startRegisteredDedicatedProcess,
  startVisualProcess,
  stopVisualGroups,
  superviseDedicatedAcceptance,
  superviseVisualCase,
  superviseVisualCases,
  VISUAL_CASES,
  VISUAL_LIBRARY_LIMITS,
  VISUAL_RENDERLESS_TITLES,
  validateBrandOwnerContract,
  validateCrunManifest,
  validateOutcome,
  validateOwnerContract,
  validatePublicKey,
  validateReport,
  validateSha,
  validateSharedApiFullPartition,
  validateTiming,
  validateUrl,
  validateVisualScenarioEvidence,
  validateVisualSelection,
  verifyBaselineSources,
  verifyDedicatedSources,
  verifyFinalLearningCleanup,
  verifyFrozenSources,
  verifyVisualScenarioSources,
  visualSelection,
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

function fixtureCredentials() {
  return { username: 'genfeed', password: randomBytes(24).toString('hex') };
}
function credentialEnv(credentials = fixtureCredentials()) {
  return {
    RUNTIME_ACCEPTANCE_POSTGRES_USER: credentials.username,
    RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD: credentials.password,
  };
}
function postgresFixtureUrl(credentials, mutate = () => {}) {
  const url = new URL(databaseUrl('owned_test', credentials));
  mutate(url);
  return url.href;
}
test('requires loopback dedicated PostgreSQL and explicit Redis DB without host overrides', () => {
  const credentials = fixtureCredentials();
  validateUrl(
    postgresFixtureUrl(credentials),
    'postgres',
    'owned_test',
    credentials,
  );
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
      validateUrl(
        postgresFixtureUrl(credentials, mutate),
        'postgres',
        'owned_test',
        credentials,
      ),
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
      ...credentialEnv(),
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
  const childEnv = { ...process.env };
  delete childEnv.RUNTIME_ACCEPTANCE_POSTGRES_USER;
  delete childEnv.RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD;
  return spawnSync(process.execPath, [CLI_PATH.pathname, ...args], {
    cwd: options.repo,
    env: { ...childEnv, ...env },
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
for (const relative of [
  'outcome.json',
  'receipt.json',
  'public/receipt.json',
  'public/evidence.encrypted.json',
])
  test(`actual dataset seal rejects an unknown-group ${relative} rather than implying acceptance`, async (t) => {
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
        group: 'unknown-group',
        status: 'passed',
      }),
      { mode: 0o600 },
    );
    const before = await snapshotState(value.state);
    assertUnqualifiedCli(actualCli('seal', options, env));
    assert.deepEqual(await snapshotState(value.state), before);
  });
const QUALIFIED_GROUPS = [
  'dataset-diagnostic',
  'final',
  'agent-production',
  'brand-acceptance',
  'visual-isolation',
  'visual-connected',
];
function assertCliFailure(result, code) {
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    new RegExp(`runtime-acceptance ${code}(?:\\s|$)`),
  );
  assert.doesNotMatch(result.stdout, /prepared|passed|result=passed/);
}
async function persistFixtureIdentity(value, savedDirectory = value.state) {
  await writeFile(
    path.join(savedDirectory, 'identity.json'),
    JSON.stringify(value),
    { mode: 0o600 },
  );
}
test('source qualification is exactly the six prepared fixed groups', async () => {
  const source = await readFile(CLI_PATH, 'utf8');
  const declaration = source.match(
    /const QUALIFIED_CLI_GROUPS = new Set\(\[([\s\S]*?)\]\)/,
  );
  assert.ok(declaration);
  const actual = [...declaration[1].matchAll(/'([^']+)'/g)].map(
    (entry) => entry[1],
  );
  assert.deepEqual(actual.sort(), [...QUALIFIED_GROUPS].sort());
});
for (const group of QUALIFIED_GROUPS) {
  for (const [scenario, amendment, code] of [
    [
      'missing credentials',
      {
        RUNTIME_ACCEPTANCE_POSTGRES_USER: '',
        RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD: '',
      },
      'POSTGRES_CREDENTIALS_REQUIRED',
    ],
    [
      'invalid credentials',
      { RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD: 'unsafe value' },
      'INVALID_POSTGRES_CREDENTIALS',
    ],
    [
      'missing public key',
      { RUNTIME_ACCEPTANCE_PUBLIC_KEY: '' },
      'PUBLIC_KEY_REQUIRED',
    ],
    [
      'invalid public key',
      {
        RUNTIME_ACCEPTANCE_PUBLIC_KEY:
          '-----BEGIN PUBLIC KEY-----\ninvalid\n-----END PUBLIC KEY-----\n',
      },
      'INVALID_PUBLIC_KEY',
    ],
    [
      'missing deadline',
      { RUNTIME_ACCEPTANCE_JOB_STARTED_MS: '' },
      'INVALID_JOB_TIMESTAMP',
    ],
    [
      'expired deadline',
      { RUNTIME_ACCEPTANCE_JOB_STARTED_MS: '1' },
      'INVALID_JOB_TIMESTAMP',
    ],
  ])
    test(`actual ${group} preflight rejects ${scenario} before state or output`, async (t) => {
      const { options, env } = await preflightFixture(t);
      const output = path.join(options.repo, 'cli.output');
      const result = actualCli(
        'preflight',
        { ...options, group },
        { ...env, ...amendment, GITHUB_OUTPUT: output },
      );
      assertCliFailure(result, code);
      await assert.rejects(lstat(options.state));
      await assert.rejects(lstat(output));
    });
  test(`actual ${group} preflight rejects wrong checkout before state or output`, async (t) => {
    const { options, env } = await preflightFixture(t);
    const output = path.join(options.repo, 'cli.output');
    const linux24 =
      process.platform === 'linux' && /^v24\./.test(process.version);
    assertCliFailure(
      actualCli(
        'preflight',
        {
          ...options,
          group,
          ...(group === 'dataset-diagnostic'
            ? { 'control-sha': CONTROL }
            : { 'candidate-sha': SHA }),
        },
        { ...env, GITHUB_OUTPUT: output },
      ),
      linux24 ? 'CHECKOUT_MISMATCH' : 'HOST_PREREQUISITE',
    );
    await assert.rejects(lstat(options.state));
    await assert.rejects(lstat(output));
  });
  test(`actual ${group} prepared identity seals only encrypted preparation failure`, async (t) => {
    const { value, options, env } = await stateFixture(t);
    Object.assign(value, { group, ...validateTiming(group, Date.now()) });
    await persistFixtureIdentity(value);
    const output = path.join(value.repo, 'cli.output');
    const result = actualCli('seal', options, {
      ...env,
      GITHUB_OUTPUT: output,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /runtime-acceptance failed/);
    assert.doesNotMatch(result.stdout, /prepared|passed|result=passed/);
    const receipt = JSON.parse(
      await readFile(path.join(value.state, 'public/receipt.json'), 'utf8'),
    );
    const envelope = JSON.parse(
      await readFile(
        path.join(value.state, 'public/evidence.encrypted.json'),
        'utf8',
      ),
    );
    assert.equal(receipt.group, group);
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.cleanup, false);
    const plaintext = decrypt(envelope);
    assert.equal(plaintext.outcome.group, group);
    assert.deepEqual(plaintext.outcome.failures, [
      { stage: 'preparation', code: 'PREPARATION_INCOMPLETE' },
    ]);
    assert.equal(plaintext.outcome.status, 'failed');
    await assert.rejects(lstat(output));
    const before = await snapshotState(value.state);
    const cached = actualCli('seal', options, env);
    assert.equal(cached.status, 1);
    assert.match(cached.stdout, /runtime-acceptance failed/);
    assert.deepEqual(await snapshotState(value.state), before);
  });
  for (const phase of ['prepared', 'finished', 'sealed'])
    test(`actual ${group} rejects another qualified group's ${phase} saved identity`, async (t) => {
      const { value, options, env } = await stateFixture(t);
      const savedGroup =
        group === 'dataset-diagnostic' ? 'final' : 'dataset-diagnostic';
      Object.assign(value, {
        group: savedGroup,
        phase,
        ...validateTiming(savedGroup, Date.now()),
      });
      await persistFixtureIdentity(value);
      const before = await snapshotState(value.state);
      assertCliFailure(actualCli(group, options, env), 'GROUP_MISMATCH');
      assert.deepEqual(await snapshotState(value.state), before);
    });
}
for (const group of ['visual-isolation', 'visual-connected'])
  test(`actual ${group} source-only preflight creates private preparation without starting runtime`, async (t) => {
    const { options, env } = await preflightFixture(t);
    const output = path.join(options.repo, 'cli.output');
    const result = actualCli(
      'preflight',
      { ...options, group },
      { ...env, GITHUB_OUTPUT: output },
    );
    if (process.platform !== 'linux' || !/^v24\./.test(process.version)) {
      assertCliFailure(result, 'HOST_PREREQUISITE');
      await assert.rejects(lstat(options.state));
      await assert.rejects(lstat(output));
      return;
    }
    assert.ifError(result.error);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /runtime-acceptance prepared/);
    assert.equal(await readFile(output, 'utf8'), 'prepared=true\n');
    const identity = JSON.parse(
      await readFile(path.join(options.state, 'identity.json'), 'utf8'),
    );
    assert.equal(identity.group, group);
    assert.equal(identity.phase, 'prepared');
    assert.deepEqual(identity.resources, { databases: [], containers: [] });
    assert.deepEqual(identity.evidence, []);
    assert.equal((await lstat(options.state)).mode & 0o777, 0o700);
    const sealed = actualCli('seal', options, {
      ...env,
      GITHUB_OUTPUT: output,
    });
    assert.equal(sealed.status, 1);
    assert.match(sealed.stdout, /runtime-acceptance failed/);
    assert.doesNotMatch(await readFile(output, 'utf8'), /result=passed/);
  });

for (const group of ['final', 'agent-production', 'brand-acceptance'])
  test(`actual ${group} preflight requires exact frozen source before private state`, async (t) => {
    const { options, env } = await preflightFixture(t);
    const contract = ownerContract();
    contract.brand = structuredClone(BRAND_SOURCE_CONTRACT.brand);
    const output = path.join(options.repo, 'cli.output');
    const linux24 =
      process.platform === 'linux' && /^v24\./.test(process.version);
    assertCliFailure(
      actualCli(
        'preflight',
        { ...options, group },
        {
          ...env,
          GITHUB_OUTPUT: output,
          RUNTIME_ACCEPTANCE_OWNER_CONTRACT: JSON.stringify(contract),
        },
      ),
      linux24 ? 'CONTROL_FAILED' : 'HOST_PREREQUISITE',
    );
    await assert.rejects(lstat(options.state));
    await assert.rejects(lstat(output));
  });
for (const group of ['final', 'agent-production', 'brand-acceptance'])
  test(`actual ${group} preflight rejects changed frozen bytes before private state`, async (t) => {
    const { options, env } = await preflightFixture(t);
    const contract = ownerContract();
    contract.brand = structuredClone(BRAND_SOURCE_CONTRACT.brand);
    const entry =
      group === 'final'
        ? BASELINE_SOURCE_CONTRACT.sourceInputs[0]
        : group === 'agent-production'
          ? AGENT_PRODUCTION_FILES[0]
          : BRAND_SOURCE_CONTRACT.brand;
    const file = path.join(options.repo, entry.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, 'changed frozen owner bytes');
    const output = path.join(options.repo, 'cli.output');
    const linux24 =
      process.platform === 'linux' && /^v24\./.test(process.version);
    assertCliFailure(
      actualCli(
        'preflight',
        { ...options, group },
        {
          ...env,
          GITHUB_OUTPUT: output,
          RUNTIME_ACCEPTANCE_OWNER_CONTRACT: JSON.stringify(contract),
        },
      ),
      linux24 ? 'SOURCE_HASH_MISMATCH' : 'HOST_PREREQUISITE',
    );
    await assert.rejects(lstat(options.state));
    await assert.rejects(lstat(output));
  });
for (const group of QUALIFIED_GROUPS)
  test(`actual ${group} same-group finished documents preserve outcome validation`, async (t) => {
    const { value, options, env } = await stateFixture(t);
    Object.assign(value, {
      group,
      phase: 'finished',
      ...validateTiming(group, Date.now()),
    });
    await persistFixtureIdentity(value);
    const outcome = {
      ...value,
      status: 'failed',
      completed: [],
      failures: [],
      cleanup: { passed: false },
      commands: [],
    };
    await writeFile(
      path.join(value.state, 'outcome.json'),
      JSON.stringify(outcome),
      { mode: 0o600 },
    );
    await writeFile(
      path.join(value.state, 'receipt.json'),
      JSON.stringify(outcome),
      { mode: 0o600 },
    );
    const before = await snapshotState(value.state);
    assertCliFailure(actualCli('seal', options, env), 'FAILED_SUCCESS_RECEIPT');
    assert.deepEqual(await snapshotState(value.state), before);
    await rm(path.join(value.state, 'receipt.json'));
    const result = actualCli('seal', options, env);
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /runtime-acceptance failed/);
    assert.equal(
      JSON.parse(
        await readFile(path.join(value.state, 'public/receipt.json'), 'utf8'),
      ).status,
      'failed',
    );
  });
for (const [field, replacement, code] of [
  ['candidateSHA', 'e'.repeat(40), 'STATE_IDENTITY_MISMATCH'],
  ['controlSHA', 'e'.repeat(40), 'STATE_IDENTITY_MISMATCH'],
  ['fingerprint', 'e'.repeat(64), 'STATE_IDENTITY_MISMATCH'],
  ['inode', -1, 'STATE_IDENTITY_MISMATCH'],
  ['state', '/not-the-owned-private-state', 'STATE_IDENTITY_MISMATCH'],
  ['overallDeadline', 1, 'STATE_DEADLINE_MISMATCH'],
])
  test(`actual saved ${field} mismatch rejects sealing without mutation`, async (t) => {
    const { value, options, env } = await stateFixture(t);
    value[field] = replacement;
    await persistFixtureIdentity(value, options.state);
    const before = await snapshotState(options.state);
    assertCliFailure(actualCli('seal', options, env), code);
    assert.deepEqual(await snapshotState(options.state), before);
  });

for (const phase of ['prepared', 'finished', 'sealed'])
  for (const relative of [
    'outcome.json',
    'receipt.json',
    'public/receipt.json',
    ...(phase === 'sealed' ? ['public/evidence.encrypted.json'] : []),
  ])
    test(`actual ${phase} seal rejects another qualified group in ${relative} without mutation`, async (t) => {
      const { value, options, env } = await stateFixture(t);
      value.phase = phase;
      const document = {
        version: 1,
        group: 'final',
        candidateSHA: value.candidateSHA,
        controlSHA: value.controlSHA,
        fingerprint: value.fingerprint,
        status: 'passed',
      };
      const serialized = JSON.stringify(document);
      if (relative === 'public/evidence.encrypted.json')
        value.envelopeHash = createHash('sha256')
          .update(serialized)
          .digest('hex');
      await persistFixtureIdentity(value);
      await mkdir(path.dirname(path.join(value.state, relative)), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(path.join(value.state, relative), serialized, {
        mode: 0o600,
      });
      const output = path.join(value.repo, 'cli.output');
      const before = await snapshotState(value.state);
      assertCliFailure(
        actualCli('seal', options, { ...env, GITHUB_OUTPUT: output }),
        'QUALIFIED_RECEIPT_IDENTITY_MISMATCH',
      );
      assert.deepEqual(await snapshotState(value.state), before);
      await assert.rejects(lstat(output));
    });
test('actual CLI ignores environment attempts to qualify an unknown group', async (t) => {
  const { value, options, env } = await stateFixture(t);
  await writeFile(
    path.join(value.state, 'outcome.json'),
    JSON.stringify({ ...value, group: 'unknown-group' }),
    { mode: 0o600 },
  );
  const before = await snapshotState(value.state);
  assertUnqualifiedCli(
    actualCli('seal', options, {
      ...env,
      RUNTIME_ACCEPTANCE_QUALIFIED_GROUPS: 'unknown-group',
    }),
  );
  assert.deepEqual(await snapshotState(value.state), before);
  for (const command of ['preflight', 'unknown-group']) {
    const result = actualCli(
      command,
      { ...options, group: 'unknown-group' },
      { ...env, RUNTIME_ACCEPTANCE_QUALIFIED_GROUPS: 'unknown-group' },
    );
    assertCliFailure(
      result,
      command === 'preflight' ? 'INVALID_GROUP' : 'INVALID_COMMAND',
    );
  }
});

test('actual dataset preflight remains qualified and preparation-only seal retains failure', async (t) => {
  const { options, env } = await preflightFixture(t);
  const output = path.join(options.repo, 'cli.output');
  const testEnv = { ...env, GITHUB_OUTPUT: output };
  const prepared = actualCli('preflight', options, testEnv);
  assert.ifError(prepared.error);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.match(await readFile(output, 'utf8'), /prepared=true/);
  delete testEnv.RUNTIME_ACCEPTANCE_POSTGRES_USER;
  delete testEnv.RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD;
  const sealed = actualCli('seal', options, testEnv);
  assert.ifError(sealed.error);
  assert.equal(sealed.status, 1);
  assert.match(sealed.stdout, /runtime-acceptance failed/);
  assert.doesNotMatch(
    sealed.stderr,
    /UNQUALIFIED_RUNTIME_GROUP|POSTGRES_CREDENTIALS_REQUIRED|INVALID_POSTGRES_CREDENTIALS/,
  );
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

test('explicit PostgreSQL credentials reject defaults, unsafe spelling and mismatches', () => {
  const credentials = fixtureCredentials();
  assert.deepEqual(
    readPostgresCredentials(credentialEnv(credentials)),
    credentials,
  );
  const url = databaseUrl('owned_test', credentials);
  assert.equal(
    validateUrl(url, 'postgres', 'owned_test', credentials).password,
    credentials.password,
  );
  const env = credentialEnv(credentials);
  const bad = [
    {},
    { PGUSER: credentials.username, PGPASSWORD: credentials.password },
  ];
  for (const field of Object.keys(env))
    for (const value of [undefined, '', null, 42])
      bad.push({ ...env, [field]: value });
  bad.push({ ...env, RUNTIME_ACCEPTANCE_POSTGRES_USER: 'other' });
  for (const password of [
    credentials.password.slice(0, 11),
    credentials.password.repeat(3),
    ...['!', '%', ' ', '\n', '\0'].map((char) => credentials.password + char),
  ])
    bad.push({ ...env, RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD: password });
  for (const value of bad)
    assert.throws(
      () => readPostgresCredentials(value),
      (error) => {
        assert.match(
          error.code,
          /^(?:POSTGRES_CREDENTIALS_REQUIRED|INVALID_POSTGRES_CREDENTIALS)$/,
        );
        assert.ok(!error.message.includes(credentials.password));
        return true;
      },
    );
  assert.throws(() =>
    validateUrl(url, 'postgres', 'owned_test', fixtureCredentials()),
  );
  assert.throws(() => validateUrl(url, 'postgres', 'owned_test'));
  for (const mutate of [
    (value) => {
      value.password = '%zz';
    },
    (value) => {
      value.password = `%${credentials.password.charCodeAt(0).toString(16)}${credentials.password.slice(1)}`;
    },
    (value) => {
      value.username = '%67enfeed';
    },
  ])
    assert.throws(() =>
      validateUrl(
        postgresFixtureUrl(credentials, mutate),
        'postgres',
        'owned_test',
        credentials,
      ),
    );
});
test('actual PostgreSQL invocation forwards password only through its specific child environment', () => {
  const credentials = fixtureCredentials();
  const id = 'a'.repeat(64);
  const invocation = postgresClientInvocation(
    id,
    ['-d', 'owned_test', '-tAc', 'SELECT 1'],
    credentials,
  );
  assert.deepEqual(invocation.args, [
    'exec',
    '--env',
    'PGPASSWORD',
    id,
    'psql',
    '-U',
    credentials.username,
    '-d',
    'owned_test',
    '-tAc',
    'SELECT 1',
  ]);
  assert.deepEqual(invocation.env, { PGPASSWORD: credentials.password });
  assert.ok(
    !invocation.args.some((value) => value.includes(credentials.password)),
  );
  assert.throws(() => postgresClientInvocation('unowned', [], credentials));
});
test('actual dataset preflight rejects missing credentials before state or prepared output', async (t) => {
  for (const [field, value] of [
    ['RUNTIME_ACCEPTANCE_POSTGRES_USER', undefined],
    ['RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD', undefined],
    ['RUNTIME_ACCEPTANCE_POSTGRES_USER', ''],
    ['RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD', ''],
    ['RUNTIME_ACCEPTANCE_POSTGRES_USER', 'other'],
  ]) {
    const { options, env } = await preflightFixture(t);
    const output = path.join(options.repo, 'denied.output');
    const childEnv = { ...env, GITHUB_OUTPUT: output, [field]: value };
    const result = actualCli('preflight', options, childEnv);
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /POSTGRES_CREDENTIALS_REQUIRED|INVALID_POSTGRES_CREDENTIALS/,
    );
    assert.doesNotMatch(result.stdout, /prepared|passed/);
    await assert.rejects(lstat(options.state), { code: 'ENOENT' });
    await assert.rejects(lstat(output), { code: 'ENOENT' });
  }
});

test('actual dataset execution rejects missing credentials before prepared identity mutation', async (t) => {
  const { options, env } = await preflightFixture(t);
  await createState(options, env);
  const before = await snapshotState(options.state);
  const childEnv = { ...env };
  delete childEnv.RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD;
  const result = actualCli('dataset-diagnostic', options, childEnv);
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /POSTGRES_CREDENTIALS_REQUIRED/);
  assert.deepEqual(await snapshotState(options.state), before);
});
async function isolationEvidenceFixture(t, status) {
  const { value, env } = await stateFixture(t);
  Object.assign(value, {
    group: 'visual-isolation',
    ...validateTiming('visual-isolation', Date.now()),
    phase: 'finished',
  });
  const directory = path.join(value.state, 'raw/isolation/nested');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const expected = {
    'raw/isolation/nested/render.mp4': Buffer.from('synthetic MP4 bytes'),
    'raw/isolation/nested/still.png': Buffer.from('synthetic still bytes'),
    'raw/isolation/evidence.json': Buffer.from('{"proof":"synthetic receipt"}'),
  };
  for (const [relative, bytes] of Object.entries(expected))
    await writeFile(path.join(value.state, relative), bytes, { mode: 0o644 });
  const outcome = {
    version: 1,
    candidateSHA: value.candidateSHA,
    controlSHA: value.controlSHA,
    group: value.group,
    fingerprint: value.fingerprint,
    status,
    completed: [{ stage: 'visual-protocol' }, { stage: 'visual-isolation' }],
    failures:
      status === 'failed'
        ? [{ stage: 'visual-isolation', code: 'CHILD_FAILED' }]
        : [],
    cleanup: { passed: true, operations: [] },
    commands: [{ elapsedMs: 1 }],
  };
  await writeFile(
    path.join(value.state, 'outcome.json'),
    JSON.stringify(outcome),
    { mode: 0o600 },
  );
  if (status === 'passed')
    await writeFile(
      path.join(value.state, 'receipt.json'),
      JSON.stringify(outcome),
      { mode: 0o600 },
    );
  return { value, env, expected };
}

for (const status of ['passed', 'failed'])
  test(`actual isolation collector retains ${status} media in encrypted evidence`, async (t) => {
    const { value, env, expected } = await isolationEvidenceFixture(t, status);
    assert.deepEqual(value.evidence, []);
    assert.equal(await collectIsolationEvidence(value), 3);
    assert.equal(await collectIsolationEvidence(value), 3);
    assert.equal(value.evidence.length, 3);
    const receipt = await sealState(value, env);
    assert.equal(receipt.status, status);
    const payload = decrypt(
      JSON.parse(
        await readFile(
          path.join(value.state, 'public/evidence.encrypted.json'),
        ),
      ),
    );
    assert.equal(payload.outcome.status, status);
    if (status === 'failed') {
      assert.equal(payload.receipt, undefined);
      assert.equal(payload.outcome.failures[0].code, 'CHILD_FAILED');
    }
    for (const [relative, bytes] of Object.entries(expected))
      assert.deepEqual(
        Buffer.from(
          payload.files.find((file) => file.path === relative).bytes,
          'base64',
        ),
        bytes,
      );
  });

for (const kind of ['file', 'directory'])
  test(`isolation collector refuses symlink ${kind} without reading its target`, async (t) => {
    const { value } = await isolationEvidenceFixture(t, 'failed');
    const target =
      kind === 'file'
        ? path.join(value.state, 'outcome.json')
        : path.join(value.state, 'public-target');
    if (kind === 'directory') await mkdir(target, { mode: 0o700 });
    const relative = `raw/isolation/unsafe-${kind}`;
    await symlink(target, path.join(value.state, relative));
    await assert.rejects(collectIsolationEvidence(value));
    assert.ok(!value.evidence.includes(relative));
  });

test('fixed visual selection requires each exact real title and pending exclusions', () => {
  assert.equal(VISUAL_CASES.length, 5);
  assert.equal(VISUAL_RENDERLESS_TITLES.length, 6);
  for (const index of [0, 1, 2, 3, 4, 5]) {
    const selection = visualSelection(index);
    const titles = [...selection.titles, ...selection.skipped];
    assert.equal(titles.length, 11);
    assert.equal(new Set(titles).size, 11);
    const assertions = titles.map((title) =>
      assertion(title, selection.titles.includes(title) ? 'passed' : 'pending'),
    );
    const fixture = report(assertions, `/fixture/${selection.file}`);
    assert.equal(
      validateVisualSelection(fixture, index, child)[0].passed,
      index === 0 ? 6 : 1,
    );
    for (const title of selection.titles)
      assert.ok(new RegExp(selection.pattern).test(title));
    for (const title of selection.skipped)
      assert.ok(!new RegExp(selection.pattern).test(title));
    for (const status of ['pending', 'skipped', 'failed', 'todo']) {
      const changed = structuredClone(fixture);
      changed.testResults[0].assertionResults[0].status = status;
      assert.throws(() => validateVisualSelection(changed, index, child));
    }
    const wrong = structuredClone(fixture);
    wrong.testResults[0].assertionResults.at(-1).status = 'passed';
    assert.throws(() => validateVisualSelection(wrong, index, child));
    const skipped = structuredClone(fixture);
    skipped.testResults[0].assertionResults.at(-1).status = 'skipped';
    assert.throws(() => validateVisualSelection(skipped, index, child));
  }
});
const tapSummary = (values = {}) =>
  Object.entries({
    tests: 3,
    pass: 3,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    ...values,
  })
    .map(([key, value]) => `# ${key} ${value}`)
    .join('\n');
test('actual TAP totals require complete unique nonzero unskipped original success', () => {
  assert.deepEqual(parseProtocolTotals(tapSummary(), child), {
    tests: 3,
    pass: 3,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  });
  for (const output of [
    tapSummary({ tests: 0, pass: 0 }),
    tapSummary({ tests: 3, pass: 0, skipped: 3 }),
    tapSummary({ todo: 1 }),
    tapSummary({ cancelled: 1 }),
    tapSummary({ fail: 1 }),
    tapSummary({ tests: 4 }),
    tapSummary({ tests: 'NaN' }),
    tapSummary({ tests: '9007199254740992' }),
    tapSummary().replace('# todo 0', ''),
    `${tapSummary()}\n# tests 3`,
    tapSummary().replace('# pass 3', '# pass -1'),
  ])
    assert.throws(() => parseProtocolTotals(output, child));
  for (const failure of [
    { exitCode: 1 },
    { signal: 'SIGTERM' },
    { timedOut: true },
    { outputLimit: true },
    { streamError: true },
  ])
    assert.throws(() =>
      parseProtocolTotals(tapSummary(), { ...child, ...failure }),
    );
});
test('renderer deletion names require exact private manifest hash ownership', () => {
  const id = randomBytes(20).toString('hex');
  const name = `visual-code-${createHash('sha256').update(id).digest('hex').slice(0, 40)}`;
  assert.deepEqual(
    rendererContainerNames([{ filename: `${name}.json`, receipt: { id } }]),
    [name],
  );
  for (const entries of [
    [{ filename: 'visual-code-other.json', receipt: { id } }],
    [{ filename: `${name}.json`, receipt: { id: '' } }],
    [
      { filename: `${name}.json`, receipt: { id } },
      { filename: `${name}.json`, receipt: { id } },
    ],
  ])
    assert.throws(() => rendererContainerNames(entries));
});
async function supervisorFixture(
  t,
  { marker = true, failCleanup = false, grandchild = false } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), 'visual-supervisor-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  let handle;
  let ledgerSaved;
  const adapters = {
    cancelled: () => false,
    persist: async (ledger) => {
      ledgerSaved = structuredClone(ledger);
      await writeFile(path.join(root, 'ledger.json'), JSON.stringify(ledger), {
        mode: 0o600,
      });
    },
    allocate: async (ledger) => {
      ledger.resources.redis = { id: randomBytes(32).toString('hex') };
      ledger.resources.database = { name: `owned_${ledger.index}_test` };
    },
    startChild: async () => {
      const code = grandchild
        ? `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},100)'],{stdio:'ignore'});process.on('SIGTERM',()=>c.kill('SIGKILL'));c.on('exit',()=>{});process.stdout.write('ready\\n');setInterval(()=>{},100)`
        : 'setInterval(()=>{},100)';
      handle = await startVisualProcess({
        executable: process.execPath,
        args: ['-e', code],
        cwd: root,
        env: process.env,
        stdoutPath: path.join(root, 'stdout'),
        stderrPath: path.join(root, 'stderr'),
      });
      return handle;
    },
    marker: async () => {
      if (!marker) return null;
      if (
        grandchild &&
        !(await readFile(path.join(root, 'stdout'), 'utf8')).includes('ready')
      )
        return null;
      return { outcome: 'failed', label: 'before-cleanup' };
    },
    stopGroups: async (_ledger, limits) => {
      calls.push('process-groups');
      await stopVisualGroups([handle?.pid], limits);
    },
    removeRenderers: async () => {
      calls.push('renderer-containers');
      if (failCleanup) throw new Error('synthetic refused ownership');
    },
    removeRedis: async (ledger) => {
      calls.push(`redis:${ledger.resources.redis.id}`);
    },
    removeDatabase: async (ledger) => {
      calls.push(`database:${ledger.resources.database.name}`);
    },
    verifyListeners: async () => {
      calls.push('listeners');
    },
    validate: async () => {
      throw new Error('original failed assertion');
    },
  };
  t.after(async () => {
    if (handle)
      await stopVisualGroups([handle.pid], {
        term: 100,
        kill: 1000,
        deadline: Date.now() + 2000,
      });
  });
  const limits = {
    work: 1000,
    cleanup: 3000,
    cooperative: 100,
    term: 200,
    kill: 1000,
    resources: 1000,
    final: 200,
    poll: 20,
  };
  return { adapters, limits, calls, root, saved: () => ledgerSaved };
}
test('actual visual supervisor terminates child and grandchild after early cleanup marker', async (t) => {
  const fixture = await supervisorFixture(t, { grandchild: true });
  const ledger = await superviseVisualCase({
    caseInfo: VISUAL_CASES[0],
    adapters: fixture.adapters,
    limits: fixture.limits,
  });
  assert.equal(ledger.status, 'failed');
  assert.equal(ledger.cleanupConfirmed, true);
  assert.ok(ledger.child.signal);
  assert.ok(ledger.failures.some((failure) => failure.stage === 'assertion'));
  assert.equal(fixture.saved().status, 'failed');
  assert.equal(fixture.calls.length, 5);
});
test('actual visual supervisor enters owned cleanup at work timeout without queue-prefix evidence', async (t) => {
  const fixture = await supervisorFixture(t, { marker: false });
  const ledger = await superviseVisualCase({
    caseInfo: VISUAL_CASES[1],
    adapters: fixture.adapters,
    limits: fixture.limits,
  });
  assert.equal(ledger.status, 'failed');
  assert.equal(ledger.cleanupConfirmed, true);
  assert.ok(
    ledger.failures.some((failure) => failure.code === 'VISUAL_WORK_TIMEOUT'),
  );
  assert.ok(fixture.calls.includes(`redis:${ledger.resources.redis.id}`));
  assert.equal(ledger.receipt, null);
});
test('cleanup refusal attempts later exact resources and prevents next real case', async (t) => {
  const fixture = await supervisorFixture(t, { failCleanup: true });
  let starts = 0;
  await assert.rejects(
    superviseVisualCases({
      adaptersFor: () => {
        starts++;
        return fixture.adapters;
      },
      limits: fixture.limits,
    }),
  );
  assert.equal(starts, 1);
  assert.equal(fixture.saved().status, 'failed');
  assert.equal(fixture.saved().cleanupConfirmed, false);
  assert.ok(fixture.calls.some((value) => value.startsWith('redis:')));
  assert.ok(fixture.calls.some((value) => value.startsWith('database:')));
  assert.ok(fixture.calls.includes('listeners'));
});

for (const status of ['passed', 'failed'])
  test(`actual connected collector seals ${status} partial media and ownership ledger`, async (t) => {
    const { value, env } = await stateFixture(t);
    Object.assign(value, {
      group: 'visual-connected',
      ...validateTiming('visual-connected', Date.now()),
      phase: 'finished',
    });
    const expected = {
      'raw/visual/artifacts/case-01/scenario/partial.mp4': Buffer.from(
        'partial render media',
      ),
      'raw/visual/renderers/case-01/visual-code-owned.result': Buffer.from(
        'renderer result bytes',
      ),
      'raw/visual/supervisor/case-01.json': Buffer.from(
        JSON.stringify({
          status,
          resources: { redis: { id: 'a'.repeat(64) } },
          cleanupConfirmed: status === 'passed',
        }),
      ),
    };
    for (const [relative, bytes] of Object.entries(expected)) {
      await mkdir(path.dirname(path.join(value.state, relative)), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(path.join(value.state, relative), bytes, { mode: 0o644 });
    }
    const outcome = {
      version: 1,
      candidateSHA: value.candidateSHA,
      controlSHA: value.controlSHA,
      group: value.group,
      fingerprint: value.fingerprint,
      status,
      commands: [],
      completed: [
        'visual-preparation',
        'visual-renderless',
        ...[1, 2, 3, 4, 5].map((index) => `visual-case-${index}`),
        'visual-library',
      ].map((stage) => ({ stage })),
      cleanup: { passed: status === 'passed' },
      failures: status === 'passed' ? [] : [{ code: 'VISUAL_WORK_TIMEOUT' }],
    };
    await writeFile(
      path.join(value.state, 'outcome.json'),
      JSON.stringify(outcome),
      { mode: 0o600 },
    );
    if (status === 'passed')
      await writeFile(
        path.join(value.state, 'receipt.json'),
        JSON.stringify(outcome),
        { mode: 0o600 },
      );
    assert.equal(await collectConnectedEvidence(value), 3);
    assert.equal(await collectConnectedEvidence(value), 3);
    assert.equal(value.evidence.length, 3);
    assert.equal((await sealState(value, env)).status, status);
    const payload = decrypt(
      JSON.parse(
        await readFile(
          path.join(value.state, 'public/evidence.encrypted.json'),
        ),
      ),
    );
    for (const [relative, bytes] of Object.entries(expected))
      assert.deepEqual(
        Buffer.from(
          payload.files.find((file) => file.path === relative).bytes,
          'base64',
        ),
        bytes,
      );
    assert.equal(payload.outcome.status, status);
    if (status === 'failed') assert.equal(payload.receipt, undefined);
  });
test('actual connected collector rejects symlink evidence without following target', async (t) => {
  const { value } = await stateFixture(t);
  value.group = 'visual-connected';
  const root = path.join(value.state, 'raw/visual/supervisor');
  await mkdir(root, { recursive: true, mode: 0o700 });
  await symlink(
    path.join(value.state, 'identity.json'),
    path.join(root, 'forged-ledger.json'),
  );
  await assert.rejects(collectConnectedEvidence(value));
  assert.ok(
    !value.evidence.includes('raw/visual/supervisor/forged-ledger.json'),
  );
});

function scenarioEvidence(index) {
  const sourceHash = createHash('sha256')
    .update('synthetic source')
    .digest('hex');
  const markers = [
    [
      'create-replay',
      'broker-redelivery',
      'immutable-revisions',
      'stale-concurrency',
    ],
    ['real-compile-failure', 'one-applied-repair'],
    ['two-repair-limit', 'no-output-admission'],
    ['quote-minus-cent-denied', 'tenant-and-brand-denied'],
    ['running-render-cancellation', 'once-only-settlement'],
  ][index - 1];
  const count = [2, 3].includes(index) ? 3 : 1;
  const receipts = [
    { kind: 'settlement', state: 'confirmed', operatorCredits: 0 },
  ];
  if (index === 2)
    receipts.push({
      kind: 'repair',
      isResultApplied: true,
      operatorCredits: 0,
    });
  if (index === 3) {
    for (let n = 0; n < 2; n++)
      receipts.push({
        kind: 'repair',
        isResultApplied: true,
        operatorCredits: 0,
      });
    for (let n = 0; n < 3; n++)
      receipts.push({ kind: 'inspection', operatorCredits: 0 });
  }
  const evidence = {
    outcome: 'passed',
    revisions: [
      {
        id: 'revision',
        sourceHash,
        status:
          index === 3 ? 'failed' : index === 5 ? 'cancelled' : 'completed',
        outputs: [],
        receipts,
        consumedCredits: 1,
        maximumCredits: 2,
      },
    ],
    rendererSubmissions: Array.from({ length: count }, (_, i) => ({
      id: `submission_${i}`,
      sourceHash,
    })),
    rendererReceipts: Array.from({ length: count }, (_, i) => ({
      id: `submission_${i}`,
      status:
        index === 5
          ? 'running'
          : index === 2 && i === 0
            ? 'failed'
            : 'completed',
    })),
    reservations: [
      { id: 'reservation', status: 'SETTLED', amount: 2, settledAmount: 1 },
    ],
    transactions: [
      { id: 'transaction', reservationId: 'reservation', amount: 1 },
      { id: 'seed_grant', reservationId: null, amount: 100 },
    ],
    wallets: [{ snapshot: { held: 0 } }],
    assertions: [...markers, 'settlement:revision', 'media-lineage:revision'],
  };
  if (index === 4) {
    evidence.revisions = [];
    evidence.rendererSubmissions = [];
    evidence.rendererReceipts = [];
    evidence.assertions = markers;
  }
  return evidence;
}
test('scenario receipt validates source, render, exact markers and settlement facts without inventing polling counts', () => {
  for (const index of [1, 2, 3, 4, 5]) {
    const evidence = scenarioEvidence(index);
    assert.ok(
      Array.isArray(
        validateVisualScenarioEvidence(evidence, VISUAL_CASES[index - 1]),
      ),
    );
    if (index !== 4) {
      evidence.rendererReceipts.push({ ...evidence.rendererReceipts[0] });
      validateVisualScenarioEvidence(evidence, VISUAL_CASES[index - 1]);
    }
  }
  const cancellation = scenarioEvidence(5);
  assert.ok(
    !cancellation.rendererReceipts.some((row) => row.status === 'cancelled'),
  );
  validateVisualScenarioEvidence(cancellation, VISUAL_CASES[4]);
  const refusal = scenarioEvidence(4);
  validateVisualScenarioEvidence(refusal, VISUAL_CASES[3]);
  const invalid = [
    [
      1,
      (value) => {
        value.assertions.shift();
      },
    ],
    [
      1,
      (value) => {
        value.revisions[0].sourceHash = 'bad';
      },
    ],
    ...[
      'revisions',
      'reservations',
      'rendererSubmissions',
      'rendererReceipts',
      'wallets',
    ].map((field) => [
      1,
      (value) => {
        value[field] = [];
      },
    ]),
    [
      1,
      (value) => {
        value.transactions[0].reservationId = 'unowned';
      },
    ],
    [
      1,
      (value) => {
        value.transactions.push({
          id: 'extra_debit',
          reservationId: 'reservation',
          amount: 1,
        });
      },
    ],
    [
      1,
      (value) => {
        value.transactions[0].amount = 2;
      },
    ],
    [
      1,
      (value) => {
        value.wallets[0].snapshot.held = 1;
      },
    ],
    [
      2,
      (value) => {
        value.rendererReceipts[0].status = 'completed';
      },
    ],
    [
      2,
      (value) => {
        value.rendererSubmissions.pop();
        value.rendererReceipts.pop();
      },
    ],
    [
      3,
      (value) => {
        value.revisions[0].outputs = [{}];
      },
    ],
    [
      4,
      (value) => {
        value.reservations[0].status = 'RESERVED';
      },
    ],
    [
      5,
      (value) => {
        value.rendererReceipts[0].status = 'completed';
      },
    ],
  ];
  for (const [index, mutate] of invalid) {
    const value = scenarioEvidence(index);
    mutate(value);
    assert.throws(() =>
      validateVisualScenarioEvidence(value, VISUAL_CASES[index - 1]),
    );
  }
});
test('actual scenario source verifier rejects missing, changed and unsafe retained source files', async (t) => {
  const { value } = await stateFixture(t);
  const directory = path.join(
    value.state,
    'raw/visual/artifacts/case-01/scenario',
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const evidence = {
    evidencePath: 'raw/visual/artifacts/case-01/scenario/evidence.json',
  };
  const sources = [
    {
      id: 'source',
      sourceHash: createHash('sha256').update('synthetic source').digest('hex'),
    },
  ];
  const file = path.join(directory, 'source.tsx');
  await assert.rejects(verifyVisualScenarioSources(value, evidence, sources));
  await writeFile(file, 'synthetic source', { mode: 0o600 });
  assert.equal(
    (await verifyVisualScenarioSources(value, evidence, sources))[0].sha256,
    sources[0].sourceHash,
  );
  await writeFile(file, 'changed source');
  await assert.rejects(verifyVisualScenarioSources(value, evidence, sources));
  await assert.rejects(
    verifyVisualScenarioSources(value, evidence, [
      { ...sources[0], id: '../escape' },
    ]),
  );
  await rm(file);
  await symlink(path.join(value.state, 'identity.json'), file);
  await assert.rejects(verifyVisualScenarioSources(value, evidence, sources));
});
test('Library supervision retains 120s work plus 60s total cleanup inside unchanged 180s', async (t) => {
  assert.equal(VISUAL_LIBRARY_LIMITS.work, 120000);
  assert.equal(VISUAL_LIBRARY_LIMITS.cleanup, 60000);
  assert.equal(
    VISUAL_LIBRARY_LIMITS.work + VISUAL_LIBRARY_LIMITS.cleanup,
    180000,
  );
  assert.equal(
    VISUAL_LIBRARY_LIMITS.cooperative +
      VISUAL_LIBRARY_LIMITS.term +
      VISUAL_LIBRARY_LIMITS.kill +
      VISUAL_LIBRARY_LIMITS.resources +
      VISUAL_LIBRARY_LIMITS.final,
    60000,
  );
  const fixture = await supervisorFixture(t);
  const end = Date.now() - 1;
  await assert.rejects(
    superviseVisualCase({
      caseInfo: VISUAL_CASES[0],
      adapters: fixture.adapters,
      limits: VISUAL_LIBRARY_LIMITS,
      cumulativeDeadline: end,
    }),
  );
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.saved(), undefined);
});

test('successful exact selected child preserves independent cleanup proof and unique case resources', async (t) => {
  const first = await supervisorFixture(t);
  const second = await supervisorFixture(t);
  const roots = [];
  for (const [index, fixture] of [
    [1, first],
    [2, second],
  ]) {
    const selection = visualSelection(index);
    fixture.adapters.startChild = async () =>
      startVisualProcess({
        executable: process.execPath,
        args: ['-e', 'process.exit(0)'],
        cwd: fixture.root,
        env: process.env,
        stdoutPath: path.join(fixture.root, 'success.stdout'),
        stderrPath: path.join(fixture.root, 'success.stderr'),
      });
    fixture.adapters.marker = async () => ({
      outcome: 'passed',
      label: 'before-cleanup',
    });
    fixture.adapters.stopGroups = async () => {
      fixture.calls.push('process-groups');
    };
    fixture.adapters.validate = async (_ledger, result) =>
      validateVisualSelection(
        report(
          [
            ...selection.titles.map((title) => assertion(title)),
            ...selection.skipped.map((title) => assertion(title, 'pending')),
          ],
          `/fixture/${selection.file}`,
        ),
        index,
        result,
      );
    const ledger = await superviseVisualCase({
      caseInfo: VISUAL_CASES[index - 1],
      adapters: fixture.adapters,
      limits: fixture.limits,
    });
    assert.equal(ledger.status, 'passed');
    assert.equal(ledger.cleanupConfirmed, true);
    assert.equal(ledger.child.exitCode, 0);
    assert.equal(ledger.cases[0].passed, 1);
    roots.push(ledger.resources.redis.id);
  }
  assert.notEqual(roots[0], roots[1]);
  assert.notEqual(first.root, second.root);
});

function journalSupervisorFixture(failAt, cleanupMs = 120000) {
  let now = 1000;
  let writes = 0;
  const calls = [];
  let last;
  const clock = { now: () => now, sleep: () => new Promise(() => {}) };
  const adapters = {
    cancelled: () => false,
    persist: (ledger) =>
      persistVisualJournal(ledger, async () => {
        writes++;
        last = ledger;
        if (writes === failAt)
          throw Object.assign(new Error('private synthetic disk error'), {
            code: 'EIO',
          });
      }),
    allocate: async (ledger) => {
      calls.push('allocate');
      ledger.resources.redis = { id: 'a'.repeat(64) };
      ledger.resources.database = { name: 'registered_test' };
      await adapters.persist(ledger);
    },
    startChild: async () => {
      calls.push('start');
      return { done: Promise.resolve({ ...child }) };
    },
    marker: async () => ({ outcome: 'passed' }),
    stopGroups: async () => {
      calls.push('groups');
      now += 10;
    },
    removeRenderers: async () => {
      calls.push('renderers');
      now += 10;
    },
    removeRedis: async () => {
      calls.push('redis');
      now += 10;
    },
    removeDatabase: async () => {
      calls.push('database');
      now += 10;
    },
    verifyListeners: async () => {
      calls.push('listeners');
      now += 10;
    },
    validate: async () => [{ passed: 1, skipped: 10 }],
  };
  const limits = {
    work: 900000,
    cleanup: cleanupMs,
    cooperative: 20000,
    term: 5000,
    kill: 5000,
    resources: cleanupMs === 60000 ? 30000 : 80000,
    final: 10000,
    poll: 100,
  };
  return {
    adapters,
    clock,
    limits,
    calls,
    last: () => last,
    writes: () => writes,
  };
}
test('initial actual visual journal rejection stops allocation before owned resources exist', async () => {
  const fixture = journalSupervisorFixture(1);
  await assert.rejects(
    superviseVisualCase({ caseInfo: VISUAL_CASES[0], ...fixture }),
    { code: 'VISUAL_JOURNAL_WRITE_FAILED' },
  );
  assert.deepEqual(fixture.calls, []);
  assert.equal(fixture.writes(), 1);
  assert.equal(fixture.last().journalFailed, true);
});
for (const cleanupMs of [120000, 60000])
  test(`failed durable acknowledgement still attempts every cleanup inside ${cleanupMs}ms`, async () => {
    const fixture = journalSupervisorFixture(2, cleanupMs);
    const ledger = await superviseVisualCase({
      caseInfo: VISUAL_CASES[0],
      ...fixture,
    });
    assert.deepEqual(fixture.calls, [
      'allocate',
      'groups',
      'renderers',
      'redis',
      'database',
      'listeners',
    ]);
    assert.equal(ledger.cleanupDeadline - ledger.cleanupStartedAt, cleanupMs);
    assert.equal(ledger.status, 'failed');
    assert.equal(ledger.cleanupConfirmed, false);
    assert.equal(ledger.journalFailed, true);
    assert.equal(
      ledger.failures.filter((failure) => failure.stage === 'journal').length,
      1,
    );
    assert.ok(
      ledger.failures.some(
        (failure) =>
          failure.stage === 'work' &&
          failure.code === 'VISUAL_JOURNAL_WRITE_FAILED',
      ),
    );
  });
test('final journal failure returns a failed ledger to aggregate and forbids another scenario', async () => {
  const fixture = journalSupervisorFixture(3);
  let starts = 0;
  let observed;
  // Keep a real clock here; the three injected writes settle immediately.
  await assert.rejects(
    superviseVisualCases({
      adaptersFor: () => {
        starts++;
        return fixture.adapters;
      },
      limits: fixture.limits,
      onCase: async (ledger) => {
        observed = ledger;
      },
    }),
    { code: 'VISUAL_CLEANUP_UNCONFIRMED' },
  );
  assert.equal(starts, 1);
  assert.equal(observed.status, 'failed');
  assert.equal(observed.cleanupConfirmed, false);
  assert.equal(observed.journalFailed, true);
  assert.equal(fixture.writes(), 3);
  assert.equal(observed.child.exitCode, 0);
});
test('normal actual durable journal path still requires original success and confirmed cleanup', async () => {
  const fixture = journalSupervisorFixture(-1);
  const ledger = await superviseVisualCase({
    caseInfo: VISUAL_CASES[0],
    ...fixture,
  });
  assert.equal(ledger.status, 'passed');
  assert.equal(ledger.cleanupConfirmed, true);
  assert.equal(ledger.journalFailed, undefined);
  assert.equal(fixture.writes(), 3);
});
for (const firstRemovalFails of [false, true])
  test(`actual validated renderer helper deletes before failed final journal (${firstRemovalFails})`, async () => {
    const ledger = { resources: {}, failures: [] };
    const resources = rendererContainerNames(
      ['first', 'second'].map((id) => ({
        filename: `visual-code-${createHash('sha256').update(id).digest('hex').slice(0, 40)}.json`,
        receipt: { id },
      })),
    ).map((name) => ({ name, removed: false }));
    const events = [];
    let writes = 0;
    await assert.rejects(
      removeValidatedVisualRenderers(
        ledger,
        resources,
        async (name) => {
          events.push(`remove:${name}`);
          if (firstRemovalFails && name === resources[0].name)
            throw new Error('original failed absence');
          events.push(`absent:${name}`);
          return 'a'.repeat(64);
        },
        async (value) => {
          events.push('write');
          writes++;
          await persistVisualJournal(value, async () => {
            throw Object.assign(new Error('synthetic full disk'), {
              code: 'ENOSPC',
            });
          });
        },
        Date.now() + 1000,
      ),
      {
        code: firstRemovalFails
          ? 'RENDERER_REMOVAL_UNCONFIRMED'
          : 'VISUAL_JOURNAL_WRITE_FAILED',
      },
    );
    assert.equal(writes, 1);
    assert.equal(events.at(-1), 'write');
    assert.ok(events.includes(`remove:${resources[1].name}`));
    assert.ok(events.includes(`absent:${resources[1].name}`));
    assert.equal(resources[1].removed, true);
    assert.equal(ledger.journalFailed, true);
    assert.equal(
      ledger.failures.filter((failure) => failure.stage === 'journal').length,
      1,
    );
    if (firstRemovalFails) {
      assert.equal(resources[0].removed, false);
      assert.ok(
        ledger.failures.some((failure) => failure.stage === 'renderer-removal'),
      );
    }
  });
test('expired renderer cleanup cannot launch another journal write or gain time', async () => {
  const ledger = { failures: [] };
  let removals = 0;
  let writes = 0;
  await assert.rejects(
    removeValidatedVisualRenderers(
      ledger,
      [{ name: `visual-code-${'a'.repeat(40)}` }],
      async () => {
        removals++;
      },
      async () => {
        writes++;
      },
      Date.now() - 1,
    ),
    { code: 'RENDERER_REMOVAL_UNCONFIRMED' },
  );
  assert.equal(removals, 0);
  assert.equal(writes, 0);
  assert.equal(ledger.journalFailed, true);
});
test('invalid manifest cannot reach actual deletion helper and later owned cleanup still runs', async () => {
  const fixture = journalSupervisorFixture(-1);
  let removals = 0;
  fixture.adapters.removeRenderers = async (ledger) => {
    const resources = rendererContainerNames([
      {
        filename: `visual-code-${'a'.repeat(40)}.json`,
        receipt: { id: 'mismatch' },
      },
    ]).map((name) => ({ name }));
    await removeValidatedVisualRenderers(
      ledger,
      resources,
      async () => {
        removals++;
      },
      fixture.adapters.persist,
      Date.now() + 1000,
    );
  };
  const ledger = await superviseVisualCase({
    caseInfo: VISUAL_CASES[0],
    ...fixture,
  });
  assert.equal(removals, 0);
  assert.ok(fixture.calls.includes('groups'));
  assert.ok(fixture.calls.includes('redis'));
  assert.ok(fixture.calls.includes('database'));
  assert.ok(fixture.calls.includes('listeners'));
  assert.equal(ledger.status, 'failed');
});

const focusedContracts = {
  'agent-production': {
    file: DELEGATED_API_FILES[0],
    titles: AGENT_PRODUCTION_TITLES,
    count: 6,
  },
  'brand-acceptance': {
    file: DELEGATED_API_FILES[1],
    titles: BRAND_SOURCE_CONTRACT.brand.passedTitles,
    count: 16,
  },
  'baseline-materialization-migration': {
    file: 'prisma/content-learning-baseline-materialization-migration.test.ts',
    titles: BASELINE_SOURCE_CONTRACT.passedTitles,
    count: 7,
  },
};
for (const [group, contract] of Object.entries(focusedContracts))
  test(`focused ${group} requires exact source-bound names, zero skips and original exit`, () => {
    const positive = report(
      contract.titles.map((title) => assertion(title)),
      `/fixture/${contract.file}`,
    );
    assert.equal(
      validateReport(positive, [contract], child)[0].passed,
      contract.count,
    );
    for (const modify of [
      (value) => value.testResults[0].assertionResults.pop(),
      (value) =>
        value.testResults[0].assertionResults.push(assertion('unknown case')),
      (value) =>
        value.testResults[0].assertionResults.push(
          value.testResults[0].assertionResults[0],
        ),
      (value) => {
        value.testResults[0].assertionResults[0].status = 'pending';
      },
      (value) => {
        value.testResults[0].name = '/fixture/unselected.spec.ts';
      },
    ]) {
      const negative = structuredClone(positive);
      modify(negative);
      assert.throws(() => validateReport(negative, [contract], child));
    }
    assert.throws(
      () => validateReport(positive, [contract], { ...child, exitCode: 1 }),
      { code: 'CHILD_FAILED' },
    );
    if (group === 'baseline-materialization-migration') {
      const sourceOnly = structuredClone(positive);
      sourceOnly.testResults[0].assertionResults.slice(2).forEach((value) => {
        value.status = 'pending';
      });
      assert.throws(() => validateReport(sourceOnly, [contract], child));
    }
  });
test('frozen source verification rejects absent, changed and symlinked bytes before allocation', async (t) => {
  const root = await fixture(t),
    name = 'fixture.ts',
    bytes = 'source fixture';
  const contract = [
    { path: name, sha256: createHash('sha256').update(bytes).digest('hex') },
  ];
  await assert.rejects(verifyFrozenSources(root, contract), { code: 'ENOENT' });
  await writeFile(path.join(root, name), bytes);
  await verifyFrozenSources(root, contract);
  await writeFile(path.join(root, name), 'changed');
  await assert.rejects(verifyFrozenSources(root, contract), {
    code: 'SOURCE_HASH_MISMATCH',
  });
  await rm(path.join(root, name));
  await writeFile(path.join(root, 'target.ts'), bytes);
  await symlink(path.join(root, 'target.ts'), path.join(root, name));
  await assert.rejects(verifyFrozenSources(root, contract), {
    code: 'UNSAFE_SOURCE',
  });
  await assert.rejects(verifyBaselineSources(root), { code: 'ENOENT' });
  await assert.rejects(verifyDedicatedSources(root, 'agent-production', {}), {
    code: 'ENOENT',
  });
  assert.equal(BASELINE_SOURCE_CONTRACT.sourceInputs.length, 3);
  assert.equal(BASELINE_SOURCE_CONTRACT.expectedPostgresCases, 5);
  assert.equal(AGENT_PRODUCTION_FILES.length, 2);
});
test('prepared owner revisions retain only the exact approved source hashes', () => {
  assert.equal(
    AGENT_PRODUCTION_FILES[0].sha256,
    'ca356d57acb604eaf18a15c56ab38d9328b32f08a2ebca42ab134be9d62e4e98',
  );
  assert.equal(
    AGENT_PRODUCTION_FILES[1].sha256,
    'e8d8910c10e33a2c34d7ff45df3cc1aaff1137ca9b78fc02678a7c276c1055c4',
  );
  assert.equal(
    BRAND_SOURCE_CONTRACT.unitFiles.find(
      (entry) =>
        entry.path ===
        'apps/server/api/src/services/branded-generation-receipts/branded-generation-receipts.service.spec.ts',
    )?.sha256,
    '30abc0d90142cb882e9e397d07d23b7221efef5937616b31b87772d807410f13',
  );
  assert.equal(
    BRAND_SOURCE_CONTRACT.unitFiles.find(
      (entry) =>
        entry.path ===
        'apps/server/api/src/services/branded-generation-receipts/branded-generation-recompile-codec.util.spec.ts',
    )?.sha256,
    '67ab6c33f3d30f80238dae5e1f3acfc2b9f175261c4a4e2120bbc605a1480f8b',
  );
  assert.equal(
    BRAND_SOURCE_CONTRACT.unitFiles.find(
      (entry) =>
        entry.path ===
        'apps/server/api/src/services/harness/branded-generation-compiler.spec.ts',
    )?.sha256,
    '401c51ddee2c6cea40ccc712988619be54686acd6f0909893bd05800813242a2',
  );
  assert.equal(
    BASELINE_SOURCE_CONTRACT.sourceInputs[0].sha256,
    'ad817a2ad7b8eba1cd6eb7d431b981dc908bc4509eaa4149e4b159fd75894887',
  );
  assert.equal(
    BRAND_SOURCE_CONTRACT.brand.sha256,
    '3d696f88f314892edbc8f0a05ca6fd702c92a0df7f84ea36f3e2bb5ae3222a4a',
  );
});
test('dedicated BRAND requires frozen integration hash and exact title inventory', () => {
  const value = ownerContract();
  value.brand = structuredClone(BRAND_SOURCE_CONTRACT.brand);
  assert.deepEqual(validateBrandOwnerContract(JSON.stringify(value)), value);
  for (const change of [
    (entry) => {
      entry.sha256 = 'e'.repeat(64);
    },
    (entry) => {
      entry.passedTitles[0] = 'unrelated';
    },
  ]) {
    const negative = structuredClone(value);
    change(negative.brand);
    assert.throws(() => validateBrandOwnerContract(JSON.stringify(negative)), {
      code: 'BRAND_SOURCE_CONTRACT_MISMATCH',
    });
  }
});
test('exclusive agent environment is provided only after exact DB migration and empty owned Redis proof', () => {
  const credentials = fixtureCredentials(),
    env = {
      ...credentialEnv(credentials),
      DATABASE_URL: 'unrelated',
      REDIS_URL: 'unrelated',
      PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB: '1',
    };
  const name = 'genfeed_agent_production_4959_test',
    url = databaseUrl(name, credentials),
    owned = {
      database: name,
      migrated: true,
      postgres: 'a'.repeat(64),
      redis: 'b'.repeat(64),
      redisEmpty: true,
    };
  const result = dedicatedChildEnvironment(
    env,
    'agent-production',
    url,
    'redis://127.0.0.1:6379/14',
    owned,
  );
  assert.equal(result.PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB, '1');
  assert.equal(result.DATABASE_URL, url);
  assert.equal(result.RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD, undefined);
  assert.equal(result.RUNTIME_ACCEPTANCE_POSTGRES_USER, undefined);
  for (const invalid of [
    { ...owned, migrated: false },
    { ...owned, redisEmpty: false },
    { ...owned, postgres: 'unknown' },
    { ...owned, database: 'test' },
  ])
    assert.throws(() =>
      dedicatedChildEnvironment(
        env,
        'agent-production',
        url,
        'redis://127.0.0.1:6379/14',
        invalid,
      ),
    );
  for (const invalid of [
    `${url}?schema=public`,
    url.replace('127.0.0.1', 'example.com'),
    databaseUrl('test', credentials),
  ])
    assert.throws(() =>
      dedicatedChildEnvironment(
        env,
        'agent-production',
        invalid,
        'redis://127.0.0.1:6379/14',
        owned,
      ),
    );
  const brand = dedicatedChildEnvironment(
    env,
    'brand-acceptance',
    databaseUrl('genfeed_branded_acceptance_test', credentials),
    'ignored',
    {
      database: 'genfeed_branded_acceptance_test',
      migrated: false,
      postgres: 'a'.repeat(64),
    },
  );
  assert.equal(brand.DATABASE_URL, undefined);
  assert.equal(brand.REDIS_URL, undefined);
  assert.equal(brand.PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB, undefined);
});
function dedicatedFixture(group) {
  const calls = [];
  let now = 1000,
    writes = 0;
  const value = { ...identity, group, startedAt: now };
  const clock = { now: () => now, sleep: () => new Promise(() => {}) };
  const adapters = {
    persist: async () => {
      calls.push('write');
      writes++;
    },
    cancelled: () => false,
    prepare: async (ledger, end) => {
      calls.push('prepare');
      ledger.resources.database = { name: 'owned_test' };
      if (group !== 'baseline-materialization-migration')
        ledger.resources.services = [
          { kind: 'postgres', id: 'a'.repeat(64) },
          ...(group === 'agent-production'
            ? [{ kind: 'redis', id: 'b'.repeat(64) }]
            : []),
        ];
      assert.equal(end, 1000 + DEDICATED_BUDGETS[group].setup);
      now += 10;
    },
    migrate: async () => {
      calls.push('migration');
      now += 10;
    },
    units: async (ledger) => {
      calls.push('units');
      ledger.unitCases = [{ passed: 1 }];
      now += 10;
    },
    startWork: async () => {
      calls.push('work');
      return { done: Promise.resolve({ ...child }) };
    },
    stopGroups: async () => {
      calls.push('groups');
      now += 1;
    },
    dropDatabase: async () => {
      calls.push('drop');
      now += 1;
    },
    removeService: async (_ledger, service) => {
      calls.push(service.kind);
      now += 1;
    },
    validate: async () => [
      { passed: focusedContracts[group].count, skipped: 0 },
    ],
  };
  return {
    identity: value,
    adapters,
    clock,
    calls,
    writes: () => writes,
    now: (value) => {
      now = value;
    },
  };
}
for (const group of Object.keys(focusedContracts))
  test(`actual dedicated supervisor ${group} retains fixed preparation/work/cleanup envelopes`, async () => {
    const fixture = dedicatedFixture(group),
      ledger = await superviseDedicatedAcceptance(fixture);
    assert.equal(ledger.status, 'passed');
    assert.equal(ledger.cleanupConfirmed, true);
    assert.ok(fixture.calls.indexOf('groups') < fixture.calls.indexOf('drop'));
    assert.ok(
      ledger.completed.some(
        (item) =>
          item.stage === group &&
          item.cases[0].passed === focusedContracts[group].count,
      ),
    );
    const limits = DEDICATED_BUDGETS[group];
    assert.ok(
      ledger.cleanupDeadline <= fixture.identity.startedAt + limits.cleanupEnd,
    );
    assert.equal(
      ledger.cleanupDeadline - ledger.cleanupStartedAt,
      limits.cleanup,
    );
    if (group === 'baseline-materialization-migration') {
      assert.equal(limits.workEnd, 45000);
      assert.equal(limits.cleanupEnd, 60000);
      assert.ok(!fixture.calls.includes('migration'));
    }
  });
test('strict initial dedicated journal rejects before allocation and stale anchor rejects before child', async () => {
  const value = dedicatedFixture('agent-production');
  value.adapters.persist = async () => {
    throw Object.assign(new Error('synthetic journal'), { code: 'EIO' });
  };
  await assert.rejects(superviseDedicatedAcceptance(value), { code: 'EIO' });
  assert.deepEqual(value.calls, []);
  const stale = dedicatedFixture('agent-production');
  stale.now(stale.identity.startedAt + 300000);
  const ledger = await superviseDedicatedAcceptance(stale);
  assert.equal(ledger.status, 'failed');
  assert.ok(!stale.calls.includes('work'));
});
for (const failStage of [
  'work',
  'groups',
  'drop',
  'postgres',
  'redis',
  'journal',
])
  test(`dedicated ${failStage} failure retains original status and attempts all owned cleanup`, async () => {
    const value = dedicatedFixture('agent-production');
    if (failStage === 'work')
      value.adapters.startWork = async () => ({
        done: Promise.resolve({ ...child, exitCode: 7 }),
      });
    if (failStage === 'groups')
      value.adapters.stopGroups = async () => {
        value.calls.push('groups');
        throw Object.assign(new Error('synthetic'), {
          code: 'TERMINATION_UNCONFIRMED',
        });
      };
    if (failStage === 'drop')
      value.adapters.dropDatabase = async () => {
        value.calls.push('drop');
        throw Object.assign(new Error('synthetic'), {
          code: 'DATABASE_REMOVAL_UNCONFIRMED',
        });
      };
    if (['postgres', 'redis'].includes(failStage))
      value.adapters.removeService = async (_ledger, service) => {
        value.calls.push(service.kind);
        if (service.kind === failStage) throw new Error('synthetic');
      };
    if (failStage === 'journal')
      value.adapters.persist = async (ledger) => {
        if (value.calls.includes('work')) {
          ledger.journalFailed = true;
          throw new Error('synthetic');
        }
      };
    const ledger = await superviseDedicatedAcceptance(value);
    assert.equal(ledger.status, 'failed');
    assert.ok(value.calls.includes('drop'));
    assert.ok(value.calls.includes('postgres'));
    assert.ok(value.calls.includes('redis'));
    if (failStage === 'work') assert.equal(ledger.originalChild.exitCode, 7);
  });
test('actual cleanup helper performs every physical removal before rejected journal writes', async () => {
  const ledger = { failures: [] },
    calls = [];
  for (const name of ['database', 'postgres', 'redis'])
    await assert.rejects(
      performDedicatedCleanup(
        ledger,
        async () => {
          calls.push(name);
        },
        async () => {
          calls.push('write');
          throw new Error('synthetic');
        },
        Date.now() + 1000,
      ),
      { code: 'DEDICATED_JOURNAL_WRITE_FAILED' },
    );
  assert.deepEqual(calls, [
    'database',
    'write',
    'postgres',
    'write',
    'redis',
    'write',
  ]);
  assert.equal(ledger.journalFailed, true);
  assert.equal(ledger.failures.length, 1);
});
test('bounded control helper handles readable errors without losing its child handle', async () => {
  const handle = startDedicatedControlProcess({
    executable: process.execPath,
    args: ['-e', 'setInterval(()=>{},1000)'],
    cwd: process.cwd(),
    env: process.env,
  });
  handle.child.stdout.emit('error', new Error('synthetic readable error'));
  const result = await handle.done;
  assert.equal(result.streamError, true);
  assert.notEqual(result.exitCode, 0);
  await stopVisualGroups([handle.pid], {
    term: 0,
    kill: 1000,
    deadline: Date.now() + 1500,
  });
});
test('dedicated work timeout supervises a real child/grandchild and waits all private streams before disposal', async (t) => {
  const directory = await fixture(t),
    value = dedicatedFixture('agent-production');
  let handle;
  value.adapters.startWork = async () => {
    handle = await startVisualProcess({
      executable: process.execPath,
      args: [
        '-e',
        `const {spawn}=require('node:child_process');spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});process.stdout.write('started');setInterval(()=>{},1000);`,
      ],
      cwd: directory,
      env: process.env,
      stdoutPath: path.join(directory, 'stdout'),
      stderrPath: path.join(directory, 'stderr'),
    });
    value.clock.sleep = (ms) =>
      new Promise((resolve) =>
        setTimeout(
          () => {
            value.now(1000 + DEDICATED_BUDGETS['agent-production'].workEnd);
            resolve();
          },
          Math.min(ms, 30),
        ),
      );
    return handle;
  };
  value.adapters.stopGroups = async (ledger) => {
    value.clock.sleep = () => new Promise(() => {});
    await stopVisualGroups([handle.pid], {
      term: 10,
      kill: 1000,
      deadline: Date.now() + 1200,
    });
    ledger.originalChild = await handle.done;
    value.calls.push('groups');
  };
  const ledger = await superviseDedicatedAcceptance(value);
  assert.equal(ledger.status, 'failed');
  assert.ok(
    ledger.failures.some((item) => item.code === 'DEDICATED_WORK_TIMEOUT'),
  );
  assert.ok(value.calls.includes('redis'));
  assert.ok(value.calls.indexOf('groups') < value.calls.indexOf('drop'));
  assert.ok(ledger.originalChild.signal);
  assert.equal(
    (await lstat(path.join(directory, 'stdout'))).mode & 0o777,
    0o600,
  );
});
function partitionFixture() {
  const apiRoot = '/fixture/apps/server/api',
    selected = [
      ...DELEGATED_API_FILES,
      'test/integration/ordinary.integration.spec.ts',
    ];
  return {
    apiRoot,
    summary: {
      tier: 'full',
      status: 'passed',
      vitestExitCode: 0,
      failedFileCount: 0,
      selectedFiles: selected,
      selectedFileCount: 3,
      executedFileCount: 1,
    },
    report: {
      success: true,
      testResults: [
        { name: path.join(apiRoot, selected[2]), status: 'passed' },
      ],
    },
  };
}
test('shared API partition delegates exactly two selected fixtures without manufacturing their passes', () => {
  const value = partitionFixture(),
    result = validateSharedApiFullPartition(
      value.summary,
      value.report,
      value.apiRoot,
    );
  assert.equal(result.executedFileCount, 1);
  assert.equal(result.selectedFileCount, 3);
  assert.deepEqual(
    result.delegatedFiles.map((entry) => entry.proof),
    ['REQUIRED', 'REQUIRED'],
  );
  for (const change of [
    (v) => {
      v.summary.selectedFiles.pop();
    },
    (v) => {
      v.summary.selectedFiles.push(v.summary.selectedFiles[0]);
      v.summary.selectedFileCount++;
    },
    (v) => {
      v.report.testResults.push({
        name: path.join(v.apiRoot, DELEGATED_API_FILES[0]),
        status: 'passed',
      });
    },
    (v) => {
      v.report.testResults[0].name = '/outside/spec.ts';
    },
    (v) => {
      v.report.testResults[0].status = 'pending';
    },
    (v) => {
      v.summary.vitestExitCode = 1;
    },
    (v) => {
      v.summary.executedFileCount = 3;
    },
  ]) {
    const negative = structuredClone(value);
    change(negative);
    assert.throws(
      () =>
        validateSharedApiFullPartition(
          negative.summary,
          negative.report,
          negative.apiRoot,
        ),
      { code: 'INVALID_FULL_PARTITION' },
    );
  }
});
function finalDatabaseFixture() {
  const calls = [],
    credentials = fixtureCredentials();
  return {
    calls,
    identity: {
      ...identity,
      group: 'final',
      resources: { postgres: 'a'.repeat(64), databases: [] },
    },
    adapters: {
      credentials,
      persist: async () => {
        calls.push('write');
      },
      absent: async () => {
        calls.push('absent');
        return '';
      },
      create: async () => {
        calls.push('create');
      },
      drop: async () => {
        calls.push('drop');
      },
    },
  };
}
test('final lost CREATE response stays eligible for exact owned disposal while preserving original failure', async () => {
  const value = finalDatabaseFixture(),
    error = Object.assign(new Error('lost response'), {
      code: 'PREPARATION_FAILED',
    });
  value.adapters.create = async () => {
    value.calls.push('create');
    throw error;
  };
  await assert.rejects(
    createFinalOwnedDatabase(
      value.identity,
      'genfeed_crun_test',
      value.adapters,
    ),
    (e) => e === error,
  );
  const resource = value.identity.resources.databases[0];
  assert.equal(resource.creationIssued, true);
  assert.equal(resource.created, false);
  await cleanupFinalOwnedDatabase(
    value.identity,
    resource,
    value.adapters,
    Date.now() + 1000,
  );
  assert.equal(resource.removed, true);
  assert.deepEqual(value.calls, [
    'absent',
    'write',
    'create',
    'drop',
    'absent',
    'write',
  ]);
  assert.equal(error.code, 'PREPARATION_FAILED');
});
for (const kind of ['preexisting', 'intent-write', 'ack-write'])
  test(`final ${kind} failure never invents ownership from registration alone`, async () => {
    const value = finalDatabaseFixture();
    let writes = 0;
    if (kind === 'preexisting') value.adapters.absent = async () => '1';
    else
      value.adapters.persist = async () => {
        if (++writes === (kind === 'intent-write' ? 1 : 2))
          throw new Error('synthetic journal');
      };
    await assert.rejects(
      createFinalOwnedDatabase(
        value.identity,
        'genfeed_crun_test',
        value.adapters,
      ),
    );
    for (const resource of value.identity.resources.databases)
      await cleanupFinalOwnedDatabase(
        value.identity,
        resource,
        { ...value.adapters, persist: async () => {} },
        Date.now() + 1000,
      );
    assert.equal(value.calls.includes('create'), kind === 'ack-write');
    assert.equal(value.calls.includes('drop'), kind === 'ack-write');
    await cleanupFinalOwnedDatabase(
      value.identity,
      { name: 'genfeed_crun_test', creationIntent: true, created: true },
      value.adapters,
      Date.now() + 1000,
    );
  });
test('final cleanup rejects wrong service, unknown absence, expired deadline and journal error after physical disposal', async () => {
  for (const kind of ['wrong-service', 'not-absent', 'expired', 'journal']) {
    const value = finalDatabaseFixture();
    await createFinalOwnedDatabase(
      value.identity,
      'genfeed_baseline_materialization_test',
      value.adapters,
    );
    const resource = value.identity.resources.databases[0];
    if (kind === 'wrong-service') resource.postgresId = 'b'.repeat(64);
    if (kind === 'not-absent') value.adapters.absent = async () => 'unknown';
    if (kind === 'journal')
      value.adapters.persist = async () => {
        throw new Error('synthetic journal');
      };
    await assert.rejects(
      cleanupFinalOwnedDatabase(
        value.identity,
        resource,
        value.adapters,
        Date.now() + (kind === 'expired' ? -1 : 1000),
      ),
    );
    assert.equal(
      value.calls.includes('drop'),
      kind === 'not-absent' || kind === 'journal',
    );
    assert.equal(resource.removed === true, kind === 'journal');
  }
});
async function crunCleanupFixture(t, mediaKind = 'image') {
  const uuid = randomUUID(),
    directory = `/tmp/crun-owned-${uuid}`,
    manifest = `/tmp/crun-run-${uuid}.json`,
    schema = `crun_flow_${randomBytes(16).toString('hex')}`,
    key = `crun:requests:${'a'.repeat(64)}`;
  await mkdir(directory, { mode: 0o700 });
  const content = {
    version: 1,
    schema,
    ownedDirectory: directory,
    redisKeys: [key],
  };
  await writeFile(manifest, JSON.stringify(content), { mode: 0o600 });
  await writeFile(`${manifest}.tmp`, 'uncommitted', { mode: 0o600 });
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
    await rm(manifest, { force: true });
    await rm(`${manifest}.tmp`, { force: true });
  });
  const resource = { mediaKind, uuid, directory, manifest };
  for (const [name, file] of [
    ['directory', directory],
    ['manifest', manifest],
  ]) {
    const metadata = await lstat(file);
    resource[`${name}Metadata`] = {
      device: metadata.dev,
      inode: metadata.ino,
      realpath: await realpath(file),
    };
  }
  const calls = [];
  const adapters = {
    save: async () => {
      calls.push('evidence');
    },
    dropSchema: async (value) => {
      assert.equal(value, schema);
      calls.push('schema');
    },
    schemaAbsent: async () => {
      calls.push('schema-absence');
      return '';
    },
    deleteKeys: async (values) => {
      assert.deepEqual(values, [key]);
      calls.push('redis');
    },
    keysAbsent: async () => {
      calls.push('keys-absence');
      return '0';
    },
  };
  await runFinalCrunBounded({
    identity: {
      ...identity,
      group: 'final',
      overallDeadline: Date.now() + 100000,
      resources: {
        crun: { image: null, video: null, [resource.mediaKind]: resource },
      },
    },
    mediaKind: resource.mediaKind,
    resource,
    start: async ({ onSpawn }) => {
      onSpawn(12345);
      return { pid: 12345, done: Promise.resolve({ ...child }) };
    },
    stop: async () => {},
    probe: () => {
      throw Object.assign(new Error('absent'), { code: 'ESRCH' });
    },
    persistProof: async () => {},
    cleanupOwned: async () => ({ passed: true, operations: [], failures: [] }),
  });
  assert.equal(hasFinalCrunTerminationProof(resource), true);
  return { resource, adapters, calls };
}
for (const mediaKind of ['image', 'video'])
  for (const kind of [
    'success',
    'evidence',
    'schema',
    'directory-replacement',
    'manifest-replacement',
    'invalid',
    'unterminated',
  ])
    test(`actual Crun ${mediaKind} cleanup ${kind} preserves ownership and independently disposes valid resources`, async (t) => {
      const value = await crunCleanupFixture(t, mediaKind),
        original = new Error('original fixture failure');
      if (kind === 'evidence')
        value.adapters.save = async () => {
          value.calls.push('evidence');
          throw Object.assign(new Error('disk'), { code: 'EIO' });
        };
      if (kind === 'schema')
        value.adapters.dropSchema = async () => {
          value.calls.push('schema');
          throw new Error('schema failure');
        };
      if (kind === 'directory-replacement') {
        const backup = `${value.resource.directory}.original`;
        await rename(value.resource.directory, backup);
        t.after(() => rm(backup, { recursive: true, force: true }));
        await mkdir(value.resource.directory, { mode: 0o700 });
      }
      if (kind === 'manifest-replacement')
        value.adapters.save = async () => {
          await writeFile(
            `${value.resource.manifest}.replacement`,
            'replacement',
            { mode: 0o600 },
          );
          await rename(
            `${value.resource.manifest}.replacement`,
            value.resource.manifest,
          );
        };
      if (kind === 'invalid')
        await writeFile(
          value.resource.manifest,
          JSON.stringify({
            version: 1,
            schema: 'public',
            ownedDirectory: value.resource.directory,
            redisKeys: [],
          }),
          { mode: 0o600 },
        );
      if (kind === 'unterminated') value.resource.terminationConfirmed = false;
      const result = await cleanupFinalCrunResources(
        value.resource,
        value.adapters,
        Date.now() + 2000,
      );
      assert.equal(result.passed, kind === 'success');
      assert.equal(original.message, 'original fixture failure');
      if (['invalid', 'unterminated'].includes(kind)) {
        assert.deepEqual(value.calls, []);
        assert.ok((await lstat(value.resource.directory)).isDirectory());
      } else {
        assert.ok(value.calls.includes('redis'));
        assert.ok(value.calls.includes('keys-absence'));
        if (kind === 'directory-replacement')
          assert.ok((await lstat(value.resource.directory)).isDirectory());
        else
          await assert.rejects(lstat(value.resource.directory), {
            code: 'ENOENT',
          });
        if (kind === 'manifest-replacement')
          assert.equal(
            await readFile(value.resource.manifest, 'utf8'),
            'replacement',
          );
        else
          await assert.rejects(lstat(value.resource.manifest), {
            code: 'ENOENT',
          });
        await assert.rejects(lstat(`${value.resource.manifest}.tmp`), {
          code: 'ENOENT',
        });
      }
    });

test('actual registered allocation helper distinguishes pre-spawn failure from post-spawn lost acknowledgement', async () => {
  for (const kind of ['pre-spawn', 'post-spawn', 'success']) {
    const ledger = {
        resources: {
          groups: [],
          database: {
            intentPersisted: true,
            creationAuthorized: false,
            creationIssued: false,
          },
        },
      },
      handles = [],
      handle = { pid: 12345, done: Promise.resolve({ ...child }) };
    const operation = startRegisteredDedicatedProcess(
      ledger,
      'database-allocation',
      async () => {
        if (kind === 'pre-spawn')
          throw Object.assign(new Error('file'), { code: 'EIO' });
        return handle;
      },
      (value) => handles.push(value),
      async () => {
        if (kind === 'post-spawn')
          throw Object.assign(new Error('journal'), { code: 'ENOSPC' });
      },
    );
    if (kind === 'success') assert.equal(await operation, handle);
    else await assert.rejects(operation);
    assert.equal(
      ledger.resources.database.creationIssued,
      kind !== 'pre-spawn',
    );
    assert.equal(
      ledger.resources.database.creationAuthorized,
      kind !== 'pre-spawn',
    );
    assert.equal(handles.length, kind === 'pre-spawn' ? 0 : 1);
    if (kind === 'post-spawn')
      assert.equal((await handles[0].done).exitCode, 0);
  }
});
test('baseline strict allocation intent rejects before spawn and failed cleanup keeps live final ownership', async () => {
  const value = dedicatedFixture('baseline-materialization-migration'),
    calls = [];
  await assert.rejects(
    startRegisteredDedicatedProcess(
      { resources: { database: { creationIntent: true }, groups: [] } },
      'database-allocation',
      async () => {
        calls.push('spawn');
        return { pid: 12345 };
      },
      () => {},
      async () => {},
    ),
    { code: 'DEDICATED_OWNERSHIP' },
  );
  assert.deepEqual(calls, []);
  value.adapters.prepare = async (ledger) => {
    ledger.resources.database = {
      name: 'genfeed_baseline_materialization_test',
      postgresId: 'a'.repeat(64),
      intentPersisted: true,
      creationIssued: true,
      creationAuthorized: true,
    };
  };
  value.adapters.dropDatabase = async () => {
    throw Object.assign(new Error('drop'), {
      code: 'DATABASE_REMOVAL_UNCONFIRMED',
    });
  };
  const ledger = await superviseDedicatedAcceptance(value);
  assert.equal(ledger.status, 'failed');
  assert.equal(ledger.resources.database.creationIssued, true);
  assert.equal(ledger.resources.database.intentPersisted, true);
  const final = finalDatabaseFixture();
  await cleanupFinalOwnedDatabase(
    final.identity,
    ledger.resources.database,
    final.adapters,
    Date.now() + 1000,
  );
  assert.equal(ledger.resources.database.removed, true);
  assert.equal(ledger.status, 'failed');
});
for (const mediaKind of ['image', 'video'])
  test(`final Crun unsafe committed symlink does not authorize schema or key deletion, expired deadline does not restart (${mediaKind})`, async (t) => {
    const value = await crunCleanupFixture(t, mediaKind),
      backup = `${value.resource.manifest}.original`;
    await rename(value.resource.manifest, backup);
    t.after(() => rm(backup, { force: true }));
    await symlink(backup, value.resource.manifest);
    const result = await cleanupFinalCrunResources(
      value.resource,
      value.adapters,
      Date.now() + 1000,
    );
    assert.equal(result.passed, false);
    assert.deepEqual(value.calls, []);
    assert.equal((await lstat(value.resource.manifest)).isSymbolicLink(), true);
    const expired = await cleanupFinalCrunResources(
      value.resource,
      value.adapters,
      Date.now() - 1,
    );
    assert.equal(expired.passed, false);
    assert.equal(expired.failures[0].code, 'CLEANUP_DEADLINE');
    assert.deepEqual(value.calls, []);
  });

test('baseline frozen input verification checks fixture plus target and predecessor SQL independently', async (t) => {
  const root = await fixture(t);
  const entries = [];
  for (const [
    index,
    entry,
  ] of BASELINE_SOURCE_CONTRACT.sourceInputs.entries()) {
    const bytes = `synthetic baseline source ${index}`;
    await mkdir(path.dirname(path.join(root, entry.path)), { recursive: true });
    await writeFile(path.join(root, entry.path), bytes);
    entries.push({
      path: entry.path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  await verifyFrozenSources(root, entries);
  for (const entry of entries) {
    const filename = path.join(root, entry.path),
      bytes = await readFile(filename);
    await rm(filename);
    await assert.rejects(verifyFrozenSources(root, entries), {
      code: 'ENOENT',
    });
    await writeFile(filename, 'changed fixture or SQL');
    await assert.rejects(verifyFrozenSources(root, entries), {
      code: 'SOURCE_HASH_MISMATCH',
    });
    await writeFile(filename, bytes);
  }
});
test('baseline external deadline includes allocation and terminates without fresh work time', async () => {
  const value = dedicatedFixture('baseline-materialization-migration');
  let workEnd;
  value.adapters.prepare = async (ledger) => {
    ledger.resources.database = { creationIssued: true, intentPersisted: true };
    value.now(1000 + 44000);
  };
  value.adapters.startWork = async (_ledger, end) => {
    workEnd = end;
    value.now(end);
    throw Object.assign(new Error('work timeout'), {
      code: 'DEDICATED_WORK_TIMEOUT',
    });
  };
  const ledger = await superviseDedicatedAcceptance(value);
  assert.equal(workEnd, 46000);
  assert.equal(ledger.cleanupDeadline, 61000);
  assert.equal(ledger.status, 'failed');
  assert.ok(value.calls.includes('drop'));
  assert.ok(
    ledger.failures.some((item) => item.code === 'DEDICATED_WORK_TIMEOUT'),
  );
});
for (const mode of ['reject', 'success', 'microtask-reject'])
  test(`expired work deadline observes ${mode} without extending its budget`, async () => {
    const value = dedicatedFixture('baseline-materialization-migration');
    value.adapters.startWork = async (_ledger, end) => {
      value.now(end + (mode === 'success' ? 1 : 0));
      if (mode === 'success') return { done: Promise.resolve({ ...child }) };
      if (mode === 'microtask-reject') await Promise.resolve();
      throw new Error('late work rejection');
    };
    const ledger = await superviseDedicatedAcceptance(value);
    assert.equal(ledger.status, 'failed');
    assert.ok(
      ledger.failures.some((item) => item.code === 'DEDICATED_WORK_TIMEOUT'),
    );
    assert.ok(value.calls.includes('drop'));
    assert.ok(!value.calls.includes('validate'));
    assert.ok(ledger.cleanupDeadline <= 61001);
  });
test('final-only database routing preserves the diagnostic created acknowledgement predicate', async () => {
  const source = await readFile(
    new URL('./runtime-acceptance.mjs', import.meta.url),
    'utf8',
  );
  const creation = source.slice(
    source.indexOf('  const database = async (name)'),
    source.indexOf('  const migrate = async (stage'),
  );
  assert.match(
    creation,
    /if \(identity\.group === 'final'\)[\s\S]*createFinalOwnedDatabase/,
  );
  assert.match(
    creation,
    /identity\.resources\.databases\.push\(\{ name, created: false \}\)/,
  );
  assert.match(
    creation,
    /identity\.resources\.databases\.at\(-1\)\.created = true/,
  );
  const cleanup = source.slice(
    source.indexOf(
      'for (const resource of [...identity.resources.databases].reverse())',
    ),
    source.indexOf('for (const container of identity.resources.containers)'),
  );
  assert.match(
    cleanup,
    /if \(identity\.group === 'final'\)[\s\S]*cleanupFinalOwnedDatabase[\s\S]*continue;[\s\S]*if \(created\)/,
  );
});

function finalCrunSupervisorFixture(mediaKind = 'image') {
  let now = 1000,
    writes = 0,
    alive = true;
  const calls = [],
    resource = { mediaKind, uuid: randomUUID() },
    value = {
      ...identity,
      group: 'final',
      overallDeadline: 100000,
      resources: {
        crun: { image: null, video: null, [resource.mediaKind]: resource },
      },
    };
  resource.manifest = `/tmp/crun-run-${resource.uuid}.json`;
  resource.directory = `/tmp/crun-owned-${resource.uuid}`;
  const clock = { now: () => now, sleep: () => new Promise(() => {}) };
  const options = {
    identity: value,
    mediaKind,
    resource,
    clock,
    start: async ({ onSpawn }) => {
      calls.push('spawn');
      onSpawn(12345);
      assert.equal(resource.pgid, 12345);
      return { pid: 12345, done: Promise.resolve({ ...child }) };
    },
    stop: async (pids, limits) => {
      calls.push('stop');
      assert.deepEqual(pids, [12345]);
      assert.equal(limits.term, 5000);
      assert.equal(limits.kill, 3000);
      assert.equal(limits.deadline, 11000);
      now += 20;
      alive = false;
    },
    probe: () => {
      calls.push('probe');
      if (!alive) throw Object.assign(new Error('absent'), { code: 'ESRCH' });
    },
    persistProof: async () => {
      calls.push(++writes === 1 ? 'ack' : 'proof');
    },
    cleanupOwned: async (end) => {
      calls.push('cleanup');
      assert.equal(hasFinalCrunTerminationProof(resource), true);
      assert.ok(end - now <= 5000);
      return { passed: true, operations: [], failures: [] };
    },
  };
  return {
    options,
    calls,
    resource,
    now: (value) => {
      now = value;
    },
    alive: (value) => {
      alive = value;
    },
    writes: () => writes,
  };
}
for (const mediaKind of ['image', 'video'])
  test(`actual final Crun binding requires observed group absence, closed streams and acknowledged proof before owned cleanup (${mediaKind})`, async () => {
    const value = finalCrunSupervisorFixture(mediaKind),
      result = await runFinalCrunBounded(value.options);
    assert.equal(result.exitCode, 0);
    assert.equal(result.cleanupError, null);
    assert.equal(result.spawnError, null);
    assert.deepEqual(value.calls, [
      'spawn',
      'ack',
      'stop',
      'probe',
      'proof',
      'cleanup',
    ]);
    assert.equal(result.cleanupDeadline, 16000);
    assert.equal(hasFinalCrunTerminationProof(value.resource), true);
    assert.equal(value.resource.cleanupResult.passed, true);
    assert.equal(value.resource.terminationProof.candidateSHA, SHA);
    assert.equal(value.resource.terminationProof.controlSHA, CONTROL);
  });
for (const mediaKind of ['image', 'video'])
  for (const kind of [
    'failed-child',
    'output-error',
    'stream-error',
    'postspawn-ack',
    'postspawn-setup',
    'alive',
    'EPERM',
    'missing-pid',
    'proof-write',
    'owned-cleanup',
  ])
    test(`final Crun ${mediaKind} ${kind} preserves failure and never substitutes direct close for durable proof`, async () => {
      const value = finalCrunSupervisorFixture(mediaKind);
      if (['failed-child', 'output-error', 'stream-error'].includes(kind))
        value.options.start = async ({ onSpawn }) => {
          onSpawn(12345);
          return {
            pid: 12345,
            done: Promise.resolve({
              ...child,
              exitCode: kind === 'failed-child' ? 7 : 0,
              outputLimit: kind === 'output-error',
              streamError: kind === 'stream-error',
            }),
          };
        };
      if (kind === 'postspawn-ack')
        value.options.persistProof = async () => {
          if (!value.resource.terminationProof)
            throw Object.assign(new Error('disk'), { code: 'EIO' });
        };
      if (kind === 'postspawn-setup')
        value.options.start = async ({ onSpawn }) => {
          onSpawn(12345);
          throw Object.assign(new Error('pipeline setup'), { code: 'EIO' });
        };
      if (kind === 'alive') value.options.probe = () => 0;
      if (kind === 'EPERM')
        value.options.probe = () => {
          throw Object.assign(new Error('permission'), { code: 'EPERM' });
        };
      if (kind === 'missing-pid')
        value.options.start = async ({ onSpawn }) => {
          onSpawn(undefined);
          return { done: Promise.resolve({ ...child }) };
        };
      if (kind === 'proof-write')
        value.options.persistProof = async () => {
          if (value.resource.terminationProof)
            throw Object.assign(new Error('disk'), { code: 'ENOSPC' });
        };
      if (kind === 'owned-cleanup')
        value.options.cleanupOwned = async () => ({
          passed: false,
          operations: [{ name: 'schema', passed: false }],
          failures: [{ code: 'CRUN_SCHEMA_REMOVAL_FAILED' }],
        });
      const result = await runFinalCrunBounded(value.options);
      if (kind === 'failed-child') {
        assert.equal(result.exitCode, 7);
        assert.ok(value.calls.includes('cleanup'));
      }
      if (kind === 'output-error') {
        assert.equal(result.outputLimit, true);
        assert.ok(value.calls.includes('cleanup'));
      }
      if (kind === 'stream-error') {
        assert.equal(result.streamError, 'STREAM_FAILED');
        assert.ok(value.calls.includes('cleanup'));
      }
      if (kind === 'postspawn-ack') {
        assert.equal(result.spawnError, 'EIO');
        assert.ok(value.calls.includes('cleanup'));
      }
      if (
        [
          'postspawn-setup',
          'alive',
          'EPERM',
          'missing-pid',
          'proof-write',
        ].includes(kind)
      ) {
        assert.ok(result.cleanupError);
        assert.equal(value.calls.includes('cleanup'), false);
        assert.equal(hasFinalCrunTerminationProof(value.resource), false);
      }
      if (kind === 'owned-cleanup') {
        assert.equal(result.cleanupError, 'CRUN_RESOURCE_CLEANUP_FAILED');
        assert.equal(value.resource.cleanupResult.passed, false);
      }
    });
for (const mediaKind of ['image', 'video'])
  test(`Crun work timeout and unresolved pipelines cannot reset sixty plus fifteen seconds (${mediaKind})`, async () => {
    const value = finalCrunSupervisorFixture(mediaKind);
    let waits = 0;
    value.options.clock.sleep = () => {
      waits++;
      if (waits === 3 || waits === 5)
        return Promise.resolve().then(() =>
          value.now(waits === 3 ? 61000 : 71000),
        );
      return new Promise(() => {});
    };
    value.options.start = async ({ onSpawn }) => {
      onSpawn(12345);
      return { pid: 12345, done: new Promise(() => {}) };
    };
    value.options.stop = async (_pids, limits) => {
      value.calls.push('stop');
      assert.equal(limits.deadline, 71000);
    };
    const result = await runFinalCrunBounded(value.options);
    assert.equal(result.timedOut, true);
    assert.equal(result.cleanupDeadline, 76000);
    assert.ok(result.cleanupError);
    assert.equal(value.calls.includes('cleanup'), false);
    assert.equal(hasFinalCrunTerminationProof(value.resource), false);
  });
for (const mediaKind of ['image', 'video'])
  test(`timed out Crun proof persistence cannot grant delayed authority or read a manifest (${mediaKind})`, async () => {
    const value = finalCrunSupervisorFixture(mediaKind);
    let complete;
    value.options.persistProof = async () => {
      if (value.resource.terminationProof) {
        value.options.clock.sleep = () =>
          Promise.resolve().then(() => value.now(11000));
        await new Promise((resolve) => {
          complete = resolve;
        });
      }
    };
    const result = await runFinalCrunBounded(value.options);
    assert.equal(result.cleanupError, 'CRUN_TERMINATION_PROOF_FAILED');
    assert.equal(hasFinalCrunTerminationProof(value.resource), false);
    assert.equal(value.calls.includes('cleanup'), false);
    complete();
    await Promise.resolve();
    assert.equal(value.resource.terminationProofPersisted, false);
    assert.equal(value.resource.terminationConfirmed, false);
  });
for (const mediaKind of ['image', 'video'])
  test(`actual starter hook records the real pid before child streams or postspawn journal failure (${mediaKind})`, async (t) => {
    const directory = await fixture(t),
      resource = { mediaKind, uuid: randomUUID() },
      value = {
        ...identity,
        group: 'final',
        overallDeadline: Date.now() + 100000,
        resources: {
          crun: { image: null, video: null, [resource.mediaKind]: resource },
        },
      };
    let actual, stopped;
    const result = await runFinalCrunBounded({
      identity: value,
      mediaKind: resource.mediaKind,
      resource,
      executable: process.execPath,
      args: ['-e', 'setInterval(()=>{},1000)'],
      cwd: directory,
      env: process.env,
      stdoutPath: path.join(directory, 'stdout'),
      stderrPath: path.join(directory, 'stderr'),
      persistProof: async () => {
        assert.ok(resource.pgid > 1);
        actual = resource.pgid;
        if (!resource.terminationProof)
          throw Object.assign(new Error('disk'), { code: 'EIO' });
      },
      stop: async (pids, limits) => {
        stopped = pids;
        await stopVisualGroups(pids, { ...limits, term: 10, kill: 1000 });
      },
      cleanupOwned: async () => ({
        passed: true,
        operations: [],
        failures: [],
      }),
    });
    assert.deepEqual(stopped, [actual]);
    assert.equal(result.spawnError, 'EIO');
    assert.equal(resource.streamsClosed, true);
    assert.equal(hasFinalCrunTerminationProof(resource), true);
    assert.ok(result.signal);
    assert.equal(
      (await lstat(path.join(directory, 'stdout'))).mode & 0o777,
      0o600,
    );
  });
for (const mediaKind of ['image', 'video'])
  test(`direct child close with surviving same-group descendant still requires actual group termination (${mediaKind})`, async (t) => {
    const directory = await fixture(t),
      resource = { mediaKind, uuid: randomUUID() },
      value = {
        ...identity,
        group: 'final',
        overallDeadline: Date.now() + 100000,
        resources: {
          crun: { image: null, video: null, [resource.mediaKind]: resource },
        },
      };
    let beforeStopAlive = false,
      cleanup = 0;
    const result = await runFinalCrunBounded({
      identity: value,
      mediaKind: resource.mediaKind,
      resource,
      executable: process.execPath,
      args: [
        '-e',
        `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});child.unref();process.stdout.write('descendant:'+child.pid);`,
      ],
      cwd: directory,
      env: process.env,
      stdoutPath: path.join(directory, 'stdout'),
      stderrPath: path.join(directory, 'stderr'),
      persistProof: async () => {},
      stop: async (pids, limits) => {
        try {
          process.kill(-pids[0], 0);
          beforeStopAlive = true;
        } catch {}
        assert.equal(resource.terminationConfirmed, false);
        await stopVisualGroups(pids, { ...limits, term: 10, kill: 1000 });
      },
      cleanupOwned: async () => {
        cleanup++;
        assert.equal(hasFinalCrunTerminationProof(resource), true);
        return { passed: true, operations: [], failures: [] };
      },
    });
    assert.equal(beforeStopAlive, true);
    assert.equal(result.exitCode, 0);
    assert.equal(cleanup, 1);
    assert.equal(result.cleanupError, null);
    assert.match(
      await readFile(path.join(directory, 'stdout'), 'utf8'),
      /^descendant:\d+$/,
    );
  });
test('Crun production routing leaves diagnostic and other stages on untouched generic helper and consumes recorded cleanup once', async () => {
  const source = await readFile(
    new URL('./runtime-acceptance.mjs', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /identity\.group === 'final' && mediaKind !== undefined[\s\S]*runFinalCrunBounded[\s\S]*: await runBounded/,
  );
  const outer = source.slice(
    source.indexOf(
      "    if (identity.group === 'final') {",
      source.indexOf('    const clean = async'),
    ),
    source.indexOf(
      '    for (const resource of [...identity.resources.databases].reverse())',
    ),
  );
  assert.ok(outer.includes('resource?.cleanupResult'));
  assert.ok(!outer.includes('cleanupFinalCrunResources('));
  assert.ok(!outer.includes('readFile('));
  assert.equal(
    hasFinalCrunTerminationProof({
      pgid: 12345,
      terminationConfirmed: true,
      terminationProofPersisted: true,
      streamsClosed: true,
    }),
    false,
  );
});

async function spawnMarkerInvocation(t) {
  const directory = await fixture(t),
    marker = path.join(directory, 'executed.marker');
  return {
    marker,
    options: {
      executable: process.execPath,
      args: [
        '-e',
        "require('node:fs').writeFileSync(process.argv[1],'executed',{flag:'wx'})",
        marker,
      ],
      cwd: directory,
      env: process.env,
      stdoutPath: path.join(directory, 'stdout'),
      stderrPath: path.join(directory, 'stderr'),
    },
  };
}
test('actual starter checks the exact absolute work boundary after private file preparation', async (t) => {
  for (const allowed of [false, true]) {
    const value = await spawnMarkerInvocation(t);
    let now = 1000,
      spawns = 0;
    const pending = startVisualProcess({
      ...value.options,
      beforeSpawn: () => {
        if (now >= 61000)
          throw Object.assign(new Error('deadline'), {
            code: 'CRUN_WORK_TIMEOUT',
          });
      },
      onSpawn: () => {
        spawns++;
      },
    });
    now = allowed ? 60999 : 61000;
    if (allowed) {
      const handle = await pending;
      const status = await handle.done;
      assert.equal(status.exitCode, 0);
      assert.equal(spawns, 1);
      assert.equal(await readFile(value.marker, 'utf8'), 'executed');
      await stopVisualGroups([handle.pid], {
        term: 0,
        kill: 1000,
        deadline: Date.now() + 1500,
      });
    } else {
      await assert.rejects(pending, { code: 'CRUN_WORK_TIMEOUT' });
      assert.equal(spawns, 0);
      await assert.rejects(lstat(value.marker), { code: 'ENOENT' });
      assert.equal((await lstat(value.options.stdoutPath)).mode & 0o777, 0o600);
    }
  }
});
for (const mediaKind of ['image', 'video'])
  for (const kind of ['deadline', 'cancelled', 'closed-window'])
    test(`actual final Crun ${mediaKind} ${kind} preparation cannot allocate a late process or replace the first error`, async (t) => {
      const value = await spawnMarkerInvocation(t),
        resource = { mediaKind, uuid: randomUUID() },
        calls = [];
      let now = 1000,
        cancelled = false,
        pending,
        lateError;
      const clock = { now: () => now, sleep: () => new Promise(() => {}) };
      const result = await runFinalCrunBounded({
        identity: {
          ...identity,
          group: 'final',
          overallDeadline: 100000,
          resources: {
            crun: { image: null, video: null, [resource.mediaKind]: resource },
          },
        },
        mediaKind: resource.mediaKind,
        resource,
        ...value.options,
        clock,
        isCancelled: () => cancelled,
        start: (options) => {
          pending = startVisualProcess(options);
          pending.catch((error) => {
            lateError = error.code;
          });
          if (kind === 'deadline') now = 61000;
          if (kind === 'cancelled') cancelled = true;
          if (kind === 'closed-window')
            throw Object.assign(new Error('fixed original control error'), {
              code: 'SYNTHETIC_CONTROL_FAILED',
            });
          return pending;
        },
        stop: async () => {
          calls.push('stop');
        },
        persistProof: async () => {
          calls.push('persist');
        },
        cleanupOwned: async () => {
          calls.push('manifest');
          return { passed: true };
        },
      });
      await assert.rejects(pending, {
        code: kind === 'cancelled' ? 'CANCELLED' : 'CRUN_WORK_TIMEOUT',
      });
      assert.equal(
        lateError,
        kind === 'cancelled' ? 'CANCELLED' : 'CRUN_WORK_TIMEOUT',
      );
      assert.equal(resource.spawnIssued, false);
      assert.equal(resource.pgid, null);
      assert.equal(resource.terminationConfirmed, false);
      assert.equal(resource.terminationProofPersisted, false);
      assert.equal(resource.streamsClosed, false);
      assert.deepEqual(calls, []);
      await assert.rejects(lstat(value.marker), { code: 'ENOENT' });
      if (kind === 'deadline') assert.equal(result.timedOut, true);
      if (kind === 'cancelled') assert.equal(result.spawnError, 'CANCELLED');
      if (kind === 'closed-window') {
        assert.equal(result.spawnError, 'SYNTHETIC_CONTROL_FAILED');
        assert.equal(result.timedOut, false);
        assert.ok(now < 61000);
      }
    });
test('actual spawn guard is synchronous and immediately precedes spawn, while existing callers remain optional', async () => {
  const source = await readFile(
      new URL('./runtime-acceptance.mjs', import.meta.url),
      'utf8',
    ),
    starter = source.slice(
      source.indexOf('export async function startVisualProcess('),
      source.indexOf('export async function stopVisualGroups('),
    );
  assert.match(
    starter,
    /await privateFile\(stdoutPath, ''\);\n {2}await privateFile\(stderrPath, ''\);\n {2}beforeSpawn\?\.\(\);\n {2}const child = spawn/,
  );
  assert.match(
    source,
    /finally \{\n {4}spawnWindowOpen = false;\n {2}\}\n {2}const cleanupStarted/,
  );
  const generic = source.slice(
    source.indexOf('export async function runBounded('),
    source.indexOf('async function captureCommand('),
  );
  assert.ok(!generic.includes('beforeSpawn'));
  assert.ok(!generic.includes('onSpawn'));
});

const FROZEN_CRUN = {
  image: {
    path: 'apps/server/api/src/services/integrations/crun/crun-image-flow.integration.spec.ts',
    sha256: 'e6a3414e20e2fcd48e3aa71681d8f717881bbce6abe7daef5893a30c1b21f99f',
    count: 18,
    passedTitles: [
      'Crun image quote through durable owned output and accounting model 0 outputs 1 funding hosted scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 1 funding byok scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 1 funding free scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding byok scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding free scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 1 funding hosted scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 1 funding byok scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 1 funding free scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 4 funding hosted scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 4 funding byok scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 4 funding free scenario success: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario mixed: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 1 outputs 4 funding hosted scenario failed: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario refused: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario deferred: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario disabled: frozen quote, restart, owned storage and exact accounting',
      'Crun image quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario ambiguous: frozen quote, restart, owned storage and exact accounting',
    ],
  },
  video: {
    path: 'apps/server/api/src/services/integrations/crun/crun-video-flow.integration.spec.ts',
    sha256: '6bbd5cbfd354e260898f5338cd2a05d534038ecbcd172f366138a41d3d5a345a',
    count: 23,
    passedTitles: [
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding hosted scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding byok scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding free scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding byok scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding free scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 1 funding hosted scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 1 funding byok scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 1 funding free scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 4 funding hosted scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 4 funding byok scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 4 funding free scenario success variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario mixed variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 4 funding hosted scenario failed variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario refused variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario deferred variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario disabled variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 4 funding hosted scenario ambiguous variant default: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding hosted scenario success variant 10s: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding hosted scenario success variant start: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 0 outputs 1 funding hosted scenario success variant end: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 1 funding hosted scenario success variant 1080p: frozen quote, restart, owned storage and exact accounting',
      'Crun video quote through durable owned output and accounting model 1 outputs 1 funding hosted scenario success variant 4k: frozen quote, restart, owned storage and exact accounting',
    ],
  },
};

function crunReport(mediaKind) {
  const entry = FROZEN_CRUN[mediaKind];
  return {
    success: true,
    testResults: [
      {
        name: `/repo/${entry.path}`,
        assertionResults: entry.passedTitles.map((fullName) => ({
          fullName,
          status: 'passed',
        })),
      },
    ],
  };
}
function crunReportContract(mediaKind) {
  const entry = CRUN_SOURCE_CONTRACT[mediaKind];
  return {
    file: entry.path.slice('apps/server/api/'.length),
    count: entry.count,
    titles: entry.passedTitles,
  };
}
test('Crun source qualification freezes the exact independent image18/video23 inventories', () => {
  assert.deepEqual(CRUN_SOURCE_CONTRACT, FROZEN_CRUN);
  assert.equal(Object.isFrozen(CRUN_SOURCE_CONTRACT), true);
  for (const mediaKind of ['image', 'video']) {
    assert.equal(Object.isFrozen(CRUN_SOURCE_CONTRACT[mediaKind]), true);
    assert.equal(
      new Set(CRUN_SOURCE_CONTRACT[mediaKind].passedTitles).size,
      CRUN_SOURCE_CONTRACT[mediaKind].count,
    );
    const cases = validateReport(
      crunReport(mediaKind),
      [crunReportContract(mediaKind)],
      child,
    );
    assert.equal(cases[0].passed, mediaKind === 'image' ? 18 : 23);
  }
});
for (const mediaKind of ['image', 'video'])
  for (const kind of [
    'wrong-file',
    'duplicate',
    'extra',
    'failed',
    'skipped',
    'pending',
    'todo',
    'aggregate41',
    'missing',
  ])
    test(`Crun ${mediaKind} report refuses ${kind} rather than qualifying a partial or combined result`, () => {
      const report = crunReport(mediaKind),
        rows = report.testResults[0].assertionResults;
      if (kind === 'wrong-file')
        report.testResults[0].name = '/repo/wrong.spec.ts';
      if (kind === 'duplicate') rows[1].fullName = rows[0].fullName;
      if (kind === 'extra')
        rows.push({ fullName: 'unfrozen extra case', status: 'passed' });
      if (['failed', 'skipped', 'pending', 'todo'].includes(kind))
        rows[0].status = kind;
      if (kind === 'aggregate41')
        rows.push(
          ...crunReport(mediaKind === 'image' ? 'video' : 'image')
            .testResults[0].assertionResults,
        );
      if (kind === 'missing') report.testResults = [];
      assert.throws(() =>
        validateReport(report, [crunReportContract(mediaKind)], child),
      );
    });
test('each independent Crun source requires its frozen hash and actual safe file', async (t) => {
  const root = await fixture(t),
    entries = [];
  for (const mediaKind of ['image', 'video']) {
    const entry = CRUN_SOURCE_CONTRACT[mediaKind],
      bytes = `synthetic ${mediaKind} source`;
    await mkdir(path.dirname(path.join(root, entry.path)), { recursive: true });
    await writeFile(path.join(root, entry.path), bytes);
    entries.push({
      ...entry,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  await verifyFrozenSources(root, entries);
  for (const entry of entries) {
    const file = path.join(root, entry.path),
      bytes = await readFile(file);
    await writeFile(file, 'stale source');
    await assert.rejects(verifyFrozenSources(root, entries), {
      code: 'SOURCE_HASH_MISMATCH',
    });
    await rm(file);
    await assert.rejects(verifyFrozenSources(root, entries), {
      code: 'ENOENT',
    });
    await writeFile(file, bytes);
  }
});
for (const kind of [
  'wrong-kind',
  'wrong-slot',
  'shared-resource',
  'shared-uuid',
  'shared-manifest',
  'shared-directory',
  'foreign-candidate',
  'foreign-control',
])
  test(`Crun rejects ${kind} before allocating a process or cleanup authority`, async () => {
    const value = finalCrunSupervisorFixture('video'),
      resource = value.resource;
    Object.assign(resource, {
      manifest: '/tmp/video-manifest',
      directory: '/tmp/video-directory',
    });
    const other = {
      mediaKind: 'image',
      uuid: randomUUID(),
      manifest: '/tmp/image-manifest',
      directory: '/tmp/image-directory',
    };
    value.options.identity.resources.crun.image = other;
    if (kind === 'wrong-kind') value.options.mediaKind = 'audio';
    if (kind === 'wrong-slot')
      value.options.identity.resources.crun.video = other;
    if (kind === 'shared-resource')
      value.options.identity.resources.crun.image = resource;
    if (kind === 'shared-uuid') other.uuid = resource.uuid;
    if (kind === 'shared-manifest') other.manifest = resource.manifest;
    if (kind === 'shared-directory') other.directory = resource.directory;
    if (kind === 'foreign-candidate') resource.candidateSHA = 'e'.repeat(40);
    if (kind === 'foreign-control') resource.controlSHA = 'e'.repeat(40);
    await assert.rejects(runFinalCrunBounded(value.options), {
      code: 'CRUN_OWNERSHIP',
    });
    assert.deepEqual(value.calls, []);
  });
test('a copied image proof cannot authorize the video slot or its owned cleaner', async (t) => {
  const image = await crunCleanupFixture(t, 'image'),
    video = await crunCleanupFixture(t, 'video');
  video.resource.terminationProof = structuredClone(
    image.resource.terminationProof,
  );
  assert.equal(hasFinalCrunTerminationProof(video.resource, 'video'), false);
  const result = await cleanupFinalCrunResources(
    video.resource,
    video.adapters,
    Date.now() + 1000,
  );
  assert.equal(result.passed, false);
  assert.deepEqual(video.calls, []);
});

async function finalQualifiedFixture() {
  const learningContract = requireLearningSourceContract();
  const learning = learningSupervisorFixture();
  await runFinalLearningBounded(learning.options);
  learning.resource.blankVerified = true;
  learning.resource.blankCheckedAt =
    learning.resource.terminationProof.checkedAt + 1;
  learning.resource.cleanupEvidence = Array.from(
    { length: learningContract.cleanupReceipts },
    () => `raw/learning-runtime/learning-runtime-${randomUUID()}-cleanup.json`,
  );
  const fixtures = ['image', 'video'].map(finalCrunSupervisorFixture);
  const value = fixtures[0].options.identity;
  value.resources.crun.video = fixtures[1].resource;
  value.resources.learning = learning.resource;
  for (const fixture of fixtures) {
    fixture.options.identity = value;
    if (fixture.resource.mediaKind === 'video') {
      const start = fixture.options.start;
      fixture.options.start = async (options) => {
        assert.equal(
          hasFinalCrunTerminationProof(value.resources.crun.image, 'image'),
          true,
        );
        assert.equal(value.resources.crun.image.cleanupResult.passed, true);
        assert.equal(fixtures[0].calls.at(-1), 'cleanup');
        return start(options);
      };
    }
    const result = await runFinalCrunBounded(fixture.options);
    assert.equal(result.cleanupError, null);
  }
  const stages = [
    'learning-runtime',
    'dataset-correctness',
    'dataset-typecheck',
    'dataset-matrix',
    'brand-preparation',
    'brand-migration',
    'brand-units',
    'brand-contracts',
    'brand-serializers',
    'baseline-materialization-migration',
    'storage',
    'crun-image',
    'crun-video',
    'agent-preparation',
    'agent',
    'publisher',
  ];
  const outcome = {
    ...identity,
    group: 'final',
    status: 'passed',
    completed: stages.map((stage) => ({
      stage,
      cases:
        stage === 'learning-runtime'
          ? learningContract.suites.map((suite) => ({
              file: suite.file,
              passed: suite.count,
              skipped: 0,
              skippedTitles: [],
              passedTitles: [...suite.titles],
            }))
          : stage.startsWith('crun-')
            ? [
                {
                  file: FROZEN_CRUN[stage.slice(5)].path.slice(
                    'apps/server/api/'.length,
                  ),
                  passed: FROZEN_CRUN[stage.slice(5)].count,
                  skipped: 0,
                  skippedTitles: [],
                  passedTitles: [...FROZEN_CRUN[stage.slice(5)].passedTitles],
                },
              ]
            : [],
    })),
    failures: [],
    cleanup: { passed: true },
    commands: ['learning-runtime', 'crun-image', 'crun-video'].map((stage) => ({
      stage,
      elapsedMs: 1,
    })),
  };
  return { value, outcome, fixtures };
}
test('independent image cleanup acknowledgement precedes video spawn and final receipt requires both inventories', async () => {
  const { value, outcome, fixtures } = await finalQualifiedFixture();
  assert.equal(validateOutcome(outcome, outcome, value), 'passed');
  assert.equal(fixtures[0].calls.at(-1), 'cleanup');
  assert.equal(fixtures[1].calls[0], 'spawn');
  assert.notEqual(
    value.resources.crun.image.uuid,
    value.resources.crun.video.uuid,
  );
  for (const mutate of [
    (o) => {
      o.completed.find((e) => e.stage === 'crun-image').stage = 'crun';
    },
    (o) => {
      o.completed = o.completed.filter((e) => e.stage !== 'crun-video');
    },
    (o) => {
      o.completed.find((e) => e.stage === 'crun-image').cases[0].passed = 41;
    },
    (o) => {
      o.completed.find((e) => e.stage === 'crun-video').cases[0].file =
        FROZEN_CRUN.image.path;
    },
    (o) => {
      o.completed.find(
        (e) => e.stage === 'crun-video',
      ).cases[0].passedTitles[0] = 'extra';
    },
    (o) => {
      o.completed.push(o.completed[0]);
    },
  ]) {
    const copy = structuredClone(outcome);
    mutate(copy);
    assert.throws(() => validateOutcome(copy, copy, value));
  }
  for (const mutate of [
    (r) => {
      r.video = null;
    },
    (r) => {
      r.video.terminationProof = { ...r.image.terminationProof };
    },
    (r) => {
      r.video.controlSHA = SHA;
    },
    (r) => {
      r.image.cleanupResult.passed = false;
    },
    (r) => {
      r.video.cleanupResult = undefined;
    },
    (r) => {
      r.video.manifest = r.image.manifest;
    },
  ]) {
    const copy = structuredClone(value);
    mutate(copy.resources.crun);
    assert.throws(() => validateOutcome(outcome, outcome, copy));
  }
});
test('final dispatcher awaits each supervised stage and blocks video after image failure within unchanged budgets', async () => {
  const source = await readFile(
    new URL('./runtime-acceptance.mjs', import.meta.url),
    'utf8',
  );
  const loop = source.slice(
    source.indexOf(
      "for (const mediaKind of ['image', 'video'])",
      source.indexOf('identity.resources.crun = { image: null, video: null }'),
    ),
    source.indexOf(
      "await attempt('agent'",
      source.indexOf('identity.resources.crun = { image: null, video: null }'),
    ),
  );
  assert.match(loop, /await attempt\(stage/);
  assert.match(
    loop,
    /await verifyFrozenSources\(identity.repo, \[contract\]\)/,
  );
  assert.match(loop, /await vitest\(\s*stage/);
  assert.match(loop, /if \(failures.length !== priorFailures\) break/);
  assert.match(loop, /timeout: 60000/);
});
async function finalSealFixture(t) {
  const state = await stateFixture(t),
    qualified = await finalQualifiedFixture();
  Object.assign(state.value, {
    group: 'final',
    phase: 'finished',
    resources: qualified.value.resources,
  });
  const evidence = [];
  for (const [index, kind] of ['image', 'video'].entries()) {
    for (const relative of [
      `raw/crun-${kind}.report.json`,
      `raw/crun-${kind}-manifest.json`,
      `raw/crun-${kind}-${index + 1}.stdout`,
      `raw/crun-${kind}-${index + 1}.stderr`,
    ]) {
      evidence.push(relative);
      await writeFile(
        path.join(state.value.state, relative),
        'private synthetic evidence',
        { mode: 0o600 },
      );
    }
  }
  for (const relative of [
    state.value.resources.learning.receiptRelative,
    'raw/learning-runtime-container.json',
    'raw/learning-runtime-blank.json',
    'raw/learning-runtime.report.json',
    'raw/learning-runtime-0.stdout',
    'raw/learning-runtime-0.stderr',
    ...state.value.resources.learning.cleanupEvidence,
  ]) {
    evidence.push(relative);
    await mkdir(path.dirname(path.join(state.value.state, relative)), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(
      path.join(state.value.state, relative),
      'private synthetic evidence',
      { mode: 0o600 },
    );
  }
  state.value.evidence = evidence;
  for (const name of ['outcome.json', 'receipt.json'])
    await writeFile(
      path.join(state.value.state, name),
      JSON.stringify(qualified.outcome),
      { mode: 0o600 },
    );
  return { ...state, outcome: qualified.outcome };
}
test('qualified final seal encrypts both media proofs and raw evidence using unchanged public allowlist', async (t) => {
  const { value, env } = await finalSealFixture(t);
  const receipt = await sealState(value, env);
  assert.equal(receipt.status, 'passed');
  assert.equal(
    receipt.passed,
    41 +
      requireLearningSourceContract().suites.reduce(
        (sum, suite) => sum + suite.count,
        0,
      ),
  );
  assert.equal(receipt.cleanup, true);
  assert.deepEqual(
    Object.keys(receipt).sort(),
    [
      'version',
      'candidateSHA',
      'controlSHA',
      'group',
      'fingerprint',
      'status',
      'passed',
      'skipped',
      'groups',
      'elapsedMs',
      'cleanup',
      'evidenceBytes',
      'envelopeSHA256',
    ].sort(),
  );
  const encrypted = JSON.parse(
    await readFile(path.join(value.state, 'public/evidence.encrypted.json')),
  );
  const privateEvidence = decrypt(encrypted);
  assert.equal(
    privateEvidence.files.length,
    14 + requireLearningSourceContract().cleanupReceipts,
  );
  assert.equal(
    privateEvidence.outcome.completed.find((e) => e.stage === 'crun-video')
      .cases[0].passed,
    23,
  );
});
for (const missing of [
  'raw/crun-video-manifest.json',
  'raw/crun-video.report.json',
  'raw/crun-image-1.stdout',
  'raw/crun-video-2.stderr',
])
  test(`final seal fails closed for missing or unregistered ${missing}`, async (t) => {
    const first = await finalSealFixture(t);
    first.value.evidence = first.value.evidence.filter(
      (relative) => relative !== missing,
    );
    await assert.rejects(sealState(first.value, first.env), {
      code: 'MISSING_CRUN_EVIDENCE',
    });
    const second = await finalSealFixture(t);
    await rm(path.join(second.value.state, missing));
    await assert.rejects(sealState(second.value, second.env));
  });

for (const failure of ['image-cleanup', 'image-proof', 'video-child'])
  test(`sequential Crun supervision fails final acceptance after ${failure}`, async () => {
    const fixtures = ['image', 'video'].map(finalCrunSupervisorFixture);
    const value = fixtures[0].options.identity;
    value.resources.crun.video = fixtures[1].resource;
    if (failure === 'image-cleanup')
      fixtures[0].options.cleanupOwned = async () => ({
        passed: false,
        operations: [],
        failures: [{ stage: 'cleanup', code: 'EIO' }],
      });
    if (failure === 'image-proof')
      fixtures[0].options.persistProof = async () => {
        if (fixtures[0].resource.terminationProof)
          throw Object.assign(new Error('proof write'), { code: 'EIO' });
      };
    if (failure === 'video-child')
      fixtures[1].options.start = async ({ onSpawn }) => {
        fixtures[1].calls.push('spawn');
        onSpawn(12345);
        return { pid: 12345, done: Promise.resolve({ ...child, exitCode: 7 }) };
      };
    let failed = false;
    for (const fixture of fixtures) {
      fixture.options.identity = value;
      const result = await runFinalCrunBounded(fixture.options);
      if (
        result.exitCode !== 0 ||
        result.cleanupError ||
        result.spawnError ||
        result.terminationError
      ) {
        failed = true;
        break;
      }
    }
    assert.equal(failed, true);
    assert.equal(
      fixtures[1].calls.includes('spawn'),
      failure === 'video-child',
    );
    if (failure === 'video-child')
      assert.equal(value.resources.crun.image.cleanupResult.passed, true);
  });

function learningIssuerFixture() {
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_JOB: 'runtime-acceptance',
    RUNTIME_ACCEPTANCE_CI_RUN_ID: '123',
    RUNTIME_ACCEPTANCE_CI_RUN_ATTEMPT: '2',
    RUNTIME_ACCEPTANCE_CI_JOB: 'runtime-acceptance',
    RUNTIME_ACCEPTANCE_REDIS_ID: 'b'.repeat(64),
  };
  const value = {
    ...identity,
    group: 'final',
    startedAt: 1000000,
    overallDeadline: 4600000,
    learningCi: learningCiIdentity(env),
    resources: { redis: env.RUNTIME_ACCEPTANCE_REDIS_ID },
  };
  const inspected = {
    Id: env.RUNTIME_ACCEPTANCE_REDIS_ID,
    Image: `sha256:${'c'.repeat(64)}`,
    Created: new Date(999000).toISOString(),
    State: { Running: true },
    Config: { Image: 'redis:7' },
    Mounts: [{ Type: 'volume', Destination: '/data', Name: 'd'.repeat(64) }],
    NetworkSettings: {
      Ports: { '6379/tcp': [{ HostIp: '0.0.0.0', HostPort: '6379' }] },
    },
  };
  const info = `# Server\r\nrun_id:${'e'.repeat(40)}\r\n`;
  return { env, value, inspected, info };
}
function syntheticLearningContract() {
  return {
    version: 1,
    qualified: true,
    sourceInputs: LEARNING_SOURCE_CONTRACT.sourceInputs.map((entry) => ({
      ...entry,
      sha256: 'a'.repeat(64),
    })),
    suites: LEARNING_SOURCE_CONTRACT.suites.map((entry, index) => ({
      file: entry.file,
      count: 1,
      titles: [`synthetic validator case ${index}`],
    })),
    cleanupReceipts: 2,
  };
}
test('learning source qualification requires complete fixed inventory and cannot be enabled by environment', () => {
  const pending = structuredClone(LEARNING_SOURCE_CONTRACT);
  pending.qualified = false;
  assert.throws(() => requireLearningSourceContract(pending), {
    code: 'LEARNING_INVENTORY_UNQUALIFIED',
  });
  const valid = syntheticLearningContract();
  assert.equal(requireLearningSourceContract(valid), valid);
  for (const mutate of [
    (value) => {
      value.sourceInputs.pop();
    },
    (value) => {
      value.sourceInputs[0].sha256 = null;
    },
    (value) => {
      value.sourceInputs[0].path = 'another-fixture.ts';
    },
    (value) => {
      value.suites[0].titles = [];
    },
    (value) => {
      value.suites[1].titles = [...value.suites[0].titles];
    },
    (value) => {
      value.suites[0].count = 0;
    },
    (value) => {
      value.cleanupReceipts = 0;
    },
  ]) {
    const copy = structuredClone(valid);
    mutate(copy);
    assert.throws(() => requireLearningSourceContract(copy), {
      code: 'INVALID_LEARNING_INVENTORY',
    });
  }
});
test('learning issuer binds fresh exact CI service, image, endpoint, run and attempt', () => {
  const { env, value, inspected, info } = learningIssuerFixture();
  const receipt = buildLearningRedisReceipt(
    value,
    env,
    inspected,
    info,
    info,
    1000001,
  );
  assert.equal(receipt.candidateSHA, SHA);
  assert.equal(receipt.kind, 'ci-owned-redis-instance');
  assert.equal(receipt.runAttempt, '2');
  assert.deepEqual(receipt.ownedDatabases, [0, 1, 2, 3, 4]);
  assert.deepEqual(receipt.endpoint, { hostname: '127.0.0.1', port: 6379 });
  for (const field of [
    'GITHUB_ACTIONS',
    'GITHUB_RUN_ID',
    'GITHUB_RUN_ATTEMPT',
    'GITHUB_JOB',
  ]) {
    assert.throws(() =>
      buildLearningRedisReceipt(
        value,
        { ...env, [field]: 'other' },
        inspected,
        info,
        info,
        1000001,
      ),
    );
  }
  for (const mutate of [
    (container) => {
      container.Id = 'f'.repeat(64);
    },
    (container) => {
      container.Image = 'redis:7';
    },
    (container) => {
      container.Config.Image = 'redis:latest';
    },
    (container) => {
      container.State.Running = false;
    },
    (container) => {
      container.Created = new Date(1).toISOString();
    },
    (container) => {
      container.Created = new Date(1000001).toISOString();
    },
    (container) => {
      container.Mounts[0].Type = 'bind';
    },
    (container) => {
      container.Mounts[0].Name = 'persistent-data';
    },
    (container) => {
      container.NetworkSettings.Ports['6379/tcp'][0].HostPort = '6380';
    },
  ]) {
    const copy = structuredClone(inspected);
    mutate(copy);
    assert.throws(() =>
      buildLearningRedisReceipt(value, env, copy, info, info, 1000001),
    );
  }
  assert.throws(
    () =>
      buildLearningRedisReceipt(
        value,
        env,
        inspected,
        info,
        info.replaceAll('e', 'f'),
        1000001,
      ),
    { code: 'LEARNING_ENDPOINT_IDENTITY' },
  );
  assert.throws(() => learningRedisRunId(`${info}${info}`), {
    code: 'LEARNING_REDIS_IDENTITY',
  });
});
test('learning exclusive instance requires every owned DB and unassigned keyspace blank', () => {
  requireLearningRedisBlank('# Keyspace\r\n', [0, '0\n', 0, 0, 0]);
  for (let db = 0; db < 5; db++) {
    const sizes = [0, 0, 0, 0, 0];
    sizes[db] = 1;
    assert.throws(() => requireLearningRedisBlank('', sizes), {
      code: 'LEARNING_REDIS_NOT_EMPTY',
    });
  }
  assert.throws(
    () =>
      requireLearningRedisBlank(
        'db8:keys=1,expires=0,avg_ttl=0',
        [0, 0, 0, 0, 0],
      ),
    { code: 'LEARNING_REDIS_NOT_EMPTY' },
  );
});
test('learning child receives exact authority while ambient credentials and workload overrides are excluded', () => {
  const { env, value, inspected, info } = learningIssuerFixture();
  const resource = {
    receipt: buildLearningRedisReceipt(
      value,
      env,
      inspected,
      info,
      info,
      1000001,
    ),
    receiptPath: '/private/owned/redis-ownership.json',
  };
  value.resources.learning = resource;
  const childEnv = learningChildEnvironment(
    {
      ...env,
      PATH: '/bin',
      HOME: '/home/runner',
      OPENAI_API_KEY: 'forbidden',
      STRIPE_SECRET_KEY: 'forbidden',
      AWS_PROFILE: 'forbidden',
      HTTP_PROXY: 'forbidden',
      NODE_OPTIONS: 'forbidden',
      REDIS_QUEUE_URL: 'redis://elsewhere:6379/1',
    },
    value,
    resource,
    'postgresql://genfeed:local@127.0.0.1:5432/genfeed_learning_runtime_test',
  );
  assert.equal(childEnv.LEARNING_RUNTIME_ACCEPTANCE_HEAD, SHA);
  assert.equal(childEnv.RUNTIME_ACCEPTANCE_CI_RUN_ATTEMPT, '2');
  assert.equal(
    childEnv.LEARNING_RUNTIME_TEST_REDIS_URL,
    'redis://127.0.0.1:6379/0',
  );
  assert.equal(childEnv.NODE_ENV, 'test');
  assert.equal(childEnv.GENFEED_CLOUD, 'true');
  for (const key of [
    'OPENAI_API_KEY',
    'STRIPE_SECRET_KEY',
    'AWS_PROFILE',
    'HTTP_PROXY',
    'NODE_OPTIONS',
    'REDIS_QUEUE_URL',
  ])
    assert.equal(childEnv[key], undefined);
});
function learningSupervisorFixture() {
  let now = 1000,
    alive = true;
  const calls = [];
  const resource = {
    startedAt: now,
    receipt: {
      candidateSHA: SHA,
      containerId: 'b'.repeat(64),
      ownerNonce: randomUUID(),
    },
    receiptHash: 'c'.repeat(64),
    receiptRelative: 'raw/learning-runtime/redis-ownership.json',
  };
  const value = {
    ...identity,
    group: 'final',
    overallDeadline: 3600000,
    resources: { redis: resource.receipt.containerId, learning: resource },
  };
  const options = {
    identity: value,
    resource,
    aggregateDeadline: 3480000,
    clock: { now: () => now, sleep: () => new Promise(() => {}) },
    isCancelled: () => false,
    start: async ({ beforeSpawn, onSpawn }) => {
      beforeSpawn();
      calls.push('spawn');
      onSpawn(12345);
      return { pid: 12345, done: Promise.resolve({ ...child }) };
    },
    stop: async (pids, limits) => {
      assert.deepEqual(pids, [12345]);
      assert.equal(limits.deadline, 11000);
      calls.push('stop');
      alive = false;
      now += 20;
    },
    probe: () => {
      calls.push('probe');
      if (!alive) throw Object.assign(new Error('absent'), { code: 'ESRCH' });
    },
    persistProof: async () => {
      calls.push(resource.terminationProof ? 'proof' : 'ack');
    },
    cleanupOwned: async (end) => {
      assert.equal(hasFinalLearningTerminationProof(resource), true);
      assert.equal(end, 46020);
      calls.push('blank');
      return { passed: true, operations: [], failures: [] };
    },
  };
  return {
    options,
    resource,
    calls,
    setNow: (value) => {
      now = value;
    },
  };
}
test('learning process streams and group absence must be persisted before blank-instance verification', async () => {
  const fixture = learningSupervisorFixture();
  const result = await runFinalLearningBounded(fixture.options);
  assert.equal(result.cleanupError, null);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(fixture.calls, [
    'spawn',
    'ack',
    'stop',
    'probe',
    'proof',
    'blank',
  ]);
  assert.equal(hasFinalLearningTerminationProof(fixture.resource), true);
  for (const mutate of [
    (value) => {
      value.streamsClosed = false;
    },
    (value) => {
      value.terminationProofPersisted = false;
    },
    (value) => {
      value.terminationProof.ownerNonce = randomUUID();
    },
    (value) => {
      value.terminationProof.receiptHash = 'f'.repeat(64);
    },
  ]) {
    const copy = structuredClone(fixture.resource);
    mutate(copy);
    assert.equal(hasFinalLearningTerminationProof(copy), false);
  }
});
for (const failure of ['alive', 'permission', 'proof', 'blank'])
  test(`learning cleanup cannot grant success after ${failure}`, async () => {
    const fixture = learningSupervisorFixture();
    if (failure === 'alive') fixture.options.probe = () => {};
    if (failure === 'permission')
      fixture.options.probe = () => {
        throw Object.assign(new Error('denied'), { code: 'EPERM' });
      };
    if (failure === 'proof')
      fixture.options.persistProof = async () => {
        if (fixture.resource.terminationProof)
          throw Object.assign(new Error('disk'), { code: 'EIO' });
      };
    if (failure === 'blank')
      fixture.options.cleanupOwned = async () => ({ passed: false });
    const result = await runFinalLearningBounded(fixture.options);
    assert.ok(result.cleanupError);
    assert.equal(fixture.calls.includes('blank'), false);
  });
test('learning allocation and setup consume the same 540 second work window', async () => {
  const fixture = learningSupervisorFixture();
  fixture.setNow(541000);
  await assert.rejects(runFinalLearningBounded(fixture.options), {
    code: 'AGGREGATE_DEADLINE',
  });
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(FINAL_LEARNING_BUDGET, {
    work: 540000,
    cleanup: 60000,
    total: 600000,
  });
  assert.equal(
    workBudget({ group: 'final', overallDeadline: 3600000 }, 1000),
    3480000,
  );
});
for (const missing of [
  'raw/learning-runtime/redis-ownership.json',
  'raw/learning-runtime-container.json',
  'raw/learning-runtime-blank.json',
  'raw/learning-runtime.report.json',
  'raw/learning-runtime-0.stdout',
  'raw/learning-runtime-0.stderr',
])
  test(`qualified final seal refuses missing learning proof ${missing}`, async (t) => {
    const fixture = await finalSealFixture(t);
    fixture.value.evidence = fixture.value.evidence.filter(
      (name) => name !== missing,
    );
    await assert.rejects(sealState(fixture.value, fixture.env), {
      code: 'MISSING_LEARNING_EVIDENCE',
    });
  });

test('learning rejects a delayed starter before it can spawn after its original work deadline', async () => {
  const fixture = learningSupervisorFixture();
  let invoke;
  fixture.options.start = (options) =>
    new Promise((resolve, reject) => {
      invoke = () => {
        try {
          options.beforeSpawn();
          options.onSpawn(12345);
          resolve({ pid: 12345, done: Promise.resolve(child) });
        } catch (error) {
          reject(error);
        }
      };
    });
  fixture.options.clock.sleep = () =>
    Promise.resolve().then(() => fixture.setNow(541000));
  const result = await runFinalLearningBounded(fixture.options);
  assert.equal(result.timedOut, true);
  invoke();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fixture.resource.spawnIssued, false);
  assert.equal(fixture.calls.includes('blank'), false);
});
test('learning unresolved child streams cannot authorize blank-instance verification', async () => {
  const fixture = learningSupervisorFixture();
  fixture.options.start = async ({ beforeSpawn, onSpawn }) => {
    beforeSpawn();
    onSpawn(12345);
    return { pid: 12345, done: new Promise(() => {}) };
  };
  let waits = 0;
  fixture.options.clock.sleep = () => {
    waits++;
    if (waits === 3 || waits === 5)
      return Promise.resolve().then(() =>
        fixture.setNow(waits === 3 ? 541000 : 551000),
      );
    return new Promise(() => {});
  };
  fixture.options.stop = async () => {
    fixture.calls.push('stop');
  };
  const result = await runFinalLearningBounded(fixture.options);
  assert.equal(result.timedOut, true);
  assert.ok(result.cleanupError);
  assert.equal(hasFinalLearningTerminationProof(fixture.resource), false);
  assert.equal(fixture.calls.includes('blank'), false);
});
test('learning original nonzero exit remains failure even after owned cleanup succeeds', async () => {
  const fixture = learningSupervisorFixture();
  fixture.options.start = async ({ beforeSpawn, onSpawn }) => {
    beforeSpawn();
    onSpawn(12345);
    return { pid: 12345, done: Promise.resolve({ ...child, exitCode: 9 }) };
  };
  const result = await runFinalLearningBounded(fixture.options);
  assert.equal(result.exitCode, 9);
  assert.equal(result.cleanupError, null);
  const source = await readFile(CLI_PATH, 'utf8');
  const run = source.slice(
    source.indexOf('    commands.push({ stage, ...result });'),
    source.indexOf(
      '  const vitest = async (',
      source.indexOf('async function execution'),
    ),
  );
  assert.match(run, /result.exitCode === 0/);
  assert.match(run, /'CHILD_FAILED'/);
  const stage = source.slice(
    source.indexOf(
      '      const contract = requireLearningSourceContract();',
      source.indexOf('async function execution'),
    ),
    source.indexOf(
      "      await attempt('dataset'",
      source.indexOf('async function execution'),
    ),
  );
  assert.match(stage, /await vitest\(\s*'learning-runtime'/);
  assert.doesNotMatch(stage, /await attempt\(\s*'learning-runtime'/);
});
async function learningCleanupFixture(t) {
  const contract = requireLearningSourceContract();
  const issuer = learningIssuerFixture();
  const supervisor = learningSupervisorFixture();
  await runFinalLearningBounded(supervisor.options);
  const root = await fixture(t),
    resource = supervisor.resource;
  const value = { ...supervisor.options.identity, state: root, evidence: [] };
  await mkdir(path.join(root, 'raw'), { mode: 0o700 });
  resource.directory = path.join(root, 'raw/learning-runtime');
  await mkdir(resource.directory, { mode: 0o700 });
  const directory = await lstat(resource.directory);
  resource.directoryMetadata = { inode: directory.ino, device: directory.dev };
  resource.receiptPath = path.join(root, resource.receiptRelative);
  const receiptBytes = JSON.stringify(resource.receipt);
  resource.receiptHash = createHash('sha256')
    .update(receiptBytes)
    .digest('hex');
  resource.terminationProof.receiptHash = resource.receiptHash;
  await writeFile(resource.receiptPath, receiptBytes, { mode: 0o600 });
  const metadata = await lstat(resource.receiptPath);
  resource.receiptMetadata = { inode: metadata.ino, device: metadata.dev };
  const cleanupPaths = [];
  for (let index = 0; index < contract.cleanupReceipts; index++) {
    const fixtureId = randomUUID(),
      name = `learning-runtime-${fixtureId}-cleanup.json`;
    const file = path.join(resource.directory, name);
    cleanupPaths.push(file);
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        fixtureId,
        candidateSHA: SHA,
        receiptHash: resource.receiptHash,
        claimValue: `${resource.receipt.ownerNonce}:${fixtureId}`,
        inventories: [0, 1, 2, 3, 4].map((db) => ({
          db,
          keys: db === 0 ? ['learning-runtime:owner'] : [],
        })),
        success: true,
      }),
      { mode: 0o600 },
    );
  }
  const calls = [];
  const adapters = {
    clock: () => 2000,
    snapshot: async () => {
      calls.push('snapshot');
      return {
        receipt: resource.receipt,
        inspected: issuer.inspected,
        keyspace: '',
        sizes: [0, 0, 0, 0, 0],
      };
    },
    save: async () => {
      calls.push('save');
    },
  };
  return { value, resource, cleanupPaths, adapters, calls };
}
test('learning captured cleanup inventory and blank snapshot preserve exact receipt authority', async (t) => {
  const fixture = await learningCleanupFixture(t);
  const result = await verifyFinalLearningCleanup(
    fixture.value,
    fixture.adapters,
    10000,
  );
  assert.equal(result.passed, true);
  assert.equal(fixture.resource.blankVerified, true);
  assert.equal(
    fixture.value.evidence.length,
    requireLearningSourceContract().cleanupReceipts,
  );
  assert.deepEqual(fixture.calls, ['snapshot', 'save']);
});
for (const failure of [
  'receipt bytes',
  'receipt inode',
  'directory inode',
  'missing cleanup',
  'duplicate cleanup',
  'wrong head',
  'wrong nonce',
  'wrong receipt hash',
  'failed cleanup',
  'duplicate inventory key',
  'wrong database',
  'redis restart',
  'outside database',
])
  test(`learning cleanup refuses ${failure} before later runtime stages`, async (t) => {
    const fixture = await learningCleanupFixture(t);
    if (failure === 'receipt bytes')
      await writeFile(fixture.resource.receiptPath, '{}', { mode: 0o600 });
    if (failure === 'receipt inode') {
      await rename(
        fixture.resource.receiptPath,
        `${fixture.resource.receiptPath}.original`,
      );
      await writeFile(
        fixture.resource.receiptPath,
        JSON.stringify(fixture.resource.receipt),
        { mode: 0o600 },
      );
    }
    if (failure === 'directory inode') {
      await rename(
        fixture.resource.directory,
        `${fixture.resource.directory}.original`,
      );
      await mkdir(fixture.resource.directory, { mode: 0o700 });
    }
    if (failure === 'missing cleanup') await rm(fixture.cleanupPaths[0]);
    if (failure === 'duplicate cleanup')
      await writeFile(
        path.join(
          fixture.resource.directory,
          `learning-runtime-${randomUUID()}-cleanup.json`,
        ),
        await readFile(fixture.cleanupPaths[0]),
        { mode: 0o600 },
      );
    if (
      [
        'wrong head',
        'wrong nonce',
        'wrong receipt hash',
        'failed cleanup',
        'duplicate inventory key',
        'wrong database',
      ].includes(failure)
    ) {
      const cleanup = JSON.parse(
        await readFile(fixture.cleanupPaths[0], 'utf8'),
      );
      if (failure === 'wrong head') cleanup.candidateSHA = CONTROL;
      if (failure === 'wrong nonce')
        cleanup.claimValue = `${randomUUID()}:${cleanup.fixtureId}`;
      if (failure === 'wrong receipt hash')
        cleanup.receiptHash = 'f'.repeat(64);
      if (failure === 'failed cleanup') cleanup.success = false;
      if (failure === 'duplicate inventory key')
        cleanup.inventories[0].keys.push('learning-runtime:owner');
      if (failure === 'wrong database') cleanup.inventories[4].db = 8;
      await writeFile(fixture.cleanupPaths[0], JSON.stringify(cleanup), {
        mode: 0o600,
      });
    }
    if (failure === 'redis restart')
      fixture.adapters.snapshot = async () => ({
        receipt: { ...fixture.resource.receipt, redisRunId: 'f'.repeat(40) },
      });
    if (failure === 'outside database')
      fixture.adapters.snapshot = async () => {
        requireLearningRedisBlank(
          'db8:keys=1,expires=0,avg_ttl=0',
          [0, 0, 0, 0, 0],
        );
      };
    await assert.rejects(
      verifyFinalLearningCleanup(fixture.value, fixture.adapters, 10000),
    );
    assert.notEqual(fixture.resource.blankVerified, true);
    assert.equal(fixture.calls.includes('save'), false);
  });
