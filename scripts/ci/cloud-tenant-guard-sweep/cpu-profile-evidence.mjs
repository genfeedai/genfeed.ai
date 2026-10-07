import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { builtinModules, SourceMap } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CPU_LIMITS,
  CPU_REASONS,
  cpuError,
  digestCpu,
  exact,
  integer,
  readCpuOwned,
  readCpuTrigger,
  validateCpuProfile,
  validateCpuSeal,
} from './cpu-profile-core.mjs';

const bundleFile = 'apps/server/dist/apps/api/main.js';
const kinds = [
  'source',
  'dependency',
  'bundle',
  'node',
  'unknown',
  'gc',
  'idle',
  'program',
  'root',
];
const categoryKinds = ['unknown', 'gc', 'idle', 'program', 'root'];
const anchorKeys = ['kind', 'file', 'line', 'column', 'modulePath'];
const safePath = (value) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_@./+() -]+$/.test(value) &&
  !value.split('/').some((part) => part === '..' || part === '') &&
  !isAbsolute(value);
const anchor = (
  kind,
  file = null,
  line = null,
  column = null,
  modulePath = null,
) => ({ kind, file, line, column, modulePath });
const canonical = (value) => JSON.stringify(value);
const within = (root, file) =>
  file === root || file.startsWith(`${root}${sep}`);
