import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  atomicCpuFile,
  digestCpu,
  writeCpuTrigger,
} from './cpu-profile-core.mjs';
import {
  collectCpuEvidence,
  createCpuCatalog,
  emptyCpuEvidence,
  reduceCpuProfile,
  validateCpuEvidence,
} from './cpu-profile-evidence.mjs';

const frame = (
  url,
  name = 'PRIVATE_FUNCTION_TOKEN_SQL',
  line = 0,
  column = 0,
) => ({
  functionName: name,
  scriptId: 'SECRET_ID',
  url,
  lineNumber: line,
  columnNumber: column,
});
function profile() {
  return {
    nodes: [
      { id: 1, callFrame: frame('', '(root)'), children: [2] },
      { id: 2, callFrame: frame('file:///src/caller.ts'), children: [3] },
      { id: 3, callFrame: frame('file:///src/leaf.ts') },
    ],
    startTime: 0,
    endTime: 100,
    samples: [3, 3],
    timeDeltas: [40, 50],
  };
}
const synthetic = {
  bundleSha256: 'a'.repeat(64),
  location: (frame) => ({
    value: frame.url
      ? {
          kind: 'source',
          file: frame.url.endsWith('leaf.ts') ? 'src/leaf.ts' : 'src/caller.ts',
          line: 0,
          column: 0,
          modulePath: null,
        }
      : {
          kind: 'root',
          file: null,
          line: null,
          column: null,
          modulePath: null,
        },
    invalidLocation: false,
  }),
};
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'cpu-catalog-'));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'caller.ts'), 'caller();\n');
  writeFileSync(join(root, 'src', 'leaf.ts'), 'leaf();\n');
  writeFileSync(join(root, 'bun.lock'), '{"packages":{"example":[]}}');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', 'src', 'bun.lock'], { cwd: root });
  return root;
}
function seal(directory, p, at = 1) {
  const bytes = Buffer.from(JSON.stringify(p));
  atomicCpuFile(directory, 'cpu-profile.raw.json', bytes);
  atomicCpuFile(
    directory,
    'cpu-profile-seal.json',
    Buffer.from(
      JSON.stringify({
        version: 1,
        state: 'complete',
        reason: null,
        triggerAt: at,
        startedAt: at,
        stoppedAt: at + 1,
        sealedAt: at + 2,
        plannedDurationMs: 90000,
        samplingIntervalUs: 2000,
        actualDurationUs: p.endTime - p.startTime,
        sampleCount: p.samples.length,
        nodeCount: p.nodes.length,
        rawBytes: bytes.length,
        rawSha256: digestCpu(bytes),
      }),
    ),
  );
}
test('self and caller mass conserve timeDeltas; inclusive ancestry never becomes disjoint CPU', () => {
  const p = profile();
  const result = reduceCpuProfile(p, synthetic);
  assert.equal(result.sampledUs, 90);
  assert.equal(result.remainderUs, 10);
  assert.equal(result.topSelf[0].weightUs, 90);
  assert.equal(result.topCallers[0].caller.file, 'src/caller.ts');
  assert.equal(result.topCallers[0].weightUs, 90);
  assert.equal(
    result.topInclusive.reduce((sum, row) => sum + row.weightUs, 0),
    270,
  );
  assert.ok(!JSON.stringify(result).includes('PRIVATE_FUNCTION_TOKEN_SQL'));
  assert.ok(!JSON.stringify(result).includes('SECRET_ID'));
  assert.equal(
    result.categories.reduce((sum, row) => sum + row.samples, 0),
    2,
  );
});
test('recursive same anchors count once inclusively; unknown ancestry remains explicit', () => {
  const p = profile();
  p.nodes[1].callFrame = p.nodes[2].callFrame;
  const result = reduceCpuProfile(p, synthetic);
  assert.equal(
    result.topInclusive.find((row) => row.anchor.file === 'src/leaf.ts')
      .samples,
    2,
  );
  assert.equal(result.topCallers[0].caller, null);
  const catalog = {
    ...synthetic,
    location: (f) =>
      f.url.endsWith('caller.ts')
        ? {
            value: {
              kind: 'unknown',
              file: null,
              line: null,
              column: null,
              modulePath: null,
            },
            invalidLocation: true,
          }
        : synthetic.location(f),
  };
  assert.equal(
    reduceCpuProfile(profile(), catalog).topCallers[0].viaUnknown,
    true,
  );
});
test('top and tail truncation conserve all self/caller mass without inventing inclusive tail mass', () => {
  const p = {
    nodes: [{ id: 1, callFrame: frame('', '(root)'), children: [] }],
    startTime: 0,
    endTime: 300,
    samples: [],
    timeDeltas: [],
  };
  for (let i = 0; i < 140; i++) {
    p.nodes.push({ id: i + 2, callFrame: frame(`file:///src/f${i}.ts`) });
    p.nodes[0].children.push(i + 2);
    p.samples.push(i + 2);
    p.timeDeltas.push(1);
  }
  const c = {
    location: (f) => ({
      value: f.url
        ? {
            kind: 'source',
            file: f.url.slice(8),
            line: 0,
            column: 0,
            modulePath: null,
          }
        : {
            kind: 'root',
            file: null,
            line: null,
            column: null,
            modulePath: null,
          },
      invalidLocation: false,
    }),
  };
  const result = reduceCpuProfile(p, c);
  assert.equal(result.topSelf.length, 50);
  assert.equal(result.otherSelf.samples, 90);
  assert.equal(result.topCallers.length, 100);
  assert.equal(result.otherCallers.samples, 40);
  assert.deepEqual(Object.keys(result.otherInclusive), ['omittedAnchorCount']);
  assert.deepEqual(reduceCpuProfile(p, c), result);
});
test('trusted catalog maps source, installed dependency, builtin, webpack header and existing map only', (t) => {
  const root = fixture(t);
  const bundle = join(root, 'apps/server/dist/apps/api');
  mkdirSync(bundle, { recursive: true });
  const compiled = '/***/ "./src/caller.ts":\nfunction compiled() {}\n';
  writeFileSync(join(bundle, 'main.js'), compiled);
  mkdirSync(join(root, 'apps/server/api/src'), { recursive: true });
  writeFileSync(
    join(root, 'apps/server/api/src/caller.ts'),
    'function caller() {}\n',
  );
  execFileSync('git', ['add', 'apps/server/api/src'], { cwd: root });
  mkdirSync(join(root, 'node_modules/example'), { recursive: true });
  writeFileSync(
    join(root, 'node_modules/example/package.json'),
    '{"name":"example"}',
  );
  writeFileSync(
    join(root, 'node_modules/example/index.js'),
    'function dependency() {}\n',
  );
  const catalog = createCpuCatalog(root);
  assert.equal(
    catalog.location(frame(pathToFileURL(join(root, 'src/leaf.ts')).href)).value
      .file,
    'src/leaf.ts',
  );
  assert.equal(
    catalog.location(
      frame(pathToFileURL(join(root, 'node_modules/example/index.js')).href),
    ).value.file,
    'example/index.js',
  );
  assert.equal(catalog.location(frame('node:fs')).value.kind, 'node');
  assert.equal(catalog.location(frame('node:SECRET')).value.kind, 'unknown');
  const bound = catalog.location(
    frame(pathToFileURL(join(bundle, 'main.js')).href, 'secret', 1, 0),
  ).value;
  assert.equal(bound.kind, 'bundle');
  assert.equal(bound.modulePath, 'apps/server/api/src/caller.ts');
  assert.equal(bound.line, 1);
  assert.match(catalog.bundleSha256, /^[a-f0-9]{64}$/);
  writeFileSync(
    join(bundle, 'main.js.map'),
    JSON.stringify({
      version: 3,
      file: 'main.js',
      sources: [pathToFileURL(join(root, 'src/leaf.ts')).href],
      names: ['SECRET_SOURCE_MAP_NAME'],
      sourcesContent: ['SECRET_SOURCE_CONTENT'],
      mappings: 'AAAA',
    }),
  );
  assert.equal(
    createCpuCatalog(root).location(
      frame(pathToFileURL(join(bundle, 'main.js')).href),
    ).value.file,
    'src/leaf.ts',
  );
});
test('query, traversal, percent encoded, remote, symlink escape and out-of-bounds frames stay unknown', (t) => {
  const root = fixture(t);
  const c = createCpuCatalog(root);
  const source = pathToFileURL(join(root, 'src/leaf.ts')).href;
  for (const url of [
    `${source}?TOKEN`,
    `${source}#QUERY`,
    'file:///tmp/../etc/passwd',
    'https://TOKEN',
    'file:///tmp/%2e%2e/secret',
    'evalmachine.<SECRET>',
  ])
    assert.equal(c.location(frame(url)).value.kind, 'unknown');
  assert.equal(c.location(frame(source, 'x', 99, 0)).value.kind, 'unknown');
  symlinkSync('/etc/passwd', join(root, 'src/escape.ts'));
  execFileSync('git', ['add', 'src/escape.ts'], { cwd: root });
  assert.equal(
    createCpuCatalog(root).location(
      frame(pathToFileURL(join(root, 'src/escape.ts')).href),
    ).value.kind,
    'unknown',
  );
});
test('collector keeps early sealed complete evidence despite independent API lifecycle gaps', (t) => {
  const root = fixture(t);
  const directory = join(root, 'private');
  mkdirSync(directory, { mode: 0o700 });
  writeCpuTrigger(directory, 1);
  const p = profile();
  p.nodes[1].callFrame.url = pathToFileURL(join(root, 'src/caller.ts')).href;
  p.nodes[2].callFrame.url = pathToFileURL(join(root, 'src/leaf.ts')).href;
  assert.equal(
    collectCpuEvidence(directory, { repositoryRoot: root }).quality,
    'partial',
  );
  seal(directory, p);
  assert.equal(
    collectCpuEvidence(directory, { final: true, repositoryRoot: root })
      .quality,
    'complete',
  );
  writeFileSync(join(directory, 'cpu-profile.raw.json'), '{}');
  assert.equal(
    collectCpuEvidence(directory, { final: true, repositoryRoot: root }).reasons
      .digestMismatch,
    1,
  );
});
test('missing seal/trigger, corrupt schema, unsafe modes and malformed public evidence remain unavailable', (t) => {
  const root = fixture(t);
  const directory = join(root, 'private');
  mkdirSync(directory, { mode: 0o700 });
  assert.equal(
    collectCpuEvidence(directory, { final: true, repositoryRoot: root }).reasons
      .triggerMissing,
    1,
  );
  writeCpuTrigger(directory, 1);
  assert.equal(
    collectCpuEvidence(directory, { final: true, repositoryRoot: root }).reasons
      .workerMissing,
    1,
  );
  writeFileSync(join(directory, 'cpu-profile-seal.json'), '{}', {
    mode: 0o600,
  });
  assert.equal(
    collectCpuEvidence(directory, { final: true, repositoryRoot: root }).reasons
      .invalidSchema,
    1,
  );
  chmodSync(join(directory, 'cpu-profile-seal.json'), 0o644);
  assert.equal(
    collectCpuEvidence(directory, { final: true, repositoryRoot: root }).reasons
      .fileUnsafe,
    1,
  );
  const good = reduceCpuProfile(profile(), synthetic);
  for (const mutate of [
    (v) => (v.secret = 'TOKEN'),
    (v) => (v.topSelf[0].anchor.file = '../TOKEN'),
    (v) => (v.topSelf[0].functionName = 'SECRET'),
    (v) => v.sampledUs++,
    (v) => v.topCallers[0].weightUs++,
    (v) => v.mapping.unknownSamples++,
  ]) {
    const v = structuredClone(good);
    mutate(v);
    assert.throws(() => validateCpuEvidence(v));
  }
  assert.equal(
    validateCpuEvidence(emptyCpuEvidence('incomplete', 'workerMissing'))
      .measuredDurationUs,
    null,
  );
});
test('process cumulative CPU readings are differenced once and remain separate from inclusive sampled mass', async () => {
  const { createApiObserver } = await import('./api-observer-core.mjs');
  let at = 0,
    usage = { user: 10, system: 5 };
  const records = [];
  const observer = createApiObserver({
    write: (line) => records.push(JSON.parse(line)),
    pool: { end: () => Promise.resolve() },
    now: () => at,
    cpuUsage: () => usage,
    hrtime: () => 0n,
    setIntervalImpl: () => ({ unref() {} }),
    clearIntervalImpl: () => {},
  });
  at = 1000;
  usage = { user: 50, system: 8 };
  observer.runtimeTick();
  at = 2000;
  usage = { user: 110, system: 12 };
  observer.runtimeTick();
  observer.stop();
  const samples = records.filter((row) => row.kind === 'runtime');
  assert.deepEqual(
    samples.map((row) => row.cpuUserUs),
    [40, 60],
  );
  assert.deepEqual(
    samples.map((row) => row.cpuSystemUs),
    [3, 4],
  );
  assert.equal(
    samples.reduce((sum, row) => sum + row.cpuUserUs, 0),
    100,
  );
  const profileEvidence = reduceCpuProfile(profile(), synthetic);
  assert.equal(profileEvidence.sampledUs, 90);
  assert.equal(
    profileEvidence.topInclusive.reduce((sum, row) => sum + row.weightUs, 0),
    270,
  );
  assert.equal(Object.hasOwn(profileEvidence, 'cpuUserUs'), false);
});
