#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const CONTRACT = JSON.parse(
  readFileSync(
    new URL('./mcp-auth-runtime.contract.json', import.meta.url),
    'utf8',
  ),
);
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
export function demand(condition, code) {
  if (!condition) throw new Error(code);
}
export function parseOptions(argv) {
  const expected = new Set([
    '--case-family',
    '--candidate-sha',
    '--tested-sha',
    '--state',
  ]);
  demand(argv.length === 8, 'INVALID_ARGUMENTS');
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    demand(
      expected.has(argv[i]) && !Object.hasOwn(values, argv[i]) && argv[i + 1],
      'INVALID_ARGUMENTS',
    );
    values[argv[i]] = argv[i + 1];
  }
  demand(
    values['--case-family'] === 'brand-access' &&
      SHA.test(values['--candidate-sha']) &&
      SHA.test(values['--tested-sha']),
    'INVALID_SOURCE_IDENTITY',
  );
  demand(isAbsolute(values['--state']), 'INVALID_STATE_PATH');
  return {
    family: values['--case-family'],
    candidateSha: values['--candidate-sha'],
    testedSha: values['--tested-sha'],
    state: resolve(values['--state']),
  };
}
const placeholders = Object.fromEntries(
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
);
const runtimeKeys = new Set([
  'GITHUB_ACTIONS',
  'DATABASE_URL',
  'REDIS_URL',
  'REDIS_QUEUE_DB',
  'REDIS_CACHE_DB',
  'REDIS_RATELIMIT_DB',
  'REDIS_SOCKET_DB',
  'GENFEEDAI_API_URL',
  'GENFEEDAI_API_PUBLIC_URL',
  'BETTER_AUTH_URL',
  'BETTER_AUTH_TRUSTED_ORIGINS',
  'GENFEEDAI_APP_URL',
  'GENFEEDAI_MCP_PUBLIC_URL',
  'GENFEEDAI_MICROSERVICES_MCP_URL',
  'GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL',
  'MCP_AUTH_RUNTIME_NONCE',
  'MCP_AUTH_NETWORK_REPORT',
  'MCP_AUTH_CANDIDATE_SHA',
  'MCP_AUTH_TESTED_SHA',
  'MCP_AUTH_JOURNEY_REPORT',
  'HOME',
  'PATH',
  'SENTRY_ENABLED',
  'CHECKPOINT_DISABLE',
]);
export function validateEnvironment(env) {
  demand(
    env.CI === 'true' &&
      env.GITHUB_ACTIONS === 'true' &&
      env.NODE_ENV === 'test' &&
      env.GENFEED_CLOUD === 'true',
    'INVALID_RUNTIME_ENVIRONMENT',
  );
  demand(
    /^[0-9a-f]{32}$/.test(env.MCP_AUTH_RUNTIME_NONCE ?? ''),
    'INVALID_NONCE',
  );
  demand(
    env.SENTRY_ENABLED === undefined || env.SENTRY_ENABLED === 'false',
    'TELEMETRY_ENABLED',
  );
  demand(env.CHECKPOINT_DISABLE === '1', 'PRISMA_TELEMETRY_ENABLED');
  const db = new URL(env.DATABASE_URL);
  demand(
    db.protocol === 'postgresql:' &&
      db.hostname === '127.0.0.1' &&
      db.port === '5432' &&
      db.pathname === `/${CONTRACT.database}` &&
      !db.search &&
      !db.hash,
    'WRONG_DATABASE',
  );
  for (const [key, value] of Object.entries(env)) {
    demand(
      Object.hasOwn(placeholders, key) || runtimeKeys.has(key),
      'UNEXPECTED_ENVIRONMENT_KEY',
    );
    if (!runtimeKeys.has(key))
      demand(value === placeholders[key], 'NON_SYNTHETIC_ENVIRONMENT');
    demand(
      !/(?:GITHUB_TOKEN|GH_TOKEN|TURBO_TOKEN|ACTIONS_|AWS_SESSION_TOKEN|RESEND_API_KEY|ALLOW_EMAIL_VERIFICATION_WITHOUT_MAILER)/.test(
        key,
      ),
      'AMBIENT_SECRET',
    );
    if (/_URL$/.test(key) && key !== 'DATABASE_URL') {
      const url = new URL(value);
      demand(
        ['127.0.0.1', 'localhost'].includes(url.hostname) &&
          ['http:', 'redis:'].includes(url.protocol),
        'REMOTE_RUNTIME_URL',
      );
    }
  }
  for (const [name, dbIndex] of Object.entries({
    QUEUE: 0,
    CACHE: 1,
    RATELIMIT: 2,
    SOCKET: 3,
  }))
    demand(
      env[`REDIS_${name}_DB`] === String(dbIndex),
      'REDIS_WORKLOAD_IDENTITY',
    );
  return env;
}
export function validateContainer(
  inspect,
  expected,
  { allowStopped = false } = {},
) {
  demand(
    inspect.Id === expected.id &&
      inspect.Config?.Labels?.['genfeed.mcp-auth.nonce'] === expected.nonce &&
      ((allowStopped && inspect.State?.Running === false) ||
        (inspect.State?.Running === true &&
          Number.isSafeInteger(inspect.State.Pid) &&
          inspect.State.Pid > 1)),
    'CONTAINER_OWNERSHIP',
  );
  demand(
    inspect.HostConfig?.NetworkMode === expected.network &&
      !(
        inspect.HostConfig?.PortBindings &&
        Object.keys(inspect.HostConfig.PortBindings).length
      ) &&
      !(inspect.Mounts ?? []).some((mount) => mount.Type === 'bind'),
    'CONTAINER_NETWORK',
  );
  if (expected.pid !== undefined)
    demand(
      inspect.State.Pid === expected.pid &&
        inspect.State.StartedAt === expected.startedAt,
      'CONTAINER_PROCESS_CHANGED',
    );
}
export function validateNamespace(interfaces, defaults) {
  demand(
    Array.isArray(interfaces) &&
      interfaces.length === 1 &&
      interfaces[0].ifname === 'lo' &&
      Array.isArray(defaults) &&
      defaults.length === 0,
    'CONNECTED_NAMESPACE',
  );
}
export function assertChildOutcome(result) {
  demand(
    result.code === 0 && !result.signal && !result.timedOut,
    'CHILD_NONZERO_SIGNAL_OR_TIMEOUT',
  );
}
const journeyKeys = [
  'version',
  'candidateSha',
  'testedSha',
  'nonce',
  'cases',
  'migrationInventoryDigest',
  'negativeStateDigest',
  'cacheObserved',
];
export function validateJourney(report, identity) {
  demand(
    report &&
      Object.keys(report).length === journeyKeys.length &&
      Object.keys(report).every((key) => journeyKeys.includes(key)),
    'REPORT_UNEXPECTED_FIELDS',
  );
  demand(
    report?.version === 1 &&
      report.candidateSha === identity.candidateSha &&
      report.testedSha === identity.testedSha &&
      report.nonce === identity.nonce,
    'REPORT_SOURCE_IDENTITY',
  );
  demand(
    DIGEST.test(report.migrationInventoryDigest ?? '') &&
      DIGEST.test(report.negativeStateDigest ?? '') &&
      report.cacheObserved === true,
    'REPORT_EVIDENCE',
  );
  demand(
    Array.isArray(report.cases) &&
      report.cases.length === 11 &&
      report.cases.every(
        (entry, index) =>
          entry &&
          Object.keys(entry).length === 2 &&
          entry.id === CONTRACT.cases[index] &&
          entry.status === 'passed',
      ) &&
      new Set(report.cases.map((entry) => entry.id)).size === 11,
    'REPORT_CASES',
  );
}
export function validateReceipt(report, identity) {
  demand(
    identity && SHA.test(identity.candidateSha) && SHA.test(identity.testedSha),
    'EXPECTED_SOURCE_IDENTITY',
  );
  validateJourney(
    Object.fromEntries(
      journeyKeys.map((key) => [
        key,
        key === 'cases' ? report.cases?.slice(0, 11) : report[key],
      ]),
    ),
    identity,
  );
  const receiptKeys = [
    ...journeyKeys,
    'cleanup',
    'networkAttempts',
    'lockDigest',
    'apiDigest',
    'mcpDigest',
    'journeyDigest',
    'images',
    'runtime',
    'status',
  ];
  demand(
    Object.keys(report).every((key) => receiptKeys.includes(key)),
    'RECEIPT_UNEXPECTED_FIELDS',
  );
  demand(
    SHA.test(report.candidateSha) &&
      SHA.test(report.testedSha) &&
      /^[0-9a-f]{32}$/.test(report.nonce),
    'RECEIPT_IDENTITY',
  );
  demand(
    report.cases?.length === 12 &&
      report.cases[11].id === CONTRACT.cases[11] &&
      report.cases[11].status === 'passed' &&
      Object.keys(report.cases[11]).length === 2 &&
      report.cleanup === 'passed' &&
      report.status === 'passed' &&
      report.networkAttempts === 0,
    'RECEIPT_INCOMPLETE',
  );
  for (const digest of [
    'lockDigest',
    'apiDigest',
    'mcpDigest',
    'journeyDigest',
  ])
    demand(DIGEST.test(report[digest] ?? ''), 'RECEIPT_BUNDLE_IDENTITY');
  demand(
    Object.keys(report.images ?? {})
      .sort()
      .join(',') === 'postgres,redis' &&
      Object.values(report.images).every((id) =>
        /^sha256:[0-9a-f]{64}$/.test(id),
      ) &&
      Object.keys(report.runtime ?? {})
        .sort()
        .join(',') === 'bun,node' &&
      /^v[0-9]+\.[0-9]+\.[0-9]+(?:[-+].*)?$/.test(report.runtime.node) &&
      /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+].*)?$/.test(report.runtime.bun),
    'RECEIPT_RUNTIME_IDENTITY',
  );
  return report;
}
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
const command = (exe, args, options = {}) =>
  execFileSync(exe, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  }).trim();
