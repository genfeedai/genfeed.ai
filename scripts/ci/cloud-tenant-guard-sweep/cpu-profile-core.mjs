import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { validateRunDirectory } from './local-mail-stub.mjs';

export const CPU_LIMITS = Object.freeze({
  triggerMs: 400000,
  pollMs: 100,
  captureMs: 90000,
  watchdogMs: 150000,
  intervalUs: 2000,
  nodes: 60000,
  samples: 150000,
  depth: 1024,
  bytes: 16 * 1024 * 1024,
});
export const CPU_REASONS = Object.freeze([
  'triggerMissing',
  'triggerInvalid',
  'workerMissing',
  'inspectorFailure',
  'deadlineExceeded',
  'capacityExceeded',
  'invalidSchema',
  'invalidTiming',
  'fileUnsafe',
  'digestMismatch',
  'conservationFailure',
]);
export const exact = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
export const integer = (value) => Number.isSafeInteger(value) && value >= 0;
export function cpuError(reason) {
  const error = new Error('CPU diagnostic unavailable');
  error.reason = CPU_REASONS.includes(reason) ? reason : 'invalidSchema';
  return error;
}
export function cpuActivation(env, validated = false) {
  if (Reflect.get(env, 'CLOUD_SWEEP_CPU_PROFILE') !== '1') return false;
  if (
    !validated ||
    Reflect.get(env, 'CLOUD_SWEEP_DIAGNOSTICS') !== '1' ||
    ['CI', 'GITHUB_ACTIONS', 'GENFEED_CLOUD'].some(
      (key) => Reflect.get(env, key) !== 'true',
    ) ||
    Reflect.get(env, 'NODE_ENV') !== 'test' ||
    Reflect.get(env, 'CLOUD_SWEEP_LOCAL') !== undefined
  )
    throw cpuError('inspectorFailure');
  return true;
}
export function validateWorkerData(data) {
  if (
    !exact(data, ['version', 'directory', 'repositoryRoot']) ||
    data.version !== 1 ||
    typeof data.directory !== 'string' ||
    typeof data.repositoryRoot !== 'string' ||
    !isAbsolute(data.repositoryRoot) ||
    resolve(data.repositoryRoot) !== data.repositoryRoot
  )
    throw cpuError('invalidSchema');
  validateRunDirectory(data.directory);
  return data;
}
export function readCpuOwned(directory, name, limit) {
  validateRunDirectory(directory);
  const file = join(directory, name);
  const stat = lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o777) !== 0o600 ||
    stat.size > limit
  )
    throw cpuError('fileUnsafe');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    if (opened.ino !== stat.ino || opened.dev !== stat.dev)
      throw cpuError('fileUnsafe');
    return {
      bytes: readFileSync(fd),
      identity: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`,
    };
  } finally {
    closeSync(fd);
  }
}
function targetExists(file) {
  try {
    lstatSync(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw cpuError('fileUnsafe');
  }
}
export function atomicCpuFile(directory, name, bytes) {
  validateRunDirectory(directory);
  const target = join(directory, name),
    temporary = `${target}.tmp`;
  if (targetExists(target)) throw cpuError('fileUnsafe');
  const fd = openSync(
    temporary,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(fd, bytes, offset, bytes.length - offset);
      if (!written) throw cpuError('fileUnsafe');
      offset += written;
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (targetExists(target)) throw cpuError('fileUnsafe');
  renameSync(temporary, target);
}
export function writeCpuTrigger(directory, at = Date.now()) {
  if (!integer(at)) throw cpuError('triggerInvalid');
  const bytes = Buffer.from(
    JSON.stringify({ version: 1, phase: 'strict', at }),
  );
  validateRunDirectory(directory);
  const fd = openSync(
    join(directory, 'cpu-profile-trigger.json'),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    if (writeSync(fd, bytes) !== bytes.length) throw cpuError('fileUnsafe');
  } finally {
    closeSync(fd);
  }
}
export function readCpuTrigger(directory) {
  const file = readCpuOwned(directory, 'cpu-profile-trigger.json', 256);
  let trigger;
  try {
    trigger = JSON.parse(file.bytes);
  } catch {
    throw cpuError('triggerInvalid');
  }
  if (
    !exact(trigger, ['version', 'phase', 'at']) ||
    trigger.version !== 1 ||
    trigger.phase !== 'strict' ||
    !integer(trigger.at)
  )
    throw cpuError('triggerInvalid');
  return { ...file, trigger };
}
export function validateCpuProfile(profile, limits = CPU_LIMITS) {
  if (
    !exact(profile, [
      'nodes',
      'startTime',
      'endTime',
      'samples',
      'timeDeltas',
    ]) ||
    !Array.isArray(profile.nodes) ||
    !Array.isArray(profile.samples) ||
    !Array.isArray(profile.timeDeltas) ||
    !integer(profile.startTime) ||
    !integer(profile.endTime) ||
    profile.endTime < profile.startTime ||
    profile.samples.length === 0 ||
    profile.samples.length !== profile.timeDeltas.length
  )
    throw cpuError('invalidSchema');
  if (
    profile.nodes.length > limits.nodes ||
    profile.samples.length > limits.samples
  )
    throw cpuError('capacityExceeded');
  const nodes = new Map(),
    parents = new Map();
  for (const node of profile.nodes) {
    const allowed = [
      'id',
      'callFrame',
      'hitCount',
      'children',
      'deoptReason',
      'positionTicks',
    ];
    if (
      !node ||
      Object.keys(node).some((key) => !allowed.includes(key)) ||
      !Number.isSafeInteger(node.id) ||
      node.id <= 0 ||
      nodes.has(node.id) ||
      !exact(node.callFrame, [
        'functionName',
        'scriptId',
        'url',
        'lineNumber',
        'columnNumber',
      ]) ||
      ['functionName', 'scriptId', 'url'].some(
        (key) => typeof node.callFrame[key] !== 'string',
      ) ||
      !Number.isSafeInteger(node.callFrame.lineNumber) ||
      !Number.isSafeInteger(node.callFrame.columnNumber) ||
      node.callFrame.lineNumber < -1 ||
      node.callFrame.columnNumber < -1 ||
      (node.children !== undefined && !Array.isArray(node.children))
    )
      throw cpuError('invalidSchema');
    nodes.set(node.id, node);
  }
  for (const node of nodes.values())
    for (const child of node.children ?? []) {
      if (!nodes.has(child) || parents.has(child))
        throw cpuError('invalidSchema');
      parents.set(child, node.id);
    }
  const roots = [...nodes.keys()].filter((id) => !parents.has(id));
  if (roots.length !== 1) throw cpuError('invalidSchema');
  for (const id of nodes.keys()) {
    const seen = new Set();
    let current = id;
    while (current !== undefined) {
      if (seen.has(current)) throw cpuError('invalidSchema');
      seen.add(current);
      if (seen.size > limits.depth) throw cpuError('capacityExceeded');
      current = parents.get(current);
    }
  }
  let sampledUs = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    if (!nodes.has(profile.samples[i]) || !integer(profile.timeDeltas[i]))
      throw cpuError('invalidSchema');
    sampledUs += profile.timeDeltas[i];
    if (!integer(sampledUs)) throw cpuError('invalidTiming');
  }
  const durationUs = profile.endTime - profile.startTime;
  if (sampledUs > durationUs) throw cpuError('invalidTiming');
  return { nodes, parents, durationUs, sampledUs };
}
export const digestCpu = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
const sealKeys = [
  'version',
  'state',
  'reason',
  'triggerAt',
  'startedAt',
  'stoppedAt',
  'sealedAt',
  'plannedDurationMs',
  'samplingIntervalUs',
  'actualDurationUs',
  'sampleCount',
  'nodeCount',
  'rawBytes',
  'rawSha256',
];
export function validateCpuSeal(seal) {
  if (
    !exact(seal, sealKeys) ||
    seal.version !== 1 ||
    !['complete', 'incomplete'].includes(seal.state) ||
    (seal.state === 'complete'
      ? seal.reason !== null
      : !CPU_REASONS.includes(seal.reason)) ||
    seal.plannedDurationMs !== CPU_LIMITS.captureMs ||
    seal.samplingIntervalUs !== CPU_LIMITS.intervalUs ||
    !integer(seal.sealedAt) ||
    ['triggerAt', 'startedAt', 'stoppedAt', 'actualDurationUs'].some(
      (key) => seal[key] !== null && !integer(seal[key]),
    ) ||
    ['sampleCount', 'nodeCount', 'rawBytes'].some(
      (key) => !integer(seal[key]),
    ) ||
    (seal.rawSha256 !== null && !/^[a-f0-9]{64}$/.test(seal.rawSha256)) ||
    (seal.state === 'complete' &&
      (['triggerAt', 'startedAt', 'stoppedAt', 'actualDurationUs'].some(
        (key) => seal[key] === null,
      ) ||
        seal.rawSha256 === null ||
        seal.sampleCount === 0 ||
        seal.nodeCount === 0))
  )
    throw cpuError('invalidSchema');
  return seal;
}
export async function captureCpuProfile({
  directory,
  session,
  limits = CPU_LIMITS,
  now = Date.now,
  monotonic = () => performance.now(),
  delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms)),
  onStarted = () => {},
  onSealed = () => {},
}) {
  validateRunDirectory(directory);
  let triggerAt = null,
    startedAt = null,
    stoppedAt = null,
    sealed = false,
    watchdog;
  const finish = (reason, profile = null) => {
    if (sealed) return;
    sealed = true;
    clearTimeout(watchdog);
    const seal = {
      version: 1,
      state: reason ? 'incomplete' : 'complete',
      reason,
      triggerAt,
      startedAt,
      stoppedAt,
      sealedAt: now(),
      plannedDurationMs: CPU_LIMITS.captureMs,
      samplingIntervalUs: CPU_LIMITS.intervalUs,
      actualDurationUs: null,
      sampleCount: 0,
      nodeCount: 0,
      rawBytes: 0,
      rawSha256: null,
    };
    try {
      if (profile) {
        const valid = validateCpuProfile(profile);
        const bytes = Buffer.from(JSON.stringify(profile));
        if (bytes.length > CPU_LIMITS.bytes) throw cpuError('capacityExceeded');
        atomicCpuFile(directory, 'cpu-profile.raw.json', bytes);
        Object.assign(seal, {
          actualDurationUs: valid.durationUs,
          sampleCount: profile.samples.length,
          nodeCount: profile.nodes.length,
          rawBytes: bytes.length,
          rawSha256: digestCpu(bytes),
        });
      }
      atomicCpuFile(
        directory,
        'cpu-profile-seal.json',
        Buffer.from(JSON.stringify(seal)),
      );
      onSealed(seal);
    } catch (error) {
      // A sealed failure may never be overwritten by a late inspector callback.
      if (!existsSync(join(directory, 'cpu-profile-seal.json'))) {
        try {
          Object.assign(seal, {
            state: 'incomplete',
            reason: CPU_REASONS.includes(error.reason)
              ? error.reason
              : 'fileUnsafe',
            actualDurationUs: null,
            sampleCount: 0,
            nodeCount: 0,
            rawBytes: 0,
            rawSha256: null,
          });
          atomicCpuFile(
            directory,
            'cpu-profile-seal.json',
            Buffer.from(JSON.stringify(seal)),
          );
          onSealed(seal);
        } catch {
          /* Collector reports missing/unsafe seal. */
        }
      }
    }
    try {
      session.disconnect();
    } catch {
      /* Best effort; never controls API shutdown. */
    }
  };
  const post = (method, params = {}) =>
    new Promise((resolvePost, rejectPost) => {
      session.post(method, params, (error, value) => {
        if (sealed) return rejectPost(cpuError('deadlineExceeded'));
        if (error) rejectPost(cpuError('inspectorFailure'));
        else resolvePost(value);
      });
    });
  try {
    const beginning = monotonic();
    let trigger;
    while (monotonic() - beginning < limits.triggerMs) {
      try {
        trigger = readCpuTrigger(directory);
        break;
      } catch (error) {
        if (error.code !== 'ENOENT')
          throw cpuError(
            error.reason === 'fileUnsafe' ? 'fileUnsafe' : 'triggerInvalid',
          );
      }
      await delay(limits.pollMs);
    }
    if (!trigger) {
      finish('triggerMissing');
      return;
    }
    triggerAt = trigger.trigger.at;
    const deadline = new Promise((_, rejectDeadline) => {
      watchdog = setTimeout(() => {
        finish('deadlineExceeded');
        rejectDeadline(cpuError('deadlineExceeded'));
      }, limits.watchdogMs);
    });
    const operation = (async () => {
      session.connectToMainThread();
      await post('Profiler.enable');
      await post('Profiler.setSamplingInterval', {
        interval: CPU_LIMITS.intervalUs,
      });
      await post('Profiler.start');
      startedAt = now();
      const start = monotonic();
      onStarted();
      await delay(Math.max(0, limits.captureMs - (monotonic() - start)));
      const { profile } = await post('Profiler.stop');
      stoppedAt = now();
      const latest = readCpuTrigger(directory);
      if (
        latest.identity !== trigger.identity ||
        latest.bytes.compare(trigger.bytes) !== 0
      )
        throw cpuError('triggerInvalid');
      validateCpuProfile(profile);
      finish(null, profile);
    })();
    await Promise.race([operation, deadline]);
  } catch (error) {
    finish(
      CPU_REASONS.includes(error.reason) ? error.reason : 'inspectorFailure',
    );
  } finally {
    clearTimeout(watchdog);
    try {
      session.disconnect();
    } catch {
      /* No main process side effect. */
    }
  }
}
