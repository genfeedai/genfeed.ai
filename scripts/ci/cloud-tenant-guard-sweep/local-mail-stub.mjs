import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRuntimeConfig } from './config.mjs';

export const MAIL_LABELS = ['A', 'B', 'M', 'M2', 'S'];
export const MAIL_REASONS = [
  'authorization',
  'path',
  'method',
  'contentType',
  'size',
  'json',
  'payload',
];
const MAIL_METHODS = ['GET', 'POST', 'other'];
const MAIL_ROUTES = [
  'health',
  'emailDeliveries',
  'systemNotifications',
  'channelDeliveries',
  'other',
];
const MAIL_AUTHORIZATION = ['absent', 'matched', 'other'];
const refusalKey = ({ method, route, authorization, reason }) =>
  [method, route, authorization, reason].join('|');
const BODY_LIMIT = 256 * 1024;
const INTERNAL_KEY = 'ci-placeholder-internal-service-api-key';
export function zeroMailStats() {
  return {
    version: 1,
    rejectedRequests: [],
    probeRequests: { health: 0, systemNotificationsUnavailable: 0 },
    statusRequests: 0,
    accepted: Object.fromEntries(MAIL_LABELS.map((label) => [label, 0])),
    rejected: Object.fromEntries(MAIL_REASONS.map((reason) => [reason, 0])),
  };
}
function exactKeys(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',')
  );
}
export function validateMailStats(stats, previous) {
  if (
    !exactKeys(stats, [
      'version',
      'statusRequests',
      'accepted',
      'rejected',
      ...(Object.hasOwn(stats ?? {}, 'rejectedRequests')
        ? ['rejectedRequests']
        : []),
      ...(Object.hasOwn(stats ?? {}, 'probeRequests') ? ['probeRequests'] : []),
    ]) ||
    stats.version !== 1 ||
    !exactKeys(stats.accepted, MAIL_LABELS) ||
    !exactKeys(stats.rejected, MAIL_REASONS)
  )
    throw new Error('Invalid mail statistics schema');
  const numbers = [
    stats.statusRequests,
    ...Object.values(stats.accepted),
    ...Object.values(stats.rejected),
  ];
  if (numbers.some((value) => !Number.isSafeInteger(value) || value < 0))
    throw new Error('Invalid mail statistics count');
  if (Object.hasOwn(stats, 'rejectedRequests')) {
    if (
      !Array.isArray(stats.rejectedRequests) ||
      stats.rejectedRequests.length > 315
    )
      throw new Error('Invalid mail attribution');
    const seen = new Set();
    const sums = Object.fromEntries(MAIL_REASONS.map((reason) => [reason, 0]));
    for (const entry of stats.rejectedRequests) {
      if (
        !exactKeys(entry, [
          'method',
          'route',
          'authorization',
          'reason',
          'count',
        ]) ||
        !MAIL_METHODS.includes(entry.method) ||
        !MAIL_ROUTES.includes(entry.route) ||
        !MAIL_AUTHORIZATION.includes(entry.authorization) ||
        !MAIL_REASONS.includes(entry.reason) ||
        !Number.isSafeInteger(entry.count) ||
        entry.count <= 0 ||
        seen.has(refusalKey(entry))
      )
        throw new Error('Invalid mail attribution');
      seen.add(refusalKey(entry));
      sums[entry.reason] += entry.count;
      if (!Number.isSafeInteger(sums[entry.reason]))
        throw new Error('Invalid mail attribution count');
    }
    if (MAIL_REASONS.some((reason) => sums[reason] !== stats.rejected[reason]))
      throw new Error('Inconsistent mail attribution');
  }
  if (
    Object.hasOwn(stats, 'probeRequests') &&
    (!exactKeys(stats.probeRequests, [
      'health',
      'systemNotificationsUnavailable',
    ]) ||
      Object.values(stats.probeRequests).some(
        (value) => !Number.isSafeInteger(value) || value < 0,
      ))
  )
    throw new Error('Invalid mail probe statistics');
  if (previous) {
    validateMailStats(previous);
    if (
      Object.hasOwn(previous, 'probeRequests') &&
      (!Object.hasOwn(stats, 'probeRequests') ||
        Object.keys(previous.probeRequests).some(
          (key) => stats.probeRequests[key] < previous.probeRequests[key],
        ))
    )
      throw new Error('Mail probe statistics regressed');
    if (Object.hasOwn(previous, 'rejectedRequests')) {
      if (!Object.hasOwn(stats, 'rejectedRequests'))
        throw new Error('Mail attribution disappeared');
      const current = new Map(
        stats.rejectedRequests.map((entry) => [refusalKey(entry), entry.count]),
      );
      if (
        previous.rejectedRequests.some(
          (entry) => (current.get(refusalKey(entry)) ?? 0) < entry.count,
        )
      )
        throw new Error('Mail attribution regressed');
    }
    if (
      stats.statusRequests < previous.statusRequests ||
      MAIL_LABELS.some(
        (label) => stats.accepted[label] < previous.accepted[label],
      ) ||
      MAIL_REASONS.some(
        (reason) => stats.rejected[reason] < previous.rejected[reason],
      )
    )
      throw new Error('Mail statistics regressed');
  }
  return stats;
}
export function validateRunDirectory(runDir) {
  if (!isAbsolute(runDir ?? ''))
    throw new Error('Owned run directory required');
  const stat = lstatSync(runDir);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o777) !== 0o700
  )
    throw new Error('Unsafe run directory');
  return runDir;
}
export function readMailStats(runDir, previous) {
  validateRunDirectory(runDir);
  const file = join(runDir, 'mail-stats.json');
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor);
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o600
    )
      throw new Error('Unsafe mail statistics file');
    return validateMailStats(
      JSON.parse(readFileSync(descriptor, 'utf8')),
      previous,
    );
  } finally {
    closeSync(descriptor);
  }
}
export function createLocalMailStub({
  mode,
  key,
  runDir,
  writeSnapshot,
  onFatal = () => {},
}) {
  if (!['local', 'ci'].includes(mode) || key !== INTERNAL_KEY)
    throw new Error('Restricted mail adapter configuration rejected');
  validateRunDirectory(runDir);
  const target = join(runDir, 'mail-stats.json');
  try {
    lstatSync(target);
    throw new Error('Mail statistics already exists');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const counts = zeroMailStats();
  const persist =
    writeSnapshot ??
    ((snapshot) => {
      validateRunDirectory(runDir);
      const temporary = join(runDir, `.mail-stats-${randomUUID()}.tmp`);
      let descriptor;
      let created = false;
      try {
        descriptor = openSync(
          temporary,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
        created = true;
        writeFileSync(
          descriptor,
          `${JSON.stringify(validateMailStats(snapshot))}\n`,
        );
        closeSync(descriptor);
        descriptor = undefined;
        renameSync(temporary, target);
      } catch (failure) {
        if (descriptor !== undefined) closeSync(descriptor);
        try {
          if (created) unlinkSync(temporary);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        throw failure;
      }
    });
  persist(counts);
  let failed = false;
  let chain = Promise.resolve();
  const commit = (change) => {
    const task = chain.then(async () => {
      if (failed) throw new Error('Mail statistics persistence unavailable');
      change();
      await persist(structuredClone(counts));
    });
    chain = task.catch(() => {
      failed = true;
      onFatal();
    });
    return task;
  };
  const handler = async (request, response) => {
    const reply = async (status, body, change) => {
      try {
        await commit(change);
      } catch {
        response.writeHead(500);
        response.end();
        return;
      }
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    const reject = (reason, status = 400) =>
      reply(status, { error: 'Rejected fixture transport request' }, () => {
        counts.rejected[reason]++;
        const tuple = {
          method: ['GET', 'POST'].includes(request.method)
            ? request.method
            : 'other',
          route:
            new Map([
              ['/v1/health', 'health'],
              ['/v1/internal/email-deliveries', 'emailDeliveries'],
              ['/v1/internal/system-notifications', 'systemNotifications'],
              ['/v1/internal/channel-deliveries', 'channelDeliveries'],
            ]).get(request.url) ?? 'other',
          authorization:
            request.headers.authorization === undefined
              ? 'absent'
              : request.headers.authorization === `Bearer ${key}`
                ? 'matched'
                : 'other',
          reason,
          count: 1,
        };
        const existing = counts.rejectedRequests.find(
          (entry) => refusalKey(entry) === refusalKey(tuple),
        );
        if (existing) existing.count++;
        else counts.rejectedRequests.push(tuple);
        counts.rejectedRequests.sort((a, b) =>
          refusalKey(a) < refusalKey(b)
            ? -1
            : refusalKey(a) > refusalKey(b)
              ? 1
              : 0,
        );
      });
    if (
      request.method === 'GET' &&
      request.url === '/v1/health' &&
      (request.headers.authorization === undefined ||
        request.headers.authorization === `Bearer ${key}`)
    )
      return reply(200, { status: 'ok' }, () => counts.probeRequests.health++);
    if (request.headers.authorization !== `Bearer ${key}`)
      return reject('authorization', 401);
    if (
      request.method === 'GET' &&
      request.url === '/v1/internal/system-notifications'
    )
      return reply(
        503,
        {
          message:
            'System notification delivery is unavailable in this fixture',
        },
        () => counts.probeRequests.systemNotificationsUnavailable++,
      );
    if (request.url !== '/v1/internal/email-deliveries')
      return reject('path', 404);
    if (request.method === 'GET')
      return reply(200, { isConfigured: true }, () => counts.statusRequests++);
    if (request.method !== 'POST') return reject('method', 405);
    if (
      !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')
    )
      return reject('contentType', 415);
    let size = 0;
    const chunks = [];
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > BODY_LIMIT) {
          request.resume();
          return reject('size', 413);
        }
        chunks.push(chunk);
      }
    } catch {
      return reject('json');
    }
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return reject('json');
    }
    chunks.length = 0;
    const label = MAIL_LABELS.find(
      (label) =>
        payload?.to === `ci-cloud-${label.toLowerCase()}@example.invalid`,
    );
    if (
      !label ||
      payload.subject !== 'Verify your Genfeed.ai email' ||
      typeof payload.html !== 'string' ||
      !payload.html.trim() ||
      typeof payload.idempotencyKey !== 'string' ||
      !payload.idempotencyKey.startsWith('auth/verification/') ||
      payload.idempotencyKey.length <= 'auth/verification/'.length
    )
      return reject('payload');
    const emailId = `ci-local-mail-${createHash('sha256').update(payload.idempotencyKey).digest('hex').slice(0, 24)}`;
    payload = undefined;
    return reply(200, { emailId }, () => counts.accepted[label]++);
  };
  return { handler, counts, createServer: () => createServer(handler) };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const runtime = validateRuntimeConfig(process.env);
  const servers = [];
  let stopping = false;
  const stop = async (fatal = false) => {
    if (stopping) return;
    stopping = true;
    if (fatal) process.exitCode = 1;
    for (const server of servers)
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
  };
  const stub = createLocalMailStub({
    mode: runtime.mode,
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: uncached standalone CLI consumes the validated synthetic environment.
    key: process.env.GENFEEDAI_API_KEY,
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: uncached standalone CLI owns this private evidence directory.
    runDir: process.env.CLOUD_SWEEP_RUN_DIR,
    onFatal: () => {
      void stop(true);
    },
  });
  try {
    for (const host of ['127.0.0.1', '::1']) {
      const server = stub.createServer();
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ host, port: 3011, ipv6Only: true }, resolve);
      });
    }
  } catch {
    await stop(true);
    throw new Error('Restricted mail listener startup failed');
  }
  process.stdout.write('Restricted mail adapter ready\n');
  process.once('SIGTERM', () => {
    void stop();
  });
  process.once('SIGINT', () => {
    void stop();
  });
}