function inspect(id) {
  return JSON.parse(command('docker', ['inspect', id]))[0];
}
export function readProcessNetworkNamespace(pid, runCommand = command) {
  demand(Number.isSafeInteger(pid) && pid > 0, 'INVALID_NAMESPACE_PID');
  // Docker's namespace owner runs as root. The runner cannot read its
  // procfs namespace link without the same privilege used by nsenter.
  try {
    return runCommand('sudo', ['-n', 'readlink', `/proc/${pid}/ns/net`]);
  } catch {
    throw new Error('NETWORK_NAMESPACE_READ');
  }
}
export function readJourneyFailure(output) {
  const lines = output.split('\n');
  const principalFailure = lines.find((line) =>
    /^B01_REAL_PRINCIPALS_(SIGNIN|COOKIE|TOKEN|CONTEXT|TRANSPORT|KEY_MINT|KEY_BINDING) failed$/.test(
      line,
    ),
  );
  if (principalFailure) return principalFailure.slice(0, -' failed'.length);
  return (
    CONTRACT.cases.find((id) => lines.includes(`${id} failed`)) ??
    'JOURNEY_INFRASTRUCTURE'
  );
}

function processStart(pid) {
  const text = readFileSync(`/proc/${pid}/stat`, 'utf8');
  return text.slice(text.lastIndexOf(')') + 2).split(' ')[19];
}
function cleanInputs(source, destination) {
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        ['.git', '.turbo', '.agents', '.codex', '.claude'].includes(entry.name)
      )
        continue;
      const file = join(directory, entry.name);
      const target = join(destination, relative(source, file));
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'generated'
      ) {
        if (entry.isDirectory()) {
          mkdirSync(target, { recursive: true });
          // Generated inputs may already exist in the exact git archive.
          // Replace only destination leaves before linking the built inputs.
          command('cp', [
            '-a',
            '-l',
            '--remove-destination',
            `${file}/.`,
            target,
          ]);
        }
        continue;
      }
      if (entry.isDirectory()) walk(file);
    }
  };
  walk(source);
  scrubRuntimeExport(destination);
}

