import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  atomicCpuFile,
  CPU_LIMITS,
  captureCpuProfile,
  cpuActivation,
  digestCpu,
  readCpuTrigger,
  validateCpuProfile,
  validateCpuSeal,
  validateWorkerData,
  writeCpuTrigger,
} from './cpu-profile-core.mjs';

const frame = (name = 'busy') => ({
  functionName: name,
  scriptId: '1',
  url: 'file:///private/busy.mjs',
  lineNumber: 1,
  columnNumber: 0,
});
const profile = () => ({
  nodes: [
    { id: 1, callFrame: { ...frame('(root)'), url: '' }, children: [2] },
    { id: 2, callFrame: frame() },
  ],
  startTime: 1,
  endTime: 101,
  samples: [2, 2],
  timeDeltas: [40, 50],
});
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'cpu-core-'));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  return directory;
}
const scaled = {
  ...CPU_LIMITS,
  triggerMs: 20,
  pollMs: 1,
  captureMs: 1,
  watchdogMs: 30,
};
const seal = (directory) =>
  JSON.parse(readFileSync(join(directory, 'cpu-profile-seal.json'), 'utf8'));
function session(result = profile()) {
  const calls = [];
  return {
    calls,
    connectToMainThread() {
      calls.push('connect');
    },
    disconnect() {
      calls.push('disconnect');
    },
    post(name, params, callback) {
      calls.push([name, params]);
      callback(null, name === 'Profiler.stop' ? { profile: result } : {});
    },
  };
}
test('activation requires exact validated CI prerequisites; worker refuses malformed data', (t) => {
  const directory = fixture(t);
  const env = {
    CLOUD_SWEEP_CPU_PROFILE: '1',
    CLOUD_SWEEP_DIAGNOSTICS: '1',
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    GENFEED_CLOUD: 'true',
    NODE_ENV: 'test',
  };
  assert.equal(cpuActivation({}, false), false);
  assert.equal(cpuActivation(env, true), true);
  for (const key of Object.keys(env))
    assert.throws(() =>
      cpuActivation(
        { ...env, [key]: key === 'CLOUD_SWEEP_CPU_PROFILE' ? '1' : 'false' },
        key !== 'CLOUD_SWEEP_CPU_PROFILE',
      ),
    );
  assert.throws(() =>
    validateWorkerData({
      version: 1,
      directory,
      repositoryRoot: '/tmp',
      secret: 'TOKEN',
    }),
  );
  assert.equal(
    validateWorkerData({ version: 1, directory, repositoryRoot: '/tmp' })
      .directory,
    directory,
  );
  assert.equal(existsSync(join(directory, 'cpu-profile-seal.json')), false);
});
test('exclusive trigger validates shape, ownership mode and symlinks', (t) => {
  const directory = fixture(t);
  writeCpuTrigger(directory, 2);
  assert.equal(readCpuTrigger(directory).trigger.at, 2);
  assert.throws(() => writeCpuTrigger(directory, 3));
  chmodSync(join(directory, 'cpu-profile-trigger.json'), 0o644);
  assert.throws(() => readCpuTrigger(directory));
  rmSync(join(directory, 'cpu-profile-trigger.json'));
  symlinkSync('/tmp/missing', join(directory, 'cpu-profile-trigger.json'));
  assert.throws(() => readCpuTrigger(directory));
});
test('capture commands run once in order, atomically seal exact digest and preserve native session', async (t) => {
  const directory = fixture(t);
  writeCpuTrigger(directory);
  const instance = session();
  await captureCpuProfile({ directory, session: instance, limits: scaled });
  const value = validateCpuSeal(seal(directory));
  assert.equal(value.state, 'complete');
  assert.deepEqual(
    instance.calls.filter(Array.isArray).map((value) => value[0]),
    [
      'Profiler.enable',
      'Profiler.setSamplingInterval',
      'Profiler.start',
      'Profiler.stop',
    ],
  );
  assert.equal(
    value.rawSha256,
    digestCpu(readFileSync(join(directory, 'cpu-profile.raw.json'))),
  );
  assert.equal(value.sampleCount, 2);
  assert.equal(value.actualDurationUs, 100);
  assert.equal(value.plannedDurationMs, 90000);
  assert.equal(existsSync(join(directory, 'cpu-profile.raw.json.tmp')), false);
  assert.throws(() =>
    atomicCpuFile(directory, 'cpu-profile.raw.json', Buffer.from('{}')),
  );
});
test('missing/malformed/replaced triggers never create a second capture', async (t) => {
  const directory = fixture(t);
  await captureCpuProfile({ directory, session: session(), limits: scaled });
  assert.equal(seal(directory).reason, 'triggerMissing');
  const malformed = fixture(t);
  writeFileSync(
    join(malformed, 'cpu-profile-trigger.json'),
    '{"version":1,"phase":"other","at":1}',
    { mode: 0o600 },
  );
  await captureCpuProfile({
    directory: malformed,
    session: session(),
    limits: scaled,
  });
  assert.equal(seal(malformed).reason, 'triggerInvalid');
  const replaced = fixture(t);
  writeCpuTrigger(replaced);
  await captureCpuProfile({
    directory: replaced,
    session: session(),
    limits: scaled,
    onStarted: () =>
      writeFileSync(join(replaced, 'cpu-profile-trigger.json'), '{}'),
  });
  assert.equal(seal(replaced).reason, 'triggerInvalid');
});
test('errors and watchdog are sealed once, late callbacks cannot overwrite', async (t) => {
  const directory = fixture(t);
  writeCpuTrigger(directory);
  const instance = session();
  instance.post = (_name, _params, callback) =>
    callback(new Error('SECRET_ERROR_STACK'));
  await captureCpuProfile({ directory, session: instance, limits: scaled });
  assert.equal(seal(directory).reason, 'inspectorFailure');
  assert.ok(
    !readFileSync(join(directory, 'cpu-profile-seal.json'), 'utf8').includes(
      'SECRET',
    ),
  );
  const hung = fixture(t);
  writeCpuTrigger(hung);
  let late;
  const stalled = session();
  stalled.post = (_name, _params, callback) => {
    late = callback;
  };
  await captureCpuProfile({
    directory: hung,
    session: stalled,
    limits: scaled,
  });
  assert.equal(seal(hung).reason, 'deadlineExceeded');
  late(null, {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(seal(hung).reason, 'deadlineExceeded');
});
test('profile graph, exact fields, samples, time weights, depth and capacity fail closed', () => {
  assert.equal(validateCpuProfile(profile()).sampledUs, 90);
  for (const mutate of [
    (p) => p.nodes.push(p.nodes[1]),
    (p) => (p.nodes[1].children = [1]),
    (p) => (p.samples = [99, 2]),
    (p) => (p.timeDeltas = [200, 1]),
    (p) => (p.timeDeltas = [1]),
    (p) => (p.nodes[1].private = 'secret'),
  ]) {
    const p = profile();
    mutate(p);
    assert.throws(() => validateCpuProfile(p));
  }
  assert.throws(() =>
    validateCpuProfile(profile(), { ...CPU_LIMITS, nodes: 1 }),
  );
  assert.throws(() =>
    validateCpuProfile(profile(), { ...CPU_LIMITS, depth: 1 }),
  );
});
test('invalid returned timing seals incomplete without emitting raw profile', async (t) => {
  const directory = fixture(t);
  writeCpuTrigger(directory);
  const p = profile();
  p.timeDeltas = [200, 1];
  await captureCpuProfile({ directory, session: session(p), limits: scaled });
  assert.equal(seal(directory).reason, 'invalidTiming');
  assert.equal(existsSync(join(directory, 'cpu-profile.raw.json')), false);
});

test('atomic seal refuses an existing dangling target symlink without overwriting it', (t) => {
  const directory = fixture(t);
  symlinkSync(
    '/tmp/absent-cpu-profile-target',
    join(directory, 'cpu-profile.raw.json'),
  );
  assert.throws(() =>
    atomicCpuFile(directory, 'cpu-profile.raw.json', Buffer.from('{}')),
  );
  assert.equal(existsSync(join(directory, 'cpu-profile.raw.json.tmp')), false);
});
