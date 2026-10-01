import { spawn } from 'node:child_process';
import {
  constants,
  createCipheriv,
  createHash,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { createWriteStream, constants as fsConstants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  statfs,
} from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

export const RAW_LIMIT = 50 * 1024 * 1024;
export const ENVELOPE_LIMIT = 100 * 1024 * 1024;
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const GROUPS = [
  'dataset-diagnostic',
  'final',
  'visual-isolation',
  'visual-connected',
];
const DATASET_DIRECTORY = 'src/collections/content-learning/services/';
const DATASET_UNIT = `${DATASET_DIRECTORY}learning-dataset.service.spec.ts`;
const DATASET_PG = `${DATASET_DIRECTORY}learning-dataset.postgres.spec.ts`;
const DATASET_SUITE = 'dataset atomic scalability on isolated PostgreSQL';
const MATRIX_TITLE = `${DATASET_SUITE} measures 1k/10k/100k owned and consented three times after warmup plus mixed`;
const DIAGNOSTIC_TITLE = `${DATASET_SUITE} profiles one 10k and one 100k consented snapshot without replacing acceptance matrix`;
const PG_TITLES = [
  'serializes identical requests, rejects conflicts and rolls back entry/edge failures',
  'rejects source/consent identity changes and owned/consented fingerprint collisions',
  'excludes deleted, synthetic, wrong-account, pre-consent and invalid-pinned observations',
  'aborts a complete snapshot when a newer reward commits before final locks',
  'blocks a newer reward behind actual service locks then invalidates the committed dataset and preserves retry',
  'exclusive consent revocation waits for an actual snapshot then follows the deduplicated edge',
  'pages past ineligible candidates and excludes latest invalid or post-cutoff versions',
].map((title) => `${DATASET_SUITE} ${title}`);
export const BRAND_PATH =
  'apps/server/api/test/integration/branded-generation/branded-generation-receipts.integration.spec.ts';
export const STORAGE_PATHS = [
  'packages/storage/src/bounded-storage-read.spec.ts',
  'packages/storage/__tests__/local-storage.provider.test.ts',
  'packages/storage/__tests__/s3-storage.provider.test.ts',
  'packages/storage/__tests__/storage-provider.factory.test.ts',
  'packages/storage/src/local-storage.provider.spec.ts',
  'packages/storage/src/path-containment.spec.ts',
];
const AGENT_TITLES = [
  'proactive organization to strategy run and attributed draft integration dispatches the next minute, records exactly one consumed run and attributes generated drafts',
  ...[
    'runs a native queued graph, requires approval, publishes, and learns its own measured hook in cycle two',
    'converges concurrent dispatch and recovers PENDING transport using the frozen request after restart',
    'accepts a lost enqueue response without counting a failure and never replays a failed slot',
    'refuses a zero budget and preserves archived strategy threads',
    'serializes approval against expiry and never publishes an expired draft',
  ].map((title) => `isolated PostgreSQL/Redis proactive runtime ${title}`),
];
const REQUIRED = {
  'dataset-diagnostic': [
    'dataset-correctness',
    'dataset-typecheck',
    'dataset-diagnostic',
  ],
  final: [
    'dataset-correctness',
    'dataset-typecheck',
    'dataset-matrix',
    'brand-preparation',
    'brand-migration',
    'brand-units',
    'brand-contracts',
    'brand-serializers',
    'brand-integration',
    'storage',
    'crun',
    'agent-preparation',
    'agent',
    'publisher',
  ],
  'visual-isolation': ['visual-protocol', 'visual-isolation'],
  'visual-connected': [
    'visual-preparation',
    'visual-connected',
    'visual-library',
  ],
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export class AcceptanceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function requireThat(condition, code) {
  if (!condition) throw new AcceptanceError(code);
}
function exactKeys(value, keys, code) {
  requireThat(
    value && typeof value === 'object' && !Array.isArray(value),
    code,
  );
  requireThat(
    Object.keys(value).sort().join('|') === [...keys].sort().join('|'),
    code,
  );
}
export function validateSha(value) {
  requireThat(SHA.test(value ?? ''), 'INVALID_SHA');
  return value;
}
export function readPostgresCredentials(env) {
  const username = env?.RUNTIME_ACCEPTANCE_POSTGRES_USER;
  const password = env?.RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD;
  requireThat(
    typeof username === 'string' &&
      username.length > 0 &&
      typeof password === 'string' &&
      password.length > 0,
    'POSTGRES_CREDENTIALS_REQUIRED',
  );
  requireThat(
    username === 'genfeed' && /^[A-Za-z0-9_-]{12,128}$/.test(password),
    'INVALID_POSTGRES_CREDENTIALS',
  );
  return { username, password };
}
function validateCredentials(credentials) {
  return readPostgresCredentials({
    RUNTIME_ACCEPTANCE_POSTGRES_USER: credentials?.username,
    RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD: credentials?.password,
  });
}
export function validateUrl(value, kind, database, credentials) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AcceptanceError('INVALID_SERVICE_URL');
  }
  requireThat(
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'NON_LOOPBACK_SERVICE',
  );
  requireThat(
    !url.hash &&
      ![...url.searchParams.keys()].some((key) =>
        /^(?:host|hostaddr|service)$/i.test(key),
      ),
    'SERVICE_OVERRIDE',
  );
  if (kind === 'postgres') {
    validateCredentials(credentials);
    requireThat(
      url.protocol === 'postgresql:' &&
        url.port === '5432' &&
        url.pathname === `/${database}` &&
        database.includes('test'),
      'INVALID_DATABASE',
    );
    requireThat(
      url.username === 'genfeed' &&
        url.password === credentials.password &&
        !url.username.includes('%') &&
        !url.password.includes('%') &&
        !url.search,
      'INVALID_DATABASE',
    );
  } else {
    requireThat(
      url.protocol === 'redis:' &&
        url.port === '6379' &&
        /^\/\d+$/.test(url.pathname) &&
        !url.username &&
        !url.password &&
        !url.search,
      'INVALID_REDIS',
    );
  }
  return url;
}
export function validatePublicKey(pem) {
  requireThat(
    typeof pem === 'string' &&
      /^-----BEGIN PUBLIC KEY-----\s[\s\S]+-----END PUBLIC KEY-----\s*$/.test(
        pem,
      ),
    'PUBLIC_KEY_REQUIRED',
  );
  let key;
  try {
    key = createPublicKey(pem);
  } catch {
    throw new AcceptanceError('INVALID_PUBLIC_KEY');
  }
  requireThat(
    key.asymmetricKeyType === 'rsa' &&
      key.asymmetricKeyDetails.modulusLength >= 3072,
    'INVALID_PUBLIC_KEY',
  );
  return {
    key,
    fingerprint: sha256(key.export({ type: 'spki', format: 'der' })),
  };
}
export function parseArguments(argv) {
  const [command, ...args] = argv;
  requireThat(
    ['preflight', ...GROUPS, 'seal'].includes(command),
    'INVALID_COMMAND',
  );
  const options = { command };
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    requireThat(
      [
        '--repo',
        '--state',
        '--candidate-sha',
        '--control-sha',
        ...(command === 'preflight' ? ['--group'] : []),
      ].includes(name),
      'INVALID_ARGUMENT',
    );
    requireThat(
      args[index + 1] && !Object.hasOwn(options, name.slice(2)),
      'INVALID_ARGUMENT',
    );
    options[name.slice(2)] = args[index + 1];
  }
  requireThat(
    path.isAbsolute(options.repo ?? '') && path.isAbsolute(options.state ?? ''),
    'ABSOLUTE_PATH_REQUIRED',
  );
  validateSha(options['candidate-sha']);
  validateSha(options['control-sha']);
  if (command === 'preflight')
    requireThat(GROUPS.includes(options.group), 'INVALID_GROUP');
  return options;
}
export function validateOwnerContract(value) {
  let contract;
  try {
    contract = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new AcceptanceError('OWNER_CONTRACT_REQUIRED');
  }
  exactKeys(
    contract,
    ['version', 'brand', 'storage'],
    'INVALID_OWNER_CONTRACT',
  );
  requireThat(
    contract.version === 1 &&
      Array.isArray(contract.storage) &&
      contract.storage.length === 6,
    'INVALID_OWNER_CONTRACT',
  );
  const seen = new Set();
  const seenTitles = new Set();
  const entries = [contract.brand, ...contract.storage];
  for (const entry of entries) {
    exactKeys(
      entry,
      ['path', 'sha256', 'passedTitles'],
      'INVALID_OWNER_CONTRACT',
    );
    requireThat(
      typeof entry.path === 'string' &&
        !seen.has(entry.path) &&
        HASH.test(entry.sha256 ?? ''),
      'INVALID_OWNER_CONTRACT',
    );
    seen.add(entry.path);
    requireThat(
      Array.isArray(entry.passedTitles) &&
        entry.passedTitles.length > 0 &&
        entry.passedTitles.every(
          (title) =>
            typeof title === 'string' &&
            title.trim() === title &&
            title.length > 0,
        ) &&
        new Set(entry.passedTitles).size === entry.passedTitles.length,
      'INVALID_OWNER_CONTRACT',
    );
    for (const title of entry.passedTitles) {
      requireThat(!seenTitles.has(title), 'DUPLICATE_OWNER_TITLE');
      seenTitles.add(title);
    }
  }
  requireThat(
    contract.brand.path === BRAND_PATH &&
      contract.storage.every((entry) => STORAGE_PATHS.includes(entry.path)),
    'INVALID_OWNER_PATH',
  );
  return contract;
}
export function validateReport(report, contracts, child) {
  requireThat(
    child.exitCode === 0 && !child.signal && !child.timedOut,
    'CHILD_FAILED',
  );
  requireThat(
    report &&
      Array.isArray(report.testResults) &&
      report.testResults.length > 0 &&
      report.success === true,
    'INVALID_REPORT',
  );
  const result = [];
  const matched = new Set();
  for (const file of report.testResults) {
    const contract = contracts.find((entry) =>
      file.name?.replaceAll('\\', '/').endsWith(`/${entry.file}`),
    );
    requireThat(
      contract && !matched.has(contract.file),
      'UNEXPECTED_TEST_FILE',
    );
    matched.add(contract.file);
    requireThat(
      Array.isArray(file.assertionResults) && file.assertionResults.length > 0,
      'EMPTY_REPORT',
    );
    const passed = [];
    const skipped = [];
    for (const assertion of file.assertionResults) {
      requireThat(
        typeof assertion.fullName === 'string' && assertion.fullName.length > 0,
        'INVALID_ASSERTION',
      );
      if (assertion.status === 'passed') passed.push(assertion.fullName);
      else if (['pending', 'skipped'].includes(assertion.status))
        skipped.push(assertion.fullName);
      else throw new AcceptanceError('TEST_NOT_PASSED');
    }
    requireThat(
      new Set([...passed, ...skipped]).size === passed.length + skipped.length,
      'DUPLICATE_TEST',
    );
    requireThat(
      passed.length > 0 &&
        (contract.count == null || passed.length === contract.count),
      'CASE_COUNT_MISMATCH',
    );
    if (contract.titles)
      requireThat(
        [...passed].sort().join('\n') ===
          [...contract.titles].sort().join('\n'),
        'CASE_TITLES_MISMATCH',
      );
    requireThat(
      [...skipped].sort().join('\n') ===
        [...(contract.skipped ?? [])].sort().join('\n'),
      'UNEXPECTED_SKIP',
    );
    result.push({
      file: contract.file,
      passedTitles: passed,
      skippedTitles: skipped,
      passed: passed.length,
      skipped: skipped.length,
    });
  }
  requireThat(matched.size === contracts.length, 'MISSING_TEST_FILE');
  return result;
}
export function parseDatasetRecords(output, mode) {
  requireThat(['diagnostic', 'matrix'].includes(mode), 'INVALID_DATASET_MODE');
  const records = output.split('\n').flatMap((line) => {
    const start = line.indexOf('{');
    if (start < 0) {
      requireThat(
        !/dataset(?:Benchmark|Diagnostic)/.test(line),
        'MALFORMED_DATASET_RECORD',
      );
      return [];
    }
    try {
      const value = JSON.parse(line.slice(start));
      return value &&
        typeof value === 'object' &&
        (Object.hasOwn(value, 'datasetDiagnostic') ||
          Object.hasOwn(value, 'datasetBenchmark'))
        ? [value]
        : [];
    } catch {
      requireThat(
        !/dataset(?:Benchmark|Diagnostic)/.test(line),
        'MALFORMED_DATASET_RECORD',
      );
      return [];
    }
  });
  const expected =
    mode === 'diagnostic'
      ? ['consented:10000:1', 'consented:100000:1']
      : [1000, 10000, 100000]
          .flatMap((size) =>
            ['owned', 'consented'].flatMap((kind) =>
              [0, 1, 2, 3].map((run) => `${kind}:${size}:${run}`),
            ),
          )
          .concat('mixed:10000:1');
  requireThat(records.length === expected.length, 'DATASET_RECORD_COUNT');
  const seen = new Set();
  for (const record of records) {
    const identity = `${record.kind}:${record.size}:${record.run}`;
    requireThat(
      expected.includes(identity) && !seen.has(identity),
      'DATASET_COVERAGE',
    );
    seen.add(identity);
    requireThat(
      mode === 'diagnostic'
        ? record.datasetDiagnostic === true &&
            record.datasetBenchmark === false &&
            record.samplePurpose === 'diagnostic-only-not-matrix-acceptance'
        : record.datasetBenchmark === true &&
            !record.datasetDiagnostic &&
            record.samplePurpose ===
              (record.run === 0 ? 'matrix-warmup' : 'matrix-measurement'),
      'DATASET_PURPOSE',
    );
    const cap = record.kind === 'owned' ? 30000 : 60000;
    for (const field of [
      'elapsedMs',
      'transactionElapsedMs',
      'queries',
      'candidatePages',
      'graphBatches',
      'secondaryGraphBatches',
      'decisionLockBatches',
      'maxBindParameters',
      'graphNodesMaxPass',
      'graphEdgesMaxPass',
      'selectedRows',
    ])
      requireThat(
        Number.isFinite(record[field]) && record[field] >= 0,
        'DATASET_METRIC',
      );
    const rows = record.size + (record.kind === 'mixed' ? 1 : 0);
    const bound =
      record.kind === 'owned'
        ? 8 + Math.ceil(record.size / 1000)
        : 52 +
          3 * record.candidatePages +
          3 * (record.graphBatches + record.secondaryGraphBatches) +
          3 * record.decisionLockBatches +
          Math.ceil(rows / 1000) +
          Math.ceil((record.size + 10) / 1000);
    requireThat(
      record.elapsedMs <= cap &&
        record.transactionElapsedMs <= cap &&
        record.queries <= bound &&
        record.queries <= (record.kind === 'owned' ? bound : 6000) &&
        record.maxBindParameters <= 32767 &&
        record.selectedRows === rows &&
        record.graphNodesMaxPass ===
          (record.kind === 'owned' ? 0 : 4 * record.size + 21) &&
        record.graphEdgesMaxPass ===
          (record.kind === 'owned' ? 0 : 6 * record.size + 200),
      'DATASET_LIMIT',
    );
  }
  return records;
}
export function validateCrunManifest(manifest, directory) {
  exactKeys(
    manifest,
    ['version', 'schema', 'ownedDirectory', 'redisKeys'],
    'CRUN_OWNERSHIP',
  );
  const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  const keyPattern = new RegExp(
    `^(?:crun:requests:[a-f0-9]{64}|crun:quote:${uuid}:${uuid}:${uuid}(?::consumed)?)$`,
  );
  requireThat(
    manifest.version === 1 &&
      manifest.ownedDirectory === directory &&
      (manifest.schema === null ||
        /^crun_flow_[a-f0-9]{32}$/.test(manifest.schema)) &&
      Array.isArray(manifest.redisKeys) &&
      manifest.redisKeys.length <= 1024 &&
      new Set(manifest.redisKeys).size === manifest.redisKeys.length &&
      manifest.redisKeys.every(
        (key) => typeof key === 'string' && keyPattern.test(key),
      ),
    'CRUN_OWNERSHIP',
  );
  return manifest;
}
export function encryptEvidence(payload, identity, pem) {
  const { key, fingerprint } = validatePublicKey(pem);
  requireThat(identity.fingerprint === fingerprint, 'KEY_MISMATCH');
  const aad = {
    version: 1,
    candidateSHA: identity.candidateSHA,
    controlSHA: identity.controlSHA,
    group: identity.group,
    fingerprint,
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  requireThat(bytes.length <= RAW_LIMIT * 1.4 + 65536, 'RAW_LIMIT');
  const secret = randomBytes(32);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, nonce);
  cipher.setAAD(Buffer.from(JSON.stringify(aad)));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const envelope = {
    ...aad,
    cipher: 'AES-256-GCM',
    wrapping: 'RSA-OAEP-SHA256',
    wrappedKey: publicEncrypt(
      { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      secret,
    ).toString('base64'),
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
  secret.fill(0);
  requireThat(
    Buffer.byteLength(JSON.stringify(envelope)) <= ENVELOPE_LIMIT,
    'ENVELOPE_LIMIT',
  );
  return envelope;
}
async function privateFile(file, bytes) {
  const handle = await open(file, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}
async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}`;
  await privateFile(temporary, JSON.stringify(value));
  await rename(temporary, file);
}
export async function safeFile(root, relative, max = RAW_LIMIT) {
  requireThat(
    !path.isAbsolute(relative) &&
      relative
        .split('/')
        .every((part) => part && part !== '.' && part !== '..'),
    'UNSAFE_EVIDENCE_PATH',
  );
  const file = path.join(root, relative);
  requireThat(
    (await realpath(path.dirname(file))) === path.dirname(file),
    'UNSAFE_EVIDENCE_FILE',
  );
  const handle = await open(
    file,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    const metadata = await handle.stat();
    requireThat(
      metadata.isFile() &&
        metadata.size <= max &&
        (metadata.mode & 0o777) === 0o600 &&
        metadata.uid === process.getuid(),
      'UNSAFE_EVIDENCE_FILE',
    );
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
async function verifySource(repo, entry) {
  const file = path.join(repo, entry.path);
  const metadata = await lstat(file);
  requireThat(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      (await realpath(file)) === file,
    'UNSAFE_SOURCE',
  );
  requireThat(
    sha256(await readFile(file)) === entry.sha256,
    'SOURCE_HASH_MISMATCH',
  );
}
const activeGroups = new Set();
let cancelled = false;
export async function runBounded({
  executable,
  args,
  cwd,
  env,
  stdoutPath,
  stderrPath,
  timeoutMs,
  graceMs = 10000,
  cleanup = async () => {},
}) {
  requireThat(
    timeoutMs > 0 && Number.isFinite(timeoutMs) && graceMs >= 0,
    'INVALID_BUDGET',
  );
  const started = Date.now();
  let child;
  let streams = [];
  const flows = [];
  let timer;
  let grace;
  let closed;
  const result = {
    exitCode: null,
    signal: null,
    timedOut: false,
    outputLimit: false,
    spawnError: null,
    streamError: null,
    cleanupError: null,
  };
  const kill = (signal) => {
    if (child?.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') result.spawnError ??= 'TERMINATION_FAILED';
      }
    }
  };
  const terminate = () => {
    kill('SIGTERM');
    if (!grace) grace = setTimeout(() => kill('SIGKILL'), graceMs);
  };
  try {
    await privateFile(stdoutPath, '');
    await privateFile(stderrPath, '');
    streams = [stdoutPath, stderrPath].map((file) =>
      createWriteStream(file, { flags: 'a', mode: 0o600 }),
    );
    for (const stream of streams)
      stream.on('error', () => {
        result.streamError = 'STREAM_FAILED';
        terminate();
      });
    child = spawn(executable, args, {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeGroups.add(child.pid);
    closed = new Promise((resolve) => {
      child.once('error', () => {
        result.spawnError = 'SPAWN_FAILED';
      });
      child.once('close', (exitCode, signal) => {
        result.exitCode = exitCode;
        result.signal = signal;
        resolve();
      });
    });
    let bytes = 0;
    for (const [stream, target] of [
      [child.stdout, streams[0]],
      [child.stderr, streams[1]],
    ]) {
      stream.on('error', () => {
        result.streamError = 'STREAM_FAILED';
        terminate();
      });
      const limiter = new Transform({
        transform(chunk, _encoding, callback) {
          const retained = Math.min(
            chunk.length,
            Math.max(0, RAW_LIMIT - bytes),
          );
          bytes += retained;
          if (retained) this.push(chunk.subarray(0, retained));
          if (retained < chunk.length && !result.outputLimit) {
            result.outputLimit = true;
            terminate();
          }
          callback();
        },
      });
      limiter.on('error', () => {
        result.streamError = 'STREAM_FAILED';
        terminate();
      });
      // The shared Transform budget retains a bounded failed prefix and drains
      // remaining bytes during termination without writing them to disk.
      flows.push(
        pipeline(stream, limiter, target).catch(() => {
          result.streamError = 'STREAM_FAILED';
          terminate();
        }),
      );
    }
    timer = setTimeout(() => {
      result.timedOut = true;
      terminate();
    }, timeoutMs);
    await closed;
  } catch {
    result.spawnError ??= 'CHILD_CONTROL_FAILED';
  } finally {
    kill('SIGKILL');
    if (closed) await closed;
    clearTimeout(timer);
    clearTimeout(grace);
    await Promise.all(flows);
    for (const stream of flows.length ? [] : streams) {
      if (!stream.closed && !stream.writableFinished)
        await new Promise((resolve) => {
          stream.once('error', resolve);
          stream.once('finish', resolve);
          stream.end();
        });
    }
    activeGroups.delete(child?.pid);
    try {
      await cleanup();
    } catch (error) {
      result.cleanupError = error.code ?? 'CLEANUP_FAILED';
    }
  }
  return { ...result, elapsedMs: Date.now() - started };
}
async function captureCommand(executable, args, cwd, env, timeoutMs = 15000) {
  const child = spawn(executable, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeGroups.add(child.pid);
  let output = '';
  let size = 0;
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }, timeoutMs);
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (data) => {
      size += data.length;
      if (size <= 16384) output += data;
      else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }
    });
    child.stderr.resume();
    child.once('error', () =>
      reject(new AcceptanceError('PREPARATION_FAILED')),
    );
    child.once('close', (code) => {
      activeGroups.delete(child.pid);
      clearTimeout(timer);
      if (code !== 0 || size > 16384)
        reject(new AcceptanceError('PREPARATION_FAILED'));
      else resolve(output.trim());
    });
  });
}
async function head(repo) {
  return captureCommand('git', ['rev-parse', 'HEAD'], repo, process.env);
}
export function validateTiming(group, value, now = Date.now()) {
  const startedAt = Number(value);
  const wall = {
    final: 3600000,
    'dataset-diagnostic': 1200000,
    'visual-isolation': 1500000,
    'visual-connected': 6300000,
  }[group];
  requireThat(
    Number.isSafeInteger(startedAt) &&
      startedAt > 0 &&
      startedAt <= now &&
      wall &&
      now < startedAt + wall,
    'INVALID_JOB_TIMESTAMP',
  );
  return {
    startedAt,
    overallDeadline: startedAt + wall,
    setupDeadline:
      startedAt +
      (group === 'visual-connected'
        ? 720000
        : group === 'visual-isolation'
          ? 300000
          : wall - 120000),
  };
}
export function workBudget(identity, now = Date.now()) {
  const reserve = identity.group === 'visual-connected' ? 300000 : 120000;
  requireThat(
    Number.isSafeInteger(identity.overallDeadline) &&
      identity.overallDeadline - reserve > now,
    'AGGREGATE_DEADLINE',
  );
  return identity.overallDeadline - reserve;
}
export async function createState(options, env) {
  readPostgresCredentials(env);
  const { fingerprint } = validatePublicKey(env.RUNTIME_ACCEPTANCE_PUBLIC_KEY);
  const timing = validateTiming(
    options.group,
    env.RUNTIME_ACCEPTANCE_JOB_STARTED_MS,
  );
  requireThat(
    process.platform === 'linux' && /^v24\./.test(process.version),
    'HOST_PREREQUISITE',
  );
  const repo = await realpath(options.repo);
  const parent = await realpath(path.dirname(options.state));
  const runnerTemp = await realpath(env.RUNNER_TEMP ?? '');
  requireThat(
    parent === runnerTemp || parent.startsWith(`${runnerTemp}/`),
    'STATE_OUTSIDE_RUNNER_TEMP',
  );
  requireThat(
    parent === path.dirname(options.state) && repo === options.repo,
    'UNSAFE_STATE_PATH',
  );
  const candidateSHA = options['candidate-sha'];
  const controlSHA = options['control-sha'];
  requireThat(
    (await head(repo)) ===
      (options.group === 'dataset-diagnostic' ? controlSHA : candidateSHA),
    'CHECKOUT_MISMATCH',
  );
  if (options.group === 'final') {
    const contract = validateOwnerContract(
      env.RUNTIME_ACCEPTANCE_OWNER_CONTRACT,
    );
    for (const entry of [contract.brand, ...contract.storage])
      await verifySource(repo, entry);
  }
  await mkdir(options.state, { mode: 0o700 });
  await chmod(options.state, 0o700);
  const metadata = await lstat(options.state);
  const identity = {
    version: 1,
    state: options.state,
    repo,
    candidateSHA,
    controlSHA,
    group: options.group,
    fingerprint,
    phase: 'prepared',
    ...timing,
    device: metadata.dev,
    inode: metadata.ino,
    evidence: [],
    resources: { databases: [], containers: [] },
  };
  await privateFile(
    path.join(options.state, 'identity.json'),
    JSON.stringify(identity),
  );
  await mkdir(path.join(options.state, 'raw'), { mode: 0o700 });
  return identity;
}
export async function loadState(options, env) {
  const metadata = await lstat(options.state);
  requireThat(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      (metadata.mode & 0o777) === 0o700 &&
      (await realpath(options.state)) === options.state,
    'UNSAFE_STATE',
  );
  const identity = JSON.parse(
    await safeFile(options.state, 'identity.json', 65536),
  );
  const expectedTiming = validateTiming(
    identity.group,
    identity.startedAt,
    identity.startedAt,
  );
  requireThat(
    identity.overallDeadline === expectedTiming.overallDeadline &&
      identity.setupDeadline === expectedTiming.setupDeadline,
    'STATE_DEADLINE_MISMATCH',
  );
  const { fingerprint } = validatePublicKey(env.RUNTIME_ACCEPTANCE_PUBLIC_KEY);
  requireThat(
    identity.version === 1 &&
      identity.state === options.state &&
      identity.repo === (await realpath(options.repo)) &&
      identity.candidateSHA === options['candidate-sha'] &&
      identity.controlSHA === options['control-sha'] &&
      identity.fingerprint === fingerprint &&
      identity.device === metadata.dev &&
      identity.inode === metadata.ino &&
      GROUPS.includes(identity.group),
    'STATE_IDENTITY_MISMATCH',
  );
  return identity;
}
async function diskGuard(repo) {
  const disk = await statfs(repo);
  requireThat(
    Number(disk.bavail) * Number(disk.bsize) >= 10 * 1024 ** 3,
    'DISK_PREREQUISITE',
  );
}
function serviceId(value) {
  requireThat(/^[a-f0-9]{12,64}$/.test(value ?? ''), 'SERVICE_ID_REQUIRED');
  return value;
}
export function databaseUrl(name, credentials) {
  validateCredentials(credentials);
  const url = new URL('postgresql://127.0.0.1:5432');
  url.username = credentials.username;
  url.password = credentials.password;
  url.pathname = `/${name}`;
  return url.href;
}
export function postgresClientInvocation(containerId, psqlArgs, credentials) {
  validateCredentials(credentials);
  return {
    args: [
      'exec',
      '--env',
      'PGPASSWORD',
      serviceId(containerId),
      'psql',
      '-U',
      'genfeed',
      ...psqlArgs,
    ],
    env: { PGPASSWORD: credentials.password },
  };
}
async function persistIdentity(identity) {
  await atomicJson(path.join(identity.state, 'identity.json'), identity);
}
async function execution(identity, env) {
  const credentials = readPostgresCredentials(env);
  requireThat(identity.phase === 'prepared', 'INVALID_PHASE');
  identity.phase = 'running';
  await persistIdentity(identity);
  const completed = [];
  const failures = [];
  const commands = [];
  const serviceVersions = {};
  const deadline =
    identity.overallDeadline -
    (identity.group === 'visual-connected' ? 300000 : 120000);
  let phaseDeadline = ['visual-connected', 'visual-isolation'].includes(
    identity.group,
  )
    ? identity.setupDeadline
    : deadline;
  const capture = (executable, args, cwd, commandEnv, timeoutMs = 15000) => {
    requireThat(
      !cancelled && Date.now() < phaseDeadline,
      cancelled ? 'CANCELLED' : 'AGGREGATE_DEADLINE',
    );
    return captureCommand(
      executable,
      args,
      cwd,
      commandEnv,
      Math.min(timeoutMs, phaseDeadline - Date.now()),
    );
  };
  const cleanupCapture = (
    executable,
    args,
    cwd,
    commandEnv,
    timeoutMs = 15000,
  ) => {
    requireThat(Date.now() < identity.overallDeadline, 'CLEANUP_DEADLINE');
    return captureCommand(
      executable,
      args,
      cwd,
      commandEnv,
      Math.min(timeoutMs, identity.overallDeadline - Date.now()),
    );
  };
  const privateEnv = {
    ...env,
    NODE_ENV: 'test',
    TURBO_TOKEN: '',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    NODE_OPTIONS: '--max-old-space-size=2048',
    REPLICATE_API_TOKEN: 'test-mock-key',
    STRIPE_SECRET_KEY: 'test-mock-key',
    BETTER_AUTH_SECRET: 'test-better-auth-secret',
  };
  delete privateEnv.RUNTIME_ACCEPTANCE_POSTGRES_USER;
  delete privateEnv.RUNTIME_ACCEPTANCE_POSTGRES_PASSWORD;
  delete privateEnv.LEARNING_DATASET_PROFILE;
  delete privateEnv.LEARNING_DATASET_BENCHMARK;
  const save = async (relative, bytes) => {
    await privateFile(path.join(identity.state, relative), bytes);
    identity.evidence.push(relative);
    await persistIdentity(identity);
  };
  const run = async (
    stage,
    executable,
    args,
    cwd,
    extra,
    timeout,
    grace = 10000,
  ) => {
    requireThat(!cancelled, 'CANCELLED');
    requireThat(
      Date.now() + grace + 15000 < Math.min(deadline, phaseDeadline),
      'AGGREGATE_DEADLINE',
    );
    await diskGuard(identity.repo);
    const stdoutPath = path.join(
      identity.state,
      `raw/${stage}-${commands.length}.stdout`,
    );
    const stderrPath = path.join(
      identity.state,
      `raw/${stage}-${commands.length}.stderr`,
    );
    identity.evidence.push(
      path.relative(identity.state, stdoutPath),
      path.relative(identity.state, stderrPath),
    );
    await persistIdentity(identity);
    const result = await runBounded({
      executable,
      args,
      cwd,
      env: { ...privateEnv, ...extra },
      stdoutPath,
      stderrPath,
      timeoutMs: Math.min(
        timeout,
        Math.min(deadline, phaseDeadline) - Date.now(),
      ),
      graceMs: grace,
    });
    commands.push({ stage, ...result });
    requireThat(
      result.exitCode === 0 &&
        !result.signal &&
        !result.timedOut &&
        !result.outputLimit &&
        !result.spawnError &&
        !result.streamError &&
        !result.cleanupError,
      'CHILD_FAILED',
    );
    return { result, stdoutPath };
  };
  const vitest = async (
    stage,
    contracts,
    {
      cwd = 'apps/server/api',
      config = 'vitest.config.ts',
      heap = 2048,
      extra = {},
      timeout = 165000,
      pattern,
      pool,
    } = {},
  ) => {
    const reportRelative = `raw/${stage}.report.json`;
    const reportPath = path.join(identity.state, reportRelative);
    identity.evidence.push(reportRelative);
    await persistIdentity(identity);
    const args = [
      `--max-old-space-size=${heap}`,
      path.join(identity.repo, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      config,
      '--maxWorkers=1',
      '--no-file-parallelism',
      '--reporter=json',
      '--passWithNoTests=false',
      `--outputFile=${reportPath}`,
      ...contracts.map((entry) => entry.file),
    ];
    if (pattern) args.push('--testNamePattern', pattern);
    if (pool) args.push(`--pool=${pool}`);
    let child;
    let failure;
    try {
      child = await run(
        stage,
        process.execPath,
        args,
        path.join(identity.repo, cwd),
        { ...extra, NODE_OPTIONS: `--max-old-space-size=${heap}` },
        timeout,
      );
    } catch (error) {
      failure = error;
    } finally {
      try {
        const metadata = await lstat(reportPath);
        requireThat(
          metadata.isFile() && !metadata.isSymbolicLink(),
          'UNSAFE_REPORT',
        );
        await chmod(reportPath, 0o600);
      } catch (error) {
        if (error.code !== 'ENOENT') failure ??= error;
      }
    }
    if (failure) throw failure;
    const { result, stdoutPath } = child;
    const report = JSON.parse(await safeFile(identity.state, reportRelative));
    const cases = validateReport(report, contracts, result);
    completed.push({ stage, cases });
    return readFile(stdoutPath, 'utf8');
  };
  const database = async (name) => {
    const url = databaseUrl(name, credentials);
    validateUrl(url, 'postgres', name, credentials);
    const id = serviceId(identity.resources.postgres);
    const exists = await capture(
      'docker',
      postgresClientInvocation(
        id,
        [
          '-d',
          'test',
          '-tAc',
          `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
        ],
        credentials,
      ).args,
      identity.repo,
      { ...privateEnv, ...postgresClientInvocation(id, [], credentials).env },
    );
    requireThat(exists === '', 'DATABASE_ALREADY_EXISTS');
    identity.resources.databases.push({ name, created: false });
    await persistIdentity(identity);
    await capture(
      'docker',
      postgresClientInvocation(
        id,
        [
          '-d',
          'test',
          '-v',
          'ON_ERROR_STOP=1',
          '-c',
          `CREATE DATABASE "${name}"`,
        ],
        credentials,
      ).args,
      identity.repo,
      { ...privateEnv, ...postgresClientInvocation(id, [], credentials).env },
    );
    identity.resources.databases.at(-1).created = true;
    await persistIdentity(identity);
    return url;
  };
  const migrate = async (stage, url) => {
    await run(
      stage,
      'bun',
      ['x', 'prisma', 'migrate', 'deploy'],
      path.join(identity.repo, 'packages/prisma'),
      { DATABASE_URL: url },
      570000,
    );
    completed.push({ stage });
  };
  const attempt = async (stage, work) => {
    try {
      await work();
    } catch (error) {
      failures.push({ stage, code: error.code ?? 'EXECUTION_FAILED' });
    }
  };
  let coordinator;
  const cleanupResult = { passed: true, operations: [] };
  try {
    workBudget(identity);
    requireThat(
      (await head(identity.repo)) === identity.candidateSHA,
      'CHECKOUT_MISMATCH',
    );
    if (identity.group === 'visual-connected') {
      for (const [kind, image, port] of [
        ['postgres', 'pgvector/pgvector:pg17', '5432'],
        ['redis', 'redis:7', '6379'],
      ]) {
        const name = `runtime-acceptance-${kind}-${randomUUID()}`;
        identity.resources.containers.push({ name, id: null });
        await persistIdentity(identity);
        const args = [
          'run',
          '-d',
          '--name',
          name,
          '-p',
          `127.0.0.1:${port}:${port}`,
        ];
        if (kind === 'postgres')
          args.push(
            '--env',
            'POSTGRES_USER',
            '--env',
            'POSTGRES_PASSWORD',
            '--env',
            'POSTGRES_DB',
          );
        args.push(image);
        const id = serviceId(
          await capture(
            'docker',
            args,
            identity.repo,
            kind === 'postgres'
              ? {
                  ...privateEnv,
                  POSTGRES_USER: credentials.username,
                  POSTGRES_PASSWORD: credentials.password,
                  POSTGRES_DB: 'test',
                }
              : privateEnv,
            120000,
          ),
        );
        identity.resources.containers.at(-1).id = id;
        identity.resources[kind] = id;
        await persistIdentity(identity);
      }
      for (let index = 0; index < 60; index++) {
        try {
          await capture(
            'docker',
            [
              'exec',
              identity.resources.postgres,
              'pg_isready',
              '-U',
              'genfeed',
              '-d',
              'test',
            ],
            identity.repo,
            privateEnv,
          );
          await capture(
            'docker',
            ['exec', identity.resources.redis, 'redis-cli', 'ping'],
            identity.repo,
            privateEnv,
          );
          break;
        } catch {
          requireThat(index < 59, 'SERVICE_NOT_READY');
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } else if (identity.group !== 'visual-isolation') {
      identity.resources.postgres = serviceId(
        env.RUNTIME_ACCEPTANCE_POSTGRES_ID,
      );
      if (identity.group === 'final')
        identity.resources.redis = serviceId(env.RUNTIME_ACCEPTANCE_REDIS_ID);
      await persistIdentity(identity);
    }
    if (identity.resources.postgres)
      serviceVersions.postgres = await capture(
        'docker',
        postgresClientInvocation(
          identity.resources.postgres,
          ['-d', 'test', '-tAc', 'SHOW server_version'],
          credentials,
        ).args,
        identity.repo,
        {
          ...privateEnv,
          ...postgresClientInvocation(
            identity.resources.postgres,
            [],
            credentials,
          ).env,
        },
      );
    if (identity.resources.redis)
      serviceVersions.redis = await capture(
        'docker',
        ['exec', identity.resources.redis, 'redis-cli', 'INFO', 'server'],
        identity.repo,
        privateEnv,
      );
    if (['final', 'dataset-diagnostic'].includes(identity.group))
      await attempt('dataset', async () => {
        const url = await database('genfeed_dataset_5781_test');
        const datasetEnv = {
          LEARNING_DATASET_TEST_DATABASE_URL: url,
          LEARNING_DATASET_PROFILE: '',
          LEARNING_DATASET_BENCHMARK: '',
        };
        const correctnessDeadline = Date.now() + 330000;
        await vitest(
          'dataset-correctness',
          [
            { file: DATASET_UNIT, count: 23 },
            {
              file: DATASET_PG,
              count: 7,
              titles: PG_TITLES,
              skipped: [MATRIX_TITLE, DIAGNOSTIC_TITLE],
            },
          ],
          {
            heap: 4096,
            extra: datasetEnv,
            timeout: correctnessDeadline - Date.now(),
          },
        );
        const config = path.join(
          identity.repo,
          `apps/server/api/.runtime-acceptance-${randomUUID()}.json`,
        );
        try {
          await privateFile(
            config,
            JSON.stringify({
              extends: './tsconfig.typecheck.specs.json',
              include: [],
              exclude: [],
              files: [
                'learning-dataset.service.ts',
                'learning-dataset-graph.service.ts',
                'learning-dataset.service.spec.ts',
                'learning-dataset.postgres.spec.ts',
              ].map((file) =>
                path.join(
                  identity.repo,
                  'apps/server/api',
                  DATASET_DIRECTORY,
                  file,
                ),
              ),
            }),
          );
          await run(
            'dataset-typecheck',
            process.execPath,
            [
              '--max-old-space-size=4096',
              path.join(identity.repo, 'node_modules/typescript/bin/tsc'),
              '--noEmit',
              '-p',
              config,
            ],
            identity.repo,
            { NODE_OPTIONS: '--max-old-space-size=4096' },
            correctnessDeadline - Date.now(),
          );
          completed.push({ stage: 'dataset-typecheck' });
        } finally {
          await rm(config, { force: true });
        }
        const diagnostic = identity.group === 'dataset-diagnostic';
        const stage = diagnostic ? 'dataset-diagnostic' : 'dataset-matrix';
        const stdout = await vitest(
          stage,
          [
            {
              file: DATASET_PG,
              count: 1,
              titles: [diagnostic ? DIAGNOSTIC_TITLE : MATRIX_TITLE],
              skipped: [
                ...PG_TITLES,
                diagnostic ? MATRIX_TITLE : DIAGNOSTIC_TITLE,
              ],
            },
          ],
          {
            heap: 4096,
            extra: {
              ...datasetEnv,
              ...(diagnostic
                ? { LEARNING_DATASET_PROFILE: '1' }
                : { LEARNING_DATASET_BENCHMARK: '1' }),
            },
            timeout: diagnostic ? 330000 : 1170000,
            pattern: diagnostic
              ? 'profiles one 10k and one 100k consented snapshot'
              : 'measures 1k/10k/100k',
          },
        );
        const records = parseDatasetRecords(
          stdout,
          diagnostic ? 'diagnostic' : 'matrix',
        );
        await save(`raw/${stage}.records.json`, JSON.stringify(records));
      });
    if (identity.group === 'final') {
      const contract = validateOwnerContract(
        env.RUNTIME_ACCEPTANCE_OWNER_CONTRACT,
      );
      await attempt('brand', async () => {
        const url = await database('genfeed_4617_ed1f_test');
        const brandEnv = { BRANDED_GENERATION_TEST_DATABASE_URL: url };
        const preparationDeadline = Date.now() + 570000;
        for (const command of ['db:validate', 'db:generate', 'db:migrate'])
          await run(
            'brand-preparation',
            'bun',
            ['run', command],
            path.join(identity.repo, 'packages/prisma'),
            { DATABASE_URL: url },
            preparationDeadline - Date.now(),
          );
        completed.push({ stage: 'brand-preparation' });
        await vitest(
          'brand-migration',
          [{ file: 'prisma/branded-generation-receipt-migration.test.ts' }],
          { cwd: 'packages/prisma', extra: brandEnv, timeout: 105000 },
        );
        // The owner contract freezes integration cases; unit suites still require
        // nonzero execution and reject every skip in each collected file.
        const unitDirectory = 'src/services/branded-generation-receipts';
        const units = (
          await readdir(
            path.join(identity.repo, 'apps/server/api', unitDirectory),
          )
        )
          .filter((file) => file.endsWith('.spec.ts'))
          .map((file) => ({ file: `${unitDirectory}/${file}` }));
        requireThat(units.length > 0, 'MISSING_BRAND_UNITS');
        await vitest('brand-units', units, {
          extra: brandEnv,
          timeout: 105000,
        });
        await vitest(
          'brand-contracts',
          [
            {
              file: 'src/api-types/contracts/branded-generation.contract.test.ts',
            },
          ],
          { cwd: 'packages/contracts', extra: brandEnv, timeout: 45000 },
        );
        await vitest(
          'brand-serializers',
          [{ file: '__tests__/branded-generation-receipt.serializer.test.ts' }],
          { cwd: 'packages/serializers', extra: brandEnv, timeout: 45000 },
        );
        await vitest(
          'brand-integration',
          [
            {
              file: BRAND_PATH.slice('apps/server/api/'.length),
              titles: contract.brand.passedTitles,
            },
          ],
          { config: 'vitest.config.e2e.ts', extra: brandEnv, timeout: 285000 },
        );
      });
      await attempt('storage', () =>
        vitest(
          'storage',
          contract.storage.map((entry) => ({
            file: entry.path.slice('packages/storage/'.length),
            titles: entry.passedTitles,
          })),
          { cwd: 'packages/storage', timeout: 165000 },
        ),
      );
      await attempt('crun', async () => {
        const url = await database('genfeed_crun_test');
        const redis = 'redis://127.0.0.1:6379/11';
        validateUrl(redis, 'redis');
        const uuid = randomUUID();
        const manifest = `/tmp/crun-run-${uuid}.json`;
        const directory = `/tmp/crun-owned-${uuid}`;
        identity.resources.crun = { uuid, manifest, directory };
        await persistIdentity(identity);
        await mkdir(directory, { mode: 0o700 });
        await privateFile(
          manifest,
          JSON.stringify({
            version: 1,
            schema: null,
            ownedDirectory: directory,
            redisKeys: [],
          }),
        );
        for (const [key, target] of [
          ['manifest', manifest],
          ['directory', directory],
        ]) {
          const metadata = await lstat(target);
          identity.resources.crun[`${key}Metadata`] = {
            device: metadata.dev,
            inode: metadata.ino,
            realpath: await realpath(target),
          };
        }
        await persistIdentity(identity);
        await vitest(
          'crun',
          [
            {
              file: 'src/services/integrations/crun/crun-image-flow.integration.spec.ts',
              count: 18,
            },
          ],
          {
            pool: 'forks',
            extra: {
              WORKFLOW_BILLING_TEST_DATABASE_URL: url,
              CRUN_TEST_REDIS_URL: redis,
              CRUN_TEST_RUN_MANIFEST: manifest,
              CRUN_TEST_OWNED_DIRECTORY: directory,
            },
            timeout: 60000,
          },
        );
      });
      await attempt('agent', async () => {
        const url = await database('genfeed_agent_test');
        const redis = 'redis://127.0.0.1:6379/12';
        validateUrl(redis, 'redis');
        await migrate('agent-preparation', url);
        const extra = { DATABASE_URL: url, REDIS_URL: redis };
        await vitest(
          'agent',
          [
            {
              file: 'test/integration/proactive-agent-runs.integration.spec.ts',
              count: 6,
              titles: AGENT_TITLES,
            },
          ],
          { config: 'vitest.config.e2e.ts', extra },
        );
        await vitest(
          'publisher',
          [
            'test/integration/batch-review-lock.integration.spec.ts',
            'test/integration/isolated-publish/approval-mint-enqueue.integration.spec.ts',
            'test/integration/isolated-publish/worker-publish-refusal.integration.spec.ts',
          ].map((file) => ({ file, count: 2 })),
          { config: 'vitest.config.e2e.ts', extra },
        );
      });
    }
    if (identity.group === 'visual-isolation')
      await attempt('visual-isolation', async () => {
        requireThat(Date.now() <= identity.setupDeadline, 'SETUP_DEADLINE');
        const directory = path.join(identity.state, 'raw/isolation');
        await mkdir(directory, { mode: 0o700 });
        const extra = {
          VISUAL_CODE_ARTIFACT_DIR: directory,
          VISUAL_CODE_ACCEPTANCE_HEAD: identity.candidateSHA,
          FFMPEG_BIN: '/usr/bin/ffmpeg',
        };
        serviceVersions.runsc = await capture(
          'runsc',
          ['--version'],
          identity.repo,
          privateEnv,
        );
        const protocolFiles = (
          await readdir(path.join(identity.repo, 'scripts/visual-code'))
        )
          .filter((file) => file.endsWith('.test.mjs'))
          .map((file) => `scripts/visual-code/${file}`);
        requireThat(protocolFiles.length > 0, 'MISSING_VISUAL_PROTOCOL');
        phaseDeadline = identity.startedAt + 480000;
        await run(
          'visual-protocol',
          process.execPath,
          ['--test', ...protocolFiles],
          identity.repo,
          extra,
          180000,
          0,
        );
        completed.push({ stage: 'visual-protocol' });
        phaseDeadline = identity.startedAt + 1380000;
        await run(
          'visual-isolation',
          process.execPath,
          ['scripts/visual-code/isolation-acceptance.mjs'],
          identity.repo,
          extra,
          900000,
          0,
        );
        completed.push({ stage: 'visual-isolation' });
      });
    if (identity.group === 'visual-connected')
      await attempt('visual', async () => {
        const url = await database('genfeed_visual_test');
        await migrate('visual-preparation', url);
        const visualRoot = path.join(identity.state, 'raw/visual');
        for (const directory of [
          visualRoot,
          path.join(visualRoot, 'artifacts'),
          path.join(visualRoot, 'media'),
          path.join(visualRoot, 'renderer'),
          path.join(visualRoot, 'isolation'),
        ])
          await mkdir(directory, { mode: 0o700 });
        const token = randomBytes(32).toString('hex');
        const extra = {
          DATABASE_URL: url,
          REDIS_URL: 'redis://127.0.0.1:6379/13',
          VISUAL_CODE_LOCAL_ACCEPTANCE: '1',
          VISUAL_CODE_LOCAL_RENDERER_URL: 'http://127.0.0.1:8789',
          VISUAL_CODE_LOCAL_RENDERER_TOKEN: token,
          VISUAL_CODE_LOCAL_REDIS_URL: 'redis://127.0.0.1:6379/13',
          VISUAL_CODE_LOCAL_ARTIFACT_DIR: path.join(visualRoot, 'artifacts'),
          VISUAL_CODE_LOCAL_MEDIA_DIR: path.join(visualRoot, 'media'),
          VISUAL_CODE_STATE_DIR: path.join(visualRoot, 'renderer'),
          VISUAL_CODE_RENDERER_TOKEN: token,
          FFMPEG_BIN: '/usr/bin/ffmpeg',
        };
        const observed = {
          gitHead: await head(identity.repo),
          platform: process.platform,
          nodeVersion: process.version,
          ffmpegVersion: (
            await capture(
              '/usr/bin/ffmpeg',
              ['-version'],
              identity.repo,
              privateEnv,
            )
          ).split('\n')[0],
          ffprobeVersion: (
            await capture('ffprobe', ['-version'], identity.repo, privateEnv)
          ).split('\n')[0],
          runscVersion: (
            await capture('runsc', ['--version'], identity.repo, privateEnv)
          ).split('\n')[0],
          imageId: await capture(
            'docker',
            [
              'image',
              'inspect',
              'genfeed-visual-code:4.0.530',
              '--format',
              '{{.Id}}',
            ],
            identity.repo,
            privateEnv,
          ),
          dockerRuntime: 'runsc',
          rendererVersion: '4.0.530',
        };
        const runtimes = JSON.parse(
          await capture(
            'docker',
            ['info', '--format', '{{json .Runtimes}}'],
            identity.repo,
            privateEnv,
          ),
        );
        requireThat(
          runtimes.runsc && /^sha256:[a-f0-9]{64}$/.test(observed.imageId),
          'VISUAL_RUNTIME_PREREQUISITE',
        );
        await privateFile(
          path.join(visualRoot, 'runtime-preflight.json'),
          JSON.stringify(observed),
        );
        await run(
          'visual-media',
          process.execPath,
          [
            'scripts/visual-code/create-fixture-media.mjs',
            extra.VISUAL_CODE_LOCAL_MEDIA_DIR,
          ],
          identity.repo,
          extra,
          120000,
        );
        const coordinatorOut = path.join(
          identity.state,
          'raw/coordinator.stdout',
        );
        const coordinatorErr = path.join(
          identity.state,
          'raw/coordinator.stderr',
        );
        await privateFile(coordinatorOut, '');
        await privateFile(coordinatorErr, '');
        identity.evidence.push(
          'raw/coordinator.stdout',
          'raw/coordinator.stderr',
        );
        const out = await open(coordinatorOut, 'a');
        const err = await open(coordinatorErr, 'a');
        coordinator = spawn(
          process.execPath,
          ['scripts/visual-code/coordinator.mjs'],
          {
            cwd: identity.repo,
            env: { ...privateEnv, ...extra },
            detached: true,
            stdio: ['ignore', out.fd, err.fd],
          },
        );
        activeGroups.add(coordinator.pid);
        await out.close();
        await err.close();
        identity.resources.coordinator = coordinator.pid;
        await persistIdentity(identity);
        coordinator.on('error', () => {});
        for (let index = 0; index < 60; index++) {
          try {
            const response = await fetch('http://127.0.0.1:8789/health', {
              headers: { authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(1000),
            });
            if (response.ok) {
              const health = await response.json();
              requireThat(
                health.rendererVersion === '4.0.530' ||
                  health.version === '4.0.530',
                'VISUAL_HEALTH_VERSION',
              );
              break;
            }
            throw new AcceptanceError('VISUAL_NOT_READY');
          } catch {
            requireThat(index < 59, 'VISUAL_NOT_READY');
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        requireThat(Date.now() <= identity.setupDeadline, 'SETUP_DEADLINE');
        phaseDeadline = identity.startedAt + 5820000;
        requireThat(
          identity.overallDeadline - Date.now() >= 5100000 + 180000 + 300000,
          'AGGREGATE_DEADLINE',
        );
        await vitest(
          'visual-connected',
          [
            {
              file: 'test/integration/visual-code/visual-code-local-runtime.integration.spec.ts',
              count: 5,
            },
          ],
          {
            config: 'vitest.config.e2e.ts',
            extra,
            timeout: 5100000,
            heap: 2048,
          },
        );
        phaseDeadline = identity.startedAt + 6000000;
        requireThat(
          identity.overallDeadline - Date.now() >= 180000 + 300000,
          'AGGREGATE_DEADLINE',
        );
        await vitest(
          'visual-library',
          [
            {
              file: 'test/integration/visual-code/visual-code-library.integration.spec.ts',
              count: 5,
            },
          ],
          { config: 'vitest.config.e2e.ts', extra, timeout: 180000 },
        );
      });
  } catch (error) {
    failures.push({
      stage: 'preparation',
      code: error.code ?? 'PREPARATION_FAILED',
    });
  } finally {
    if (identity.group === 'visual-connected') {
      const visualRoot = path.join(identity.state, 'raw/visual');
      const visit = async (relative) => {
        const root = path.join(visualRoot, relative);
        try {
          const metadata = await lstat(root);
          requireThat(
            metadata.isDirectory() && !metadata.isSymbolicLink(),
            'UNSAFE_EVIDENCE_FILE',
          );
          for (const entry of await readdir(root, { withFileTypes: true })) {
            const next = `${relative}/${entry.name}`;
            requireThat(!entry.isSymbolicLink(), 'UNSAFE_EVIDENCE_FILE');
            if (entry.isDirectory()) await visit(next);
            else {
              requireThat(entry.isFile(), 'UNSAFE_EVIDENCE_FILE');
              await chmod(path.join(visualRoot, next), 0o600);
              const file = `raw/visual/${next}`;
              if (!identity.evidence.includes(file))
                identity.evidence.push(file);
            }
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            cleanupResult.passed = false;
            failures.push({ stage: 'evidence', code: 'UNSAFE_EVIDENCE_FILE' });
          }
        }
      };
      for (const root of ['artifacts', 'media', 'isolation']) await visit(root);
      try {
        const file = 'raw/visual/runtime-preflight.json';
        await safeFile(identity.state, file);
        if (!identity.evidence.includes(file)) identity.evidence.push(file);
      } catch (error) {
        if (error.code !== 'ENOENT')
          failures.push({ stage: 'evidence', code: 'UNSAFE_EVIDENCE_FILE' });
      }
    }
    const clean = async (name, operation) => {
      try {
        await operation();
        cleanupResult.operations.push({ name, passed: true });
      } catch {
        cleanupResult.passed = false;
        cleanupResult.operations.push({ name, passed: false });
      }
    };
    if (coordinator?.pid)
      await clean('coordinator', async () => {
        try {
          process.kill(-coordinator.pid, 'SIGTERM');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
        await Promise.race([
          new Promise((resolve) => coordinator.once('close', resolve)),
          new Promise((resolve) => setTimeout(resolve, 10000)),
        ]);
        try {
          process.kill(-coordinator.pid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
        activeGroups.delete(coordinator.pid);
      });
    if (identity.resources.crun)
      await clean('crun-manifest', async () => {
        const resource = identity.resources.crun;
        requireThat(
          /^[a-f0-9-]{36}$/.test(resource.uuid) &&
            resource.manifest === `/tmp/crun-run-${resource.uuid}.json` &&
            resource.directory === `/tmp/crun-owned-${resource.uuid}`,
          'CRUN_OWNERSHIP',
        );
        const metadata = await lstat(resource.manifest);
        const saved = resource.manifestMetadata;
        // Owner atomically replaces the registered manifest. Its contents identify
        // the same UUID directory; inode replacement is therefore expected.
        requireThat(
          metadata.isFile() &&
            !metadata.isSymbolicLink() &&
            metadata.dev === saved.device &&
            metadata.uid === process.getuid() &&
            (metadata.mode & 0o777) === 0o600 &&
            (await realpath(resource.manifest)) === saved.realpath &&
            metadata.size <= 65536,
          'CRUN_OWNERSHIP',
        );
        const manifest = JSON.parse(
          await safeFile('/tmp', path.basename(resource.manifest), 65536),
        );
        validateCrunManifest(manifest, resource.directory);
        await save('raw/crun-manifest.json', JSON.stringify(manifest));
        if (manifest.schema)
          await cleanupCapture(
            'docker',
            postgresClientInvocation(
              identity.resources.postgres,
              [
                '-d',
                'genfeed_crun_test',
                '-v',
                'ON_ERROR_STOP=1',
                '-c',
                `DROP SCHEMA IF EXISTS "${manifest.schema}" CASCADE`,
              ],
              credentials,
            ).args,
            identity.repo,
            {
              ...privateEnv,
              ...postgresClientInvocation(
                identity.resources.postgres,
                [],
                credentials,
              ).env,
            },
          );
        if (manifest.redisKeys.length)
          await cleanupCapture(
            'docker',
            [
              'exec',
              identity.resources.redis,
              'redis-cli',
              '-n',
              '11',
              'DEL',
              ...manifest.redisKeys,
            ],
            identity.repo,
            privateEnv,
          );
        try {
          const current = await lstat(resource.directory);
          const owned = resource.directoryMetadata;
          requireThat(
            current.isDirectory() &&
              !current.isSymbolicLink() &&
              current.uid === process.getuid() &&
              (current.mode & 0o777) === 0o700 &&
              current.dev === owned.device &&
              current.ino === owned.inode &&
              (await realpath(resource.directory)) === owned.realpath,
            'CRUN_OWNERSHIP',
          );
          await rm(resource.directory, { recursive: true });
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        await rm(resource.manifest);
        try {
          const temporary = `${resource.manifest}.tmp`;
          const meta = await lstat(temporary);
          requireThat(
            meta.isFile() &&
              !meta.isSymbolicLink() &&
              meta.uid === process.getuid() &&
              (meta.mode & 0o777) === 0o600,
            'CRUN_OWNERSHIP',
          );
          await rm(temporary);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      });
    for (const { name, created } of [...identity.resources.databases].reverse())
      if (created)
        await clean('database', () =>
          cleanupCapture(
            'docker',
            postgresClientInvocation(
              serviceId(identity.resources.postgres),
              [
                '-d',
                'test',
                '-v',
                'ON_ERROR_STOP=1',
                '-c',
                `DROP DATABASE "${name}" WITH (FORCE)`,
              ],
              credentials,
            ).args,
            identity.repo,
            {
              ...privateEnv,
              ...postgresClientInvocation(
                serviceId(identity.resources.postgres),
                [],
                credentials,
              ).env,
            },
          ),
        );
    for (const container of identity.resources.containers)
      await clean('container', () =>
        cleanupCapture(
          'docker',
          ['rm', '-f', container.id ?? container.name],
          identity.repo,
          privateEnv,
        ),
      );
    if (['final', 'dataset-diagnostic'].includes(identity.group))
      for (const kind of ['redis', 'postgres'])
        if (identity.resources[kind])
          await clean('service-container', () =>
            cleanupCapture(
              'docker',
              ['rm', '-f', serviceId(identity.resources[kind])],
              identity.repo,
              privateEnv,
            ),
          );
    identity.phase = 'finished';
    await persistIdentity(identity);
    const missing = REQUIRED[identity.group].filter(
      (stage) => !completed.some((entry) => entry.stage === stage),
    );
    if (missing.length > 0)
      failures.push({ stage: 'coverage', code: 'INCOMPLETE_GROUPS' });
    outcome = {
      version: 1,
      candidateSHA: identity.candidateSHA,
      controlSHA: identity.controlSHA,
      group: identity.group,
      fingerprint: identity.fingerprint,
      status:
        failures.length === 0 && cleanupResult.passed ? 'passed' : 'failed',
      completed,
      failures,
      cleanup: cleanupResult,
      commands,
      runtime: {
        node: process.version,
        platform: process.platform,
        serviceVersions,
      },
    };
    await atomicJson(path.join(identity.state, 'outcome.json'), outcome);
    if (outcome.status === 'passed')
      await privateFile(
        path.join(identity.state, 'receipt.json'),
        JSON.stringify(outcome),
      );
  }
  return outcome;
}
export function validateOutcome(outcome, receipt, identity) {
  requireThat(
    outcome?.version === 1 &&
      ['passed', 'failed'].includes(outcome.status) &&
      outcome.candidateSHA === identity.candidateSHA &&
      outcome.controlSHA === identity.controlSHA &&
      outcome.group === identity.group &&
      outcome.fingerprint === identity.fingerprint &&
      Array.isArray(outcome.completed),
    'INVALID_OUTCOME',
  );
  if (outcome.status === 'passed')
    requireThat(
      receipt &&
        JSON.stringify(receipt) === JSON.stringify(outcome) &&
        outcome.cleanup?.passed === true &&
        outcome.failures?.length === 0 &&
        REQUIRED[identity.group].every((stage) =>
          outcome.completed.some((entry) => entry.stage === stage),
        ),
      'SUCCESS_RECEIPT_REQUIRED',
    );
  else requireThat(!receipt, 'FAILED_SUCCESS_RECEIPT');
  return outcome.status;
}
export async function sealState(identity, env) {
  if (identity.phase === 'prepared') {
    const outcome = {
      version: 1,
      candidateSHA: identity.candidateSHA,
      controlSHA: identity.controlSHA,
      group: identity.group,
      fingerprint: identity.fingerprint,
      status: 'failed',
      completed: [],
      failures: [{ stage: 'preparation', code: 'PREPARATION_INCOMPLETE' }],
      cleanup: { passed: false, operations: [] },
      commands: [],
      runtime: { node: process.version, platform: process.platform },
    };
    await atomicJson(path.join(identity.state, 'outcome.json'), outcome);
    identity.phase = 'finished';
    await persistIdentity(identity);
  }
  requireThat(['finished', 'sealed'].includes(identity.phase), 'INVALID_PHASE');
  if (identity.phase === 'sealed') {
    const envelope = await safeFile(
      identity.state,
      'public/evidence.encrypted.json',
      ENVELOPE_LIMIT,
    );
    requireThat(
      sha256(envelope) === identity.envelopeHash,
      'ENVELOPE_HASH_MISMATCH',
    );
    return JSON.parse(
      await safeFile(identity.state, 'public/receipt.json', 65536),
    );
  }
  const outcome = JSON.parse(await safeFile(identity.state, 'outcome.json'));
  let receipt;
  try {
    receipt = JSON.parse(await safeFile(identity.state, 'receipt.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const status = validateOutcome(outcome, receipt, identity);
  const files = [];
  let total = 0;
  const allowlist = new Set(identity.evidence);
  requireThat(
    allowlist.size === identity.evidence.length,
    'DUPLICATE_EVIDENCE',
  );
  for (const relative of allowlist) {
    let bytes;
    try {
      bytes = await safeFile(identity.state, relative);
    } catch (error) {
      if (error.code === 'ENOENT' && status === 'failed') continue;
      throw error;
    }
    total += bytes.length;
    requireThat(total <= RAW_LIMIT, 'RAW_LIMIT');
    files.push({ path: relative, bytes: bytes.toString('base64') });
  }
  const envelope = encryptEvidence(
    { outcome, ...(receipt ? { receipt } : {}), files },
    identity,
    env.RUNTIME_ACCEPTANCE_PUBLIC_KEY,
  );
  await mkdir(path.join(identity.state, 'public'), { mode: 0o700 });
  const serialized = JSON.stringify(envelope);
  await privateFile(
    path.join(identity.state, 'public/evidence.encrypted.json'),
    serialized,
  );
  const publicReceipt = {
    version: 1,
    candidateSHA: identity.candidateSHA,
    controlSHA: identity.controlSHA,
    group: identity.group,
    fingerprint: identity.fingerprint,
    status,
    passed: outcome.completed
      .flatMap((entry) => entry.cases ?? [])
      .reduce((sum, entry) => sum + entry.passed, 0),
    skipped: outcome.completed
      .flatMap((entry) => entry.cases ?? [])
      .reduce((sum, entry) => sum + entry.skipped, 0),
    groups: outcome.completed.length,
    elapsedMs: outcome.commands.reduce(
      (sum, entry) => sum + entry.elapsedMs,
      0,
    ),
    cleanup: outcome.cleanup.passed,
    evidenceBytes: total,
    envelopeSHA256: sha256(serialized),
  };
  await privateFile(
    path.join(identity.state, 'public/receipt.json'),
    JSON.stringify(publicReceipt),
  );
  identity.phase = 'sealed';
  identity.envelopeHash = publicReceipt.envelopeSHA256;
  await persistIdentity(identity);
  await rm(path.join(identity.state, 'raw'), { recursive: true });
  await rm(path.join(identity.state, 'outcome.json'));
  if (receipt) await rm(path.join(identity.state, 'receipt.json'));
  return publicReceipt;
}
const QUALIFIED_CLI_GROUPS = new Set(['dataset-diagnostic']);
function requireQualifiedGroup(group) {
  requireThat(QUALIFIED_CLI_GROUPS.has(group), 'UNQUALIFIED_RUNTIME_GROUP');
}
async function checkQualifiedSealDocuments(identity) {
  for (const relative of [
    'outcome.json',
    'receipt.json',
    'public/receipt.json',
    ...(identity.phase === 'sealed' ? ['public/evidence.encrypted.json'] : []),
  ]) {
    let bytes;
    try {
      bytes = await safeFile(
        identity.state,
        relative,
        relative.endsWith('evidence.encrypted.json')
          ? ENVELOPE_LIMIT
          : RAW_LIMIT,
      );
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    let document;
    try {
      document = JSON.parse(bytes);
    } catch {
      throw new AcceptanceError('INVALID_QUALIFIED_RECEIPT');
    }
    requireQualifiedGroup(document?.group);
    requireThat(
      document.version === 1 &&
        document.candidateSHA === identity.candidateSHA &&
        document.controlSHA === identity.controlSHA &&
        document.fingerprint === identity.fingerprint,
      'QUALIFIED_RECEIPT_IDENTITY_MISMATCH',
    );
  }
}
export async function runCli(argv = process.argv.slice(2), env = process.env) {
  try {
    const options = parseArguments(argv);
    if (options.command === 'preflight') requireQualifiedGroup(options.group);
    else if (options.command !== 'seal') requireQualifiedGroup(options.command);
    if (options.command === 'preflight') {
      await createState(options, env);
      if (env.GITHUB_OUTPUT) {
        const handle = await open(env.GITHUB_OUTPUT, 'a');
        try {
          await handle.writeFile('prepared=true\n');
        } finally {
          await handle.close();
        }
      }
      process.stdout.write('runtime-acceptance prepared\n');
      return 0;
    }
    const identity = await loadState(options, env);
    requireQualifiedGroup(identity.group);
    if (options.command === 'seal') {
      await checkQualifiedSealDocuments(identity);
    }
    if (options.command === 'seal') {
      const receipt = await sealState(identity, env);
      process.stdout.write(
        `runtime-acceptance ${receipt.status} ${receipt.candidateSHA} ${receipt.passed}\n`,
      );
      if (receipt.status === 'passed' && env.GITHUB_OUTPUT) {
        const handle = await open(env.GITHUB_OUTPUT, 'a');
        try {
          await handle.writeFile('result=passed\n');
        } finally {
          await handle.close();
        }
      }
      return receipt.status === 'passed' ? 0 : 1;
    }
    requireThat(options.command === identity.group, 'GROUP_MISMATCH');
    const outcome = await execution(identity, env);
    process.stdout.write(
      `runtime-acceptance ${outcome.status} ${identity.candidateSHA}\n`,
    );
    return outcome.status === 'passed' ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `runtime-acceptance ${error instanceof AcceptanceError ? error.code : 'CONTROL_FAILED'}\n`,
    );
    return 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, () => {
      cancelled = true;
      for (const pid of activeGroups) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {}
      }
      process.exitCode = 1;
    });
  process.exitCode = await runCli();
}