export function scrubRuntimeExport(destination) {
  const scrub = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (
        entry.name.startsWith('.env') ||
        ['.agents', '.codex', '.claude', '.turbo'].includes(entry.name)
      ) {
        rmSync(file, { recursive: true, force: true });
        continue;
      }
      if (entry.isSymbolicLink()) {
        const target = realpathSync(file);
        demand(
          target === destination || target.startsWith(`${destination}/`),
          'OUTSIDE_EXPORT_SYMLINK',
        );
      } else if (entry.isDirectory()) scrub(file);
    }
  };
  scrub(destination);
}
function stopOwnedChild(handle) {
  if (!Number.isSafeInteger(handle.child.pid) || handle.result) return;
  try {
    process.kill(-handle.child.pid, 'SIGTERM');
  } catch {}
  if (!handle.killTimer) {
    handle.killTimer = setTimeout(() => {
      if (!handle.result)
        try {
          process.kill(-handle.child.pid, 'SIGKILL');
        } catch {}
    }, 5000);
    handle.killTimer.unref();
    handle.child.once('exit', () => clearTimeout(handle.killTimer));
  }
}
export async function runRuntime(options) {
  demand(
    process.platform === 'linux' &&
      process.env.CI === 'true' &&
      process.env.GITHUB_ACTIONS === 'true',
    'LINUX_CI_REQUIRED',
  );
  demand(
    command('git', ['rev-parse', 'HEAD']) === options.testedSha &&
      options.candidateSha === options.testedSha,
    'CHECKOUT_SHA',
  );
  demand(
    isAbsolute(process.env.RUNNER_TEMP ?? '') &&
      dirname(options.state) === resolve(process.env.RUNNER_TEMP) &&
      !existsSync(options.state),
    'FRESH_RUNNER_STATE_REQUIRED',
  );
  mkdirSync(options.state, { mode: 0o700 });
  demand((lstatSync(options.state).mode & 0o777) === 0o700, 'STATE_MODE');
  const nonce = randomBytes(16).toString('hex');
  const identity = { ...options, nonce };
  const processes = [];
  const owned = [];
  const report = {
    version: 1,
    candidateSha: identity.candidateSha,
    testedSha: identity.testedSha,
    nonce,
    cases: [],
    cleanup: 'failed',
    networkAttempts: 0,
  };
  let failure;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    for (const handle of processes) stopOwnedChild(handle);
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  const overallDeadline = Date.now() + CONTRACT.deadlinesMs.overall;
  let pgIdentity;
  const networkFile = join(options.state, `network-${nonce}.jsonl`);
  writeFileSync(networkFile, '', { mode: 0o600 });
  const safeStage = async (stage, run) => {
    try {
      demand(
        !interrupted && Date.now() < overallDeadline,
        'RUNTIME_INTERRUPTED_OR_DEADLINE',
      );
      return await run();
    } catch {
      throw new Error(stage);
    }
  };
  const pullImage = async (image, name) => {
    demand(
      !interrupted && Date.now() < overallDeadline,
      'RUNTIME_INTERRUPTED_OR_DEADLINE',
    );
    const output = openSync(
      join(options.state, `pull-${name}.private.log`),
      'wx',
      0o600,
    );
    const child = spawn('docker', ['pull', image], {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', output, output],
    });
    closeSync(output);
    const handle = {
      stage: `pull-${name}`,
      child,
      result: null,
      timedOut: false,
    };
    processes.push(handle);
    handle.done = new Promise((resolve) => {
      const complete = (code, signal) => {
        handle.result = { code, signal, timedOut: handle.timedOut };
        resolve(handle.result);
      };
      child.once('error', () => complete(null, 'START_FAILED'));
      child.once('exit', complete);
    });
    handle.timer = setTimeout(
      () => {
        handle.timedOut = true;
        stopOwnedChild(handle);
      },
      Math.min(180000, overallDeadline - Date.now()),
    );
    handle.timer.unref();
    const result = await handle.done;
    clearTimeout(handle.timer);
    assertChildOutcome(result);
  };
  try {
    report.runtime = {
      node: command(process.execPath, ['--version']),
      bun: command('bun', ['--version']),
    };
    report.images = {};
    for (const [name, image] of [
      ['postgres', 'pgvector/pgvector:pg17'],
      ['redis', 'redis:7'],
    ]) {
      await safeStage('IMAGE_INPUT', () => pullImage(image, name));
      report.images[name] = command('docker', [
        'image',
        'inspect',
        '--format',
        '{{.Id}}',
        image,
      ]);
    }
    const clean = join(options.state, 'candidate');
    mkdirSync(clean, { mode: 0o700 });
    const archive = join(options.state, 'source.tar');
    const fd = openSync(archive, 'wx', 0o600);
    try {
      execFileSync('git', ['archive', '--format=tar', options.testedSha], {
        cwd: ROOT,
        stdio: ['ignore', fd, 'pipe'],
      });
    } finally {
      closeSync(fd);
    }
    command('tar', ['-xf', archive, '-C', clean]);
    rmSync(archive);
    cleanInputs(ROOT, clean);
    report.lockDigest = hash(join(clean, 'bun.lock'));
    report.apiDigest = hash(join(clean, 'apps/server/dist/apps/api/main.js'));
    report.mcpDigest = hash(join(clean, 'apps/server/dist/apps/mcp/main.js'));
    report.journeyDigest = hash(
      join(
        clean,
        'apps/server/api/test/integration/mcp/mcp-brand-access.journey.ts',
      ),
    );
    const user = `fixture_${nonce.slice(0, 12)}`;
    const password = randomBytes(32).toString('hex');
    const pg = command('docker', [
      'run',
      '--detach',
      '--network',
      'none',
      '--label',
      `genfeed.mcp-auth.nonce=${nonce}`,
      '--name',
      `mcp-auth-pg-${nonce}`,
      '-e',
      `POSTGRES_DB=${CONTRACT.database}`,
      '-e',
      `POSTGRES_USER=${user}`,
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      report.images.postgres,
    ]);
    owned.push({ id: pg, nonce, network: 'none' });
    const deadline = Date.now() + 60000;
    while (true) {
      try {
        command('docker', [
          'exec',
          pg,
          'pg_isready',
          '-U',
          user,
          '-d',
          CONTRACT.database,
        ]);
        break;
      } catch {
        demand(!interrupted && Date.now() < deadline, 'POSTGRES_READINESS');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    const pgState = inspect(pg);
    validateContainer(pgState, owned[0]);
    pgIdentity = {
      ...owned[0],
      pid: pgState.State.Pid,
      startedAt: pgState.State.StartedAt,
      start: processStart(pgState.State.Pid),
      namespace: readProcessNetworkNamespace(pgState.State.Pid),
    };
    const redis = command('docker', [
      'run',
      '--detach',
      '--network',
      `container:${pg}`,
      '--label',
      `genfeed.mcp-auth.nonce=${nonce}`,
      '--name',
      `mcp-auth-redis-${nonce}`,
      report.images.redis,
      'redis-server',
      '--bind',
      '127.0.0.1',
      '--port',
      '6379',
      '--save',
      '',
      '--appendonly',
      'no',
    ]);
    owned.push({ id: redis, nonce, network: `container:${pg}` });
    validateContainer(inspect(redis), owned[1]);
    const fresh = command('docker', [
      'exec',
      pg,
      'psql',
      '-U',
      user,
      '-d',
      CONTRACT.database,
      '-At',
      '-c',
      "SELECT current_database()||'|'||current_schema()||'|'||(SELECT count(*) FROM information_schema.tables WHERE table_schema='public')",
    ]);
    demand(fresh === `${CONTRACT.database}|public|0`, 'FRESH_EMPTY_DATABASE');
    const env = Object.fromEntries(
      readFileSync(
        join(
          clean,
          'scripts/ci/cloud-tenant-guard-sweep/cloud-sweep.placeholders',
        ),
        'utf8',
      )
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => [
          line.slice(0, line.indexOf('=')),
          line.slice(line.indexOf('=') + 1),
        ]),
    );
    Object.assign(env, {
      GITHUB_ACTIONS: 'true',
      SENTRY_ENABLED: 'false',
      CHECKPOINT_DISABLE: '1',
      DATABASE_URL: `postgresql://${user}:${password}@127.0.0.1:5432/${CONTRACT.database}`,
      REDIS_URL: 'redis://127.0.0.1:6379',
      REDIS_QUEUE_DB: '0',
      REDIS_CACHE_DB: '1',
      REDIS_RATELIMIT_DB: '2',
      REDIS_SOCKET_DB: '3',
      GENFEEDAI_API_URL: 'http://127.0.0.1:3010',
      GENFEEDAI_API_PUBLIC_URL: 'http://127.0.0.1:3010',
      BETTER_AUTH_URL: 'http://127.0.0.1:3010',
      BETTER_AUTH_TRUSTED_ORIGINS:
        'http://127.0.0.1:3000,http://127.0.0.1:3010,http://127.0.0.1:3014',
      GENFEEDAI_APP_URL: 'http://127.0.0.1:3000',
      GENFEEDAI_MCP_PUBLIC_URL: 'http://127.0.0.1:3014/mcp',
      GENFEEDAI_MICROSERVICES_MCP_URL: 'http://127.0.0.1:3014',
      GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL: 'http://127.0.0.1:3011',
      MCP_AUTH_RUNTIME_NONCE: nonce,
      MCP_AUTH_NETWORK_REPORT: networkFile,
      MCP_AUTH_CANDIDATE_SHA: options.candidateSha,
      MCP_AUTH_TESTED_SHA: options.testedSha,
      MCP_AUTH_JOURNEY_REPORT: join(options.state, 'journey.json'),
      HOME: join(options.state, 'home'),
      PATH: process.env.PATH,
    });
    mkdirSync(env.HOME, { mode: 0o700 });
    validateEnvironment(env);
    const uid = process.getuid();
    const gid = process.getgid();
    const bun = realpathSync(command('which', ['bun']));
    const guard = join(clean, 'scripts/ci/mcp-auth-network-guard.mjs');
    const verify = () => {
      demand(
        !interrupted && Date.now() < overallDeadline,
        'RUNTIME_INTERRUPTED_OR_DEADLINE',
      );
      validateContainer(inspect(pg), pgIdentity);
      demand(
        processStart(pgIdentity.pid) === pgIdentity.start &&
          readProcessNetworkNamespace(pgIdentity.pid) === pgIdentity.namespace,
        'NAMESPACE_OWNER_CHANGED',
      );
      const base = [
        '-n',
        'nsenter',
        '--target',
        String(pgIdentity.pid),
        '--net',
        '--',
      ];
      validateNamespace(
        JSON.parse(command('sudo', [...base, 'ip', '-j', 'addr'])),
        JSON.parse(
          command('sudo', [...base, 'ip', '-j', 'route', 'show', 'default']),
        ),
      );
    };
    const launch = (
      stage,
      exe,
      args,
      {
        port = '3010',
        cwd = clean,
        timeout = CONTRACT.deadlinesMs.overall,
      } = {},
    ) => {
      verify();
      const runtimeEnv = { ...env, PORT: port };
      const envArgs = Object.entries(runtimeEnv).map(
        ([key, value]) => `${key}=${value}`,
      );
      const output = openSync(
        join(options.state, `${stage}.private.log`),
        'wx',
        0o600,
      );
      const child = spawn(
        'sudo',
        [
          '-n',
          'nsenter',
          '--target',
          String(pgIdentity.pid),
          '--net',
          '--setuid',
          String(uid),
          '--setgid',
          String(gid),
          '--',
          'env',
          '-i',
          ...envArgs,
          exe,
          ...args,
        ],
        { cwd, detached: true, stdio: ['ignore', output, output] },
      );
      closeSync(output);
      const handle = { stage, child, result: null, timedOut: false };
      processes.push(handle);
      handle.done = new Promise((resolve) => {
        child.once('error', () => {
          handle.result = {
            code: null,
            signal: 'START_FAILED',
            timedOut: false,
          };
          resolve(handle.result);
        });
        child.once('exit', (code, signal) => {
          handle.result = { code, signal, timedOut: handle.timedOut };
          resolve(handle.result);
        });
      });
      handle.timer = setTimeout(
        () => {
          handle.timedOut = true;
          stopOwnedChild(handle);
        },
        Math.min(timeout, overallDeadline - Date.now()),
      );
      handle.timer.unref();
      child.once('exit', () => clearTimeout(handle.timer));
      return handle;
    };
    const run = async (stage, exe, args, settings) => {
      const handle = launch(stage, exe, args, settings);
      const result = await handle.done;
      clearTimeout(handle.timer);
      const output = readFileSync(
        join(options.state, `${stage}.private.log`),
        'utf8',
      ).trim();
      if (stage === 'journey' && result.code !== 0)
        process.stderr.write(`${readJourneyFailure(output)} failed\n`);
      assertChildOutcome(result);
      return output;
    };
    const requireFromPrisma = createRequire(
      join(clean, 'packages/prisma/package.json'),
    );
    await safeStage('MIGRATION_DEPLOY', () =>
      run(
        'migration',
        process.execPath,
        [
          '--import',
          guard,
          requireFromPrisma.resolve('prisma/build/index.js'),
          'migrate',
          'deploy',
        ],
        {
          cwd: join(clean, 'packages/prisma'),
          timeout: CONTRACT.deadlinesMs.migration,
        },
      ),
    );
    const migration = await safeStage('MIGRATION_INVENTORY', () =>
      run(
        'migration-proof',
        bun,
        [
          '--preload',
          guard,
          join(
            clean,
            'apps/server/api/test/integration/mcp/mcp-auth-runtime.fixture.ts',
          ),
          '--verify-migrations',
        ],
        { timeout: CONTRACT.deadlinesMs.migration },
      ),
    );
    demand(DIGEST.test(migration), 'MIGRATION_INVENTORY_OUTPUT');
    report.migrationInventoryDigest = migration;
    const mailCode =
      "const {createLocalMailStub}=await import('./scripts/ci/cloud-tenant-guard-sweep/local-mail-stub.mjs');const stub=createLocalMailStub({mode:'ci',key:process.env.GENFEEDAI_API_KEY,runDir:process.env.HOME,onFatal:()=>process.exit(1)});const server=stub.createServer();server.listen(3011,'127.0.0.1');process.once('SIGTERM',()=>{server.close(()=>process.exit(0));server.closeAllConnections();});";
    launch('mail', process.execPath, [
      '--import',
      guard,
      '--input-type=module',
      '--eval',
      mailCode,
    ]);
    const api = launch('api', process.execPath, [
      '--import',
      guard,
      join(clean, 'apps/server/dist/apps/api/main.js'),
    ]);
    const mcp = launch(
      'mcp',
      process.execPath,
      ['--import', guard, join(clean, 'apps/server/dist/apps/mcp/main.js')],
      { port: '3014' },
    );
    for (const [name, port, handle, deadlineMs] of [
      ['api', 3010, api, CONTRACT.deadlinesMs.api],
      ['mcp', 3014, mcp, CONTRACT.deadlinesMs.mcp],
    ]) {
      const probe =
        "import net from 'node:net';const s=net.connect(Number(process.argv[1]),'127.0.0.1');s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),1000).unref();";
      const end = Date.now() + deadlineMs;
      let attempt = 0;
      while (true) {
        demand(handle.child.exitCode === null, 'APP_EXITED_BEFORE_READINESS');
        try {
          await run(
            `${name}-probe-${attempt++}`,
            process.execPath,
            [
              '--import',
              guard,
              '--input-type=module',
              '--eval',
              probe,
              String(port),
            ],
            { timeout: 3000 },
          );
          break;
        } catch {
          demand(!interrupted && Date.now() < end, 'APP_READINESS_TIMEOUT');
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
    await safeStage('BRAND_JOURNEY', () =>
      run(
        'journey',
        bun,
        [
          '--preload',
          guard,
          join(
            clean,
            'apps/server/api/test/integration/mcp/mcp-brand-access.journey.ts',
          ),
        ],
        { timeout: CONTRACT.deadlinesMs.journey },
      ),
    );
    const journey = JSON.parse(
      readFileSync(env.MCP_AUTH_JOURNEY_REPORT, 'utf8'),
    );
    validateJourney(journey, identity);
    demand(
      journey.migrationInventoryDigest === report.migrationInventoryDigest,
      'MIGRATION_PROOF_CHANGED',
    );
    Object.assign(report, journey);
    for (const file of [
      'apps/server/dist/apps/api/main.js',
      'apps/server/dist/apps/mcp/main.js',
      'apps/server/api/test/integration/mcp/mcp-brand-access.journey.ts',
    ])
      demand(
        hash(join(clean, file)) ===
          report[
            file.includes('/api/main')
              ? 'apiDigest'
              : file.includes('/mcp/main')
                ? 'mcpDigest'
                : 'journeyDigest'
          ],
        'BUNDLE_CHANGED',
      );
    demand(
      api.child.exitCode === null && mcp.child.exitCode === null,
      'APP_EXITED_DURING_JOURNEY',
    );
    demand(
      readFileSync(networkFile, 'utf8').length === 0,
      'UNEXPECTED_NETWORK_ATTEMPT',
    );
    const mailStats = JSON.parse(
      readFileSync(join(env.HOME, 'mail-stats.json'), 'utf8'),
    );
    demand(
      Object.values(mailStats.accepted).every((count) => count === 0),
      'MAIL_DELIVERY_STARTED',
    );
  } catch (error) {
    failure = /^[A-Z_]+$/.test(error.message ?? '')
      ? error.message
      : 'RUNTIME_FAILURE';
  } finally {
    let clean = true;
    for (const handle of processes.reverse()) {
      clearTimeout(handle.timer);
      clearTimeout(handle.killTimer);
      if (
        handle.result ||
        !Number.isSafeInteger(handle.child.pid) ||
        handle.child.exitCode !== null ||
        handle.child.signalCode !== null
      )
        continue;
      try {
        process.kill(-handle.child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') clean = false;
      }
      let result = await Promise.race([
        handle.done,
        new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);
      if (!result) {
        try {
          process.kill(-handle.child.pid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') clean = false;
        }
        result = await Promise.race([
          handle.done,
          new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
      }
      if (!result) clean = false;
    }
    for (const owner of owned.reverse()) {
      try {
        validateContainer(inspect(owner.id), owner, { allowStopped: true });
        command('docker', ['rm', '--force', '--volumes', owner.id]);
        try {
          command('docker', ['inspect', owner.id]);
          clean = false;
        } catch {}
      } catch {
        clean = false;
      }
    }
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    if (interrupted && !failure) failure = 'RUNTIME_INTERRUPTED';
    report.cleanup = clean ? 'passed' : 'failed';
    if (!clean) failure = 'CLEANUP_FAILED';
    report.networkAttempts = readFileSync(networkFile, 'utf8')
      .split('\n')
      .filter(Boolean).length;
    if (!failure && report.networkAttempts === 0)
      report.cases.push({ id: CONTRACT.cases[11], status: 'passed' });
    else if (!failure) failure = 'UNEXPECTED_NETWORK_ATTEMPT';
    report.status = failure ? 'failed' : 'passed';
    if (failure) report.failure = failure;
    if (!failure)
      try {
        validateReceipt(report, identity);
      } catch {
        failure = 'RECEIPT_INVALID';
        report.status = 'failed';
        report.failure = failure;
      }
    delete report.state;
    delete report.family;
    writeFileSync(
      join(options.state, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    );
  }
  process.stdout.write(
    `${failure ?? CONTRACT.cases[11]} ${failure ? 'failed' : 'passed'}\n`,
  );
  if (failure) throw new Error(failure);
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await runRuntime(parseOptions(process.argv.slice(2)));
  } catch {
    process.exitCode = 1;
    process.stderr.write('MCP_AUTH_RUNTIME_FAILED\n');
  }
}