const sum = (a, b) => {
  const value = a + b;
  if (!integer(value)) throw cpuError('conservationFailure');
  return value;
};
export function createCpuCatalog(repositoryRoot) {
  const root = realpathSync(repositoryRoot);
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
      .split('\0')
      .filter(safePath),
  );
  let modulesRoot = null;
  try {
    modulesRoot = realpathSync(join(root, 'node_modules'));
  } catch {
    /* Unknown dependency paths stay unmapped. */
  }
  const lock = readFileSync(join(root, 'bun.lock'), 'utf8');
  const packageNames = new Set(
    [...lock.matchAll(/"((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+)"\s*:/g)].map(
      (match) => match[1],
    ),
  );
  const builtins = new Set(
    builtinModules.map((name) => name.replace(/^node:/, '')),
  );
  const lines = new Map();
  const lineBounds = (file) => {
    if (!lines.has(file)) {
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw cpuError('fileUnsafe');
      lines.set(file, readFileSync(file, 'utf8').split('\n'));
    }
    return lines.get(file);
  };
  let bundleSha256 = null,
    bundleLines = [],
    sourceMap = null,
    headers = [];
  const bundle = join(root, bundleFile);
  if (existsSync(bundle)) {
    if (!lstatSync(bundle).isFile() || lstatSync(bundle).isSymbolicLink())
      throw cpuError('fileUnsafe');
    const bytes = readFileSync(bundle);
    bundleSha256 = digestCpu(bytes);
    bundleLines = bytes.toString('utf8').split('\n');
    for (let i = 0; i < bundleLines.length; i++) {
      const match = bundleLines[i].match(
        /^\/\*\*\*\/\s*("(?:[^"\\]|\\.)*")\s*:/,
      );
      if (match) {
        try {
          const id = JSON.parse(match[1]);
          const path = relative(root, resolve(root, 'apps/server/api', id))
            .split(sep)
            .join('/');
          if (tracked.has(path)) headers.push({ line: i, path });
          else headers.push({ line: i, path: null });
        } catch {
          headers.push({ line: i, path: null });
        }
      }
    }
    if (existsSync(`${bundle}.map`)) {
      try {
        const stat = lstatSync(`${bundle}.map`);
        if (stat.isFile() && !stat.isSymbolicLink())
          sourceMap = new SourceMap(
            JSON.parse(readFileSync(`${bundle}.map`, 'utf8')),
          );
      } catch {
        /* Bundle coordinates remain exact when an existing map is invalid. */
      }
    }
  }
  function location(frame) {
    const { url, lineNumber: line, columnNumber: column } = frame;
    if (!url) {
      const special = {
        '(garbage collector)': 'gc',
        '(idle)': 'idle',
        '(program)': 'program',
        '(root)': 'root',
      };
      return {
        value: anchor(special[frame.functionName] ?? 'unknown'),
        invalidLocation: false,
      };
    }
    if (!integer(line) || !integer(column))
      return { value: anchor('unknown'), invalidLocation: true };
    if (url.startsWith('node:')) {
      const name = url.slice(5);
      return {
        value: builtins.has(name)
          ? anchor('node', `node:${name}`, line, column)
          : anchor('unknown'),
        invalidLocation: !builtins.has(name),
      };
    }
    if (
      /[?#%\0]/.test(url) ||
      url.includes('\\') ||
      url.split('/').includes('..')
    )
      return { value: anchor('unknown'), invalidLocation: true };
    let file;
    try {
      file = url.startsWith('file://') ? fileURLToPath(url) : url;
      if (!isAbsolute(file))
        return { value: anchor('unknown'), invalidLocation: true };
      file = realpathSync(file);
    } catch {
      return { value: anchor('unknown'), invalidLocation: true };
    }
    const path = relative(root, file).split(sep).join('/');
    const validBounds = () => {
      try {
        const content = lineBounds(file);
        return line < content.length && column <= content[line].length;
      } catch {
        return false;
      }
    };
    if (path === bundleFile) {
      if (line >= bundleLines.length || column > bundleLines[line].length)
        return { value: anchor('unknown'), invalidLocation: true };
      if (sourceMap) {
        const entry = sourceMap.findEntry(line, column);
        let source = entry?.originalSource;
        try {
          if (source?.startsWith('file://')) source = fileURLToPath(source);
          if (source?.startsWith('webpack://'))
            source = source.replace(/^webpack:\/\/[^/]*\//, '');
          const mapped = relative(
            root,
            realpathSync(
              isAbsolute(source ?? '')
                ? source
                : resolve(root, 'apps/server/api', source ?? ''),
            ),
          )
            .split(sep)
            .join('/');
          if (
            tracked.has(mapped) &&
            integer(entry.originalLine) &&
            integer(entry.originalColumn)
          ) {
            const content = lineBounds(join(root, mapped));
            if (
              entry.originalLine < content.length &&
              entry.originalColumn <= content[entry.originalLine].length
            )
              return {
                value: anchor(
                  'source',
                  mapped,
                  entry.originalLine,
                  entry.originalColumn,
                ),
                invalidLocation: false,
              };
          }
        } catch {
          /* No names or source text escape. */
        }
      }
      const modulePath =
        headers.filter((header) => header.line <= line).at(-1)?.path ?? null;
      return {
        value: anchor('bundle', bundleFile, line, column, modulePath),
        invalidLocation: false,
      };
    }
    if (within(root, file) && tracked.has(path) && validBounds())
      return {
        value: anchor('source', path, line, column),
        invalidLocation: false,
      };
    if (modulesRoot && within(modulesRoot, file) && validBounds()) {
      let directory = dirname(file);
      while (within(modulesRoot, directory)) {
        const packageFile = join(directory, 'package.json');
        if (existsSync(packageFile)) {
          try {
            const stat = lstatSync(packageFile);
            if (!stat.isFile() || stat.isSymbolicLink()) break;
            const { name } = JSON.parse(readFileSync(packageFile, 'utf8'));
            if (
              typeof name === 'string' &&
              /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name) &&
              packageNames.has(name)
            ) {
              const normalized = `${name}/${relative(directory, file).split(sep).join('/')}`;
              if (safePath(normalized))
                return {
                  value: anchor('dependency', normalized, line, column),
                  invalidLocation: false,
                };
            }
          } catch {
            /* Unknown installed package. */
          }
          break;
        }
        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
      }
    }
    return { value: anchor('unknown'), invalidLocation: true };
  }
  return { root, tracked, bundleSha256, location };
}
const buckets = () => new Map();
function add(table, key, make, weight) {
  if (!table.has(key)) table.set(key, { ...make(), samples: 0, weightUs: 0 });
  const row = table.get(key);
  row.samples++;
  row.weightUs = sum(row.weightUs, weight);
}
const ordered = (table) =>
  [...table.values()].sort(
    (a, b) =>
      b.weightUs - a.weightUs ||
      b.samples - a.samples ||
      canonical(a).localeCompare(canonical(b)),
  );
const tail = (rows) => ({
  samples: rows.reduce((total, row) => sum(total, row.samples), 0),
  weightUs: rows.reduce((total, row) => sum(total, row.weightUs), 0),
});
export function emptyCpuEvidence(quality = 'partial', reason = null) {
  return {
    version: 1,
    quality,
    reasons: Object.fromEntries(
      CPU_REASONS.map((value) => [value, value === reason ? 1 : 0]),
    ),
    phase: 'strict',
    plannedDurationMs: CPU_LIMITS.captureMs,
    samplingIntervalUs: CPU_LIMITS.intervalUs,
    measuredDurationUs: null,
    sampledUs: null,
    remainderUs: null,
    totalSamples: 0,
    nodeCount: 0,
    mapping: {
      mappedSamples: 0,
      mappedUs: 0,
      unknownSamples: 0,
      unknownUs: 0,
      bundleWithoutSourceSamples: 0,
      bundleWithoutSourceUs: 0,
      invalidLocations: 0,
    },
    bundleSha256: null,
    categories: kinds.map((kind) => ({ kind, samples: 0, weightUs: 0 })),
    topSelf: [],
    otherSelf: { samples: 0, weightUs: 0 },
    topInclusive: [],
    otherInclusive: { omittedAnchorCount: 0 },
    topCallers: [],
    otherCallers: { samples: 0, weightUs: 0 },
  };
}
export function reduceCpuProfile(profile, catalog) {
  const { nodes, parents, durationUs, sampledUs } = validateCpuProfile(profile);
  const result = emptyCpuEvidence('complete');
  Object.assign(result, {
    measuredDurationUs: durationUs,
    sampledUs,
    remainderUs: durationUs - sampledUs,
    totalSamples: profile.samples.length,
    nodeCount: nodes.size,
    bundleSha256: catalog.bundleSha256 ?? null,
  });
  const self = buckets(),
    inclusive = buckets(),
    callers = buckets(),
    mapped = new Map();
  for (const node of nodes.values()) {
    const value = catalog.location(node.callFrame);
    mapped.set(node.id, value.value);
    if (value.invalidLocation) result.mapping.invalidLocations++;
  }
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i],
      weight = profile.timeDeltas[i],
      leaf = mapped.get(id),
      leafKey = canonical(leaf);
    add(self, leafKey, () => ({ anchor: leaf }), weight);
    const category = result.categories.find((row) => row.kind === leaf.kind);
    category.samples++;
    category.weightUs = sum(category.weightUs, weight);
    if (leaf.kind === 'unknown') {
      result.mapping.unknownSamples++;
      result.mapping.unknownUs = sum(result.mapping.unknownUs, weight);
    } else {
      result.mapping.mappedSamples++;
      result.mapping.mappedUs = sum(result.mapping.mappedUs, weight);
    }
    if (leaf.kind === 'bundle' && leaf.modulePath === null) {
      result.mapping.bundleWithoutSourceSamples++;
      result.mapping.bundleWithoutSourceUs = sum(
        result.mapping.bundleWithoutSourceUs,
        weight,
      );
    }
    const seen = new Set();
    let current = id,
      caller = null,
      viaUnknown = false;
    while (current !== undefined) {
      const value = mapped.get(current),
        key = canonical(value);
      if (!seen.has(key)) {
        seen.add(key);
        add(inclusive, key, () => ({ anchor: value }), weight);
      }
      if (current !== id && caller === null && key !== leafKey) {
        if (value.kind === 'unknown') viaUnknown = true;
        else if (!categoryKinds.includes(value.kind)) caller = value;
      }
      current = parents.get(current);
    }
    const pair = { caller, leaf, viaUnknown };
    add(callers, canonical(pair), () => pair, weight);
  }
  const selfRows = ordered(self),
    inclusiveRows = ordered(inclusive),
    callerRows = ordered(callers);
  result.topSelf = selfRows.slice(0, 50);
  result.otherSelf = tail(selfRows.slice(50));
  result.topInclusive = inclusiveRows.slice(0, 50);
  result.otherInclusive = {
    omittedAnchorCount: Math.max(0, inclusiveRows.length - 50),
  };
  result.topCallers = callerRows.slice(0, 100);
  result.otherCallers = tail(callerRows.slice(100));
  return validateCpuEvidence(result);
}
function validateAnchor(value) {
  if (
    !exact(value, anchorKeys) ||
    !kinds.includes(value.kind) ||
    ['line', 'column'].some(
      (key) => value[key] !== null && !integer(value[key]),
    )
  )
    throw cpuError('invalidSchema');
  if (categoryKinds.includes(value.kind)) {
    if (
      value.file !== null ||
      value.line !== null ||
      value.column !== null ||
      value.modulePath !== null
    )
      throw cpuError('invalidSchema');
  } else {
    if (
      typeof value.file !== 'string' ||
      (value.kind === 'node'
        ? !builtinModules
            .map((name) => `node:${name.replace(/^node:/, '')}`)
            .includes(value.file)
        : !safePath(value.file)) ||
      value.line === null ||
      value.column === null
    )
      throw cpuError('invalidSchema');
    if (value.kind === 'bundle' && value.file !== bundleFile)
      throw cpuError('invalidSchema');
    if (
      value.modulePath !== null &&
      (value.kind !== 'bundle' || !safePath(value.modulePath))
    )
      throw cpuError('invalidSchema');
  }
  return value;
}
export function validateCpuEvidence(value) {
  const keys = Object.keys(emptyCpuEvidence());
  if (
    !exact(value, keys) ||
    value.version !== 1 ||
    !['partial', 'complete', 'incomplete'].includes(value.quality) ||
    value.phase !== 'strict' ||
    value.plannedDurationMs !== CPU_LIMITS.captureMs ||
    value.samplingIntervalUs !== CPU_LIMITS.intervalUs ||
    !exact(value.reasons, CPU_REASONS) ||
    Object.values(value.reasons).some((number) => !integer(number)) ||
    !integer(value.totalSamples) ||
    !integer(value.nodeCount) ||
    ['measuredDurationUs', 'sampledUs', 'remainderUs'].some(
      (key) => value[key] !== null && !integer(value[key]),
    ) ||
    !exact(value.mapping, Object.keys(emptyCpuEvidence().mapping)) ||
    Object.values(value.mapping).some((number) => !integer(number)) ||
    (value.bundleSha256 !== null && !/^[a-f0-9]{64}$/.test(value.bundleSha256))
  )
    throw cpuError('invalidSchema');
  if (
    !Array.isArray(value.categories) ||
    value.categories.length !== kinds.length ||
    value.categories.some(
      (row, index) =>
        !exact(row, ['kind', 'samples', 'weightUs']) ||
        row.kind !== kinds[index] ||
        !integer(row.samples) ||
        !integer(row.weightUs),
    )
  )
    throw cpuError('invalidSchema');
  for (const [key, limit, fields] of [
    ['topSelf', 50, ['anchor', 'samples', 'weightUs']],
    ['topInclusive', 50, ['anchor', 'samples', 'weightUs']],
    [
      'topCallers',
      100,
      ['caller', 'leaf', 'viaUnknown', 'samples', 'weightUs'],
    ],
  ]) {
    if (!Array.isArray(value[key]) || value[key].length > limit)
      throw cpuError('invalidSchema');
    const seen = new Set();
    for (const row of value[key]) {
      if (
        !exact(row, fields) ||
        !integer(row.samples) ||
        !integer(row.weightUs) ||
        row.samples === 0
      )
        throw cpuError('invalidSchema');
      if (key === 'topCallers') {
        validateAnchor(row.leaf);
        if (row.caller !== null) validateAnchor(row.caller);
        if (typeof row.viaUnknown !== 'boolean')
          throw cpuError('invalidSchema');
      } else validateAnchor(row.anchor);
      const identity = canonical(
        key === 'topCallers'
          ? { caller: row.caller, leaf: row.leaf, viaUnknown: row.viaUnknown }
          : row.anchor,
      );
      if (seen.has(identity)) throw cpuError('invalidSchema');
      seen.add(identity);
    }
  }
  for (const key of ['otherSelf', 'otherCallers'])
    if (
      !exact(value[key], ['samples', 'weightUs']) ||
      Object.values(value[key]).some((number) => !integer(number))
    )
      throw cpuError('invalidSchema');
  if (
    !exact(value.otherInclusive, ['omittedAnchorCount']) ||
    !integer(value.otherInclusive.omittedAnchorCount)
  )
    throw cpuError('invalidSchema');
  if (value.quality === 'complete') {
    if (
      value.measuredDurationUs === null ||
      value.sampledUs === null ||
      value.remainderUs === null ||
      value.totalSamples === 0 ||
      value.nodeCount === 0 ||
      Object.values(value.reasons).some(Boolean) ||
      value.sampledUs + value.remainderUs !== value.measuredDurationUs
    )
      throw cpuError('conservationFailure');
    for (const [rows, other] of [
      [value.topSelf, value.otherSelf],
      [value.topCallers, value.otherCallers],
      [value.categories, { samples: 0, weightUs: 0 }],
    ]) {
      const total = tail(rows);
      if (
        total.samples + other.samples !== value.totalSamples ||
        total.weightUs + other.weightUs !== value.sampledUs
      )
        throw cpuError('conservationFailure');
    }
    if (
      value.mapping.mappedSamples + value.mapping.unknownSamples !==
        value.totalSamples ||
      value.mapping.mappedUs + value.mapping.unknownUs !== value.sampledUs
    )
      throw cpuError('conservationFailure');
  } else if (
    value.measuredDurationUs !== null ||
    value.sampledUs !== null ||
    value.remainderUs !== null ||
    value.totalSamples !== 0 ||
    value.nodeCount !== 0 ||
    value.topSelf.length ||
    value.topInclusive.length ||
    value.topCallers.length ||
    value.categories.some((row) => row.samples || row.weightUs) ||
    Object.values(value.mapping).some(Boolean) ||
    value.otherSelf.samples ||
    value.otherSelf.weightUs ||
    value.otherCallers.samples ||
    value.otherCallers.weightUs ||
    value.otherInclusive.omittedAnchorCount
  )
    throw cpuError('invalidSchema');
  return value;
}
export function collectCpuEvidence(
  directory,
  {
    final = false,
    repositoryRoot = resolve(
      fileURLToPath(new URL('../../../', import.meta.url)),
    ),
  } = {},
) {
  try {
    let trigger;
    try {
      trigger = readCpuTrigger(directory);
    } catch (error) {
      if (error.code === 'ENOENT')
        return emptyCpuEvidence(
          final ? 'incomplete' : 'partial',
          final ? 'triggerMissing' : null,
        );
      throw cpuError(
        error.reason === 'fileUnsafe' ? 'fileUnsafe' : 'triggerInvalid',
      );
    }
    let seal;
    try {
      seal = validateCpuSeal(
        JSON.parse(
          readCpuOwned(directory, 'cpu-profile-seal.json', 4096).bytes,
        ),
      );
    } catch (error) {
      if (error.code === 'ENOENT')
        return emptyCpuEvidence(
          final ? 'incomplete' : 'partial',
          final ? 'workerMissing' : null,
        );
      throw error;
    }
    if (
      seal.triggerAt !== trigger.trigger.at ||
      seal.sealedAt < seal.triggerAt ||
      (seal.startedAt !== null &&
        (seal.startedAt < seal.triggerAt ||
          (seal.stoppedAt !== null && seal.stoppedAt < seal.startedAt) ||
          seal.sealedAt < seal.startedAt))
    )
      throw cpuError('invalidTiming');
    if (seal.state === 'incomplete')
      return emptyCpuEvidence('incomplete', seal.reason);
    const { bytes } = readCpuOwned(
      directory,
      'cpu-profile.raw.json',
      CPU_LIMITS.bytes,
    );
    if (bytes.length !== seal.rawBytes || digestCpu(bytes) !== seal.rawSha256)
      throw cpuError('digestMismatch');
    const profile = JSON.parse(bytes);
    const valid = validateCpuProfile(profile);
    if (
      profile.nodes.length !== seal.nodeCount ||
      profile.samples.length !== seal.sampleCount ||
      valid.durationUs !== seal.actualDurationUs
    )
      throw cpuError('invalidSchema');
    return reduceCpuProfile(profile, createCpuCatalog(repositoryRoot));
  } catch (error) {
    return emptyCpuEvidence(
      'incomplete',
      CPU_REASONS.includes(error.reason) ? error.reason : 'invalidSchema',
    );
  }
}
