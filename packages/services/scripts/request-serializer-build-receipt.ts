import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

type PinnedAppRuntime = {
  nextVersion: string;
  pinnedNextVersion: string;
  sourceSha: string;
};

export function readPinnedAppRuntime(appDirectory = path.resolve('apps/app')) {
  const appManifest = z
    .object({ dependencies: z.object({ next: z.string() }) })
    .parse(
      JSON.parse(readFileSync(path.join(appDirectory, 'package.json'), 'utf8')),
    );
  const nextManifest = z
    .object({ version: z.string() })
    .parse(
      createRequire(path.join(appDirectory, 'package.json'))(
        'next/package.json',
      ),
    );
  if (nextManifest.version !== appManifest.dependencies.next)
    throw new Error('Bundle proof requires the pinned Next.js runtime');
  return {
    nextVersion: nextManifest.version,
    pinnedNextVersion: appManifest.dependencies.next,
    sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
  };
}

export function createRequestSerializerBuildReceipt(
  config: Uint8Array,
  runtime: PinnedAppRuntime,
) {
  const source = Buffer.from(config).toString('utf8');
  if (
    /\b(?:requestCost|maxChunkCountPerGroup|maxMergeChunkSize)\b/.test(source)
  )
    throw new Error(
      'Cannot label explicit chunking override as the production default',
    );
  return {
    schemaVersion: 1,
    mode: 'production-default',
    effectiveRequestCost: 200000,
    effectiveMaxChunkCountPerGroup: 40,
    effectiveMaxMergeChunkSize: 200000,
    runtime,
    nextConfigSha256: createHash('sha256').update(config).digest('hex'),
  };
}

export function writeRequestSerializerBuildReceipt(
  configPath: string,
  out: string,
  runtime: PinnedAppRuntime,
): void {
  const report = createRequestSerializerBuildReceipt(
    readFileSync(configPath),
    runtime,
  );
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}

const artifactPaths = {
  javaScript: 'packages/serializers/dist/request-runtime.bundle.js',
  sourceMap: 'packages/serializers/dist/request-runtime.bundle.js.map',
  provenance: 'packages/serializers/dist/request-runtime.provenance.json',
} as const;
const preflightPath = '.bundle-size/request-serializers-build.json';
const eventPath = '.bundle-size/request-serializers-input.jsonl';
const verifiedPath = '.bundle-size/request-serializers-input.json';
const hash = (input: Uint8Array | string) =>
  createHash('sha256').update(input).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const artifactSchema = z
  .object({
    path: z.string(),
    sha256: digest,
    bytes: z
      .number()
      .int()
      .positive()
      .max(16 * 1024 * 1024),
  })
  .strict();
const inputSchema = z
  .object({
    buildId: z.uuid(),
    artifacts: z
      .object({
        javaScript: artifactSchema,
        sourceMap: artifactSchema,
        provenance: artifactSchema,
      })
      .strict(),
  })
  .strict();
const buildSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal('production-default'),
  nextConfigSha256: digest,
  runtime: z
    .object({
      nextVersion: z.string(),
      pinnedNextVersion: z.string(),
      sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
    })
    .strict(),
  input: inputSchema,
});
const eventSchema = z
  .object({
    schemaVersion: z.literal(1),
    buildId: z.uuid(),
    resourcePath: z.literal(artifactPaths.javaScript),
    target: z.literal('web'),
    mode: z.literal('production'),
    inputSha256: digest,
    inputBytes: z.number().int().positive(),
    preflightSha256: digest,
  })
  .strict();

function readBounded(root: string, relative: string, limit: number): Buffer {
  const absolute = path.join(root, relative);
  if (realpathSync(absolute) !== absolute)
    throw new Error('Unexpected authenticated artifact path');
  const stat = statSync(absolute);
  if (!stat.isFile() || stat.size > limit)
    throw new Error('Input receipt read budget exceeded');
  const bytes = readFileSync(absolute);
  if (bytes.length > limit)
    throw new Error('Input receipt read budget exceeded');
  return bytes;
}

function readArtifacts(root: string) {
  let totalBytes = 0;
  const descriptor = (relative: string) => {
    const bytes = readBounded(root, relative, 16 * 1024 * 1024);
    totalBytes += bytes.length;
    if (totalBytes > 16 * 1024 * 1024)
      throw new Error('Artifact read budget exceeded');
    return { path: relative, sha256: hash(bytes), bytes: bytes.length };
  };
  const artifacts = {
    javaScript: descriptor(artifactPaths.javaScript),
    sourceMap: descriptor(artifactPaths.sourceMap),
    provenance: descriptor(artifactPaths.provenance),
  };
  const proof = z
    .object({
      schemaVersion: z.literal(1),
      output: z.literal(artifactPaths.javaScript),
      sourceMap: z.literal(artifactPaths.sourceMap),
      sha256: digest,
      sourceMapSha256: digest,
    })
    .parse(
      JSON.parse(
        readBounded(root, artifactPaths.provenance, 16 * 1024 * 1024).toString(
          'utf8',
        ),
      ),
    );
  if (
    proof.sha256 !== artifacts.javaScript.sha256 ||
    proof.sourceMapSha256 !== artifacts.sourceMap.sha256
  )
    throw new Error(
      'Package provenance does not authenticate the actual JS/source map',
    );
  return artifacts;
}

export function prepareRequestSerializerInput(
  rootDirectory: string,
  runtime: PinnedAppRuntime,
) {
  const root = realpathSync(rootDirectory);
  const input = { buildId: randomUUID(), artifacts: readArtifacts(root) };
  const report = {
    ...createRequestSerializerBuildReceipt(
      readBounded(root, 'apps/app/next.config.ts', 1024 * 1024),
      runtime,
    ),
    input,
  };
  mkdirSync(path.join(root, '.bundle-size'), { recursive: true });
  rmSync(path.join(root, eventPath), { force: true });
  rmSync(path.join(root, verifiedPath), { force: true });
  writeFileSync(
    path.join(root, preflightPath),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

export function finalizeRequestSerializerInput(
  rootDirectory: string,
  runtime: PinnedAppRuntime,
) {
  const root = realpathSync(rootDirectory);
  const raw = readBounded(root, preflightPath, 256 * 1024);
  const preflight = buildSchema.parse(JSON.parse(raw.toString('utf8')));
  if (JSON.stringify(preflight.runtime) !== JSON.stringify(runtime))
    throw new Error('Stale input receipt runtime/head');
  if (
    preflight.nextConfigSha256 !==
    hash(readBounded(root, 'apps/app/next.config.ts', 1024 * 1024))
  )
    throw new Error('Changed compiler configuration');
  const actual = readArtifacts(root);
  for (const key of ['javaScript', 'sourceMap', 'provenance'] as const) {
    if (
      JSON.stringify(actual[key]) !==
      JSON.stringify(preflight.input.artifacts[key])
    )
      throw new Error('Changed authenticated compiler artifact');
  }
  const rows = readBounded(root, eventPath, 256 * 1024)
    .toString('utf8')
    .trim()
    .split('\n')
    .filter(Boolean);
  if (!rows.length || rows.length > 128)
    throw new Error('Missing fresh compiler input or event budget exceeded');
  const preflightSha256 = hash(raw);
  for (const row of rows) {
    const event = eventSchema.parse(JSON.parse(row));
    if (
      event.buildId !== preflight.input.buildId ||
      event.preflightSha256 !== preflightSha256 ||
      event.inputSha256 !== actual.javaScript.sha256 ||
      event.inputBytes !== actual.javaScript.bytes
    )
      throw new Error('Conflicting or stale actual compiler input');
  }
  const report = {
    schemaVersion: 1,
    status: 'verified',
    runtime,
    ...preflight.input,
    preflightSha256,
    compilerCallbacks: rows.length,
    resourcePath: artifactPaths.javaScript,
  } as const;
  writeFileSync(
    path.join(root, verifiedPath),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const out = process.argv[2];
  const finalize = process.argv[3] === '--finalize-input';
  if (
    !out ||
    (process.argv.length !== 3 && !(process.argv.length === 4 && finalize))
  )
    throw new Error(
      'Usage: request-serializer-build-receipt.ts <report.json> [--finalize-input]; chunking trials are not supported',
    );
  if (finalize) {
    if (path.resolve(out) !== path.resolve(verifiedPath))
      throw new Error('Input finalization requires the fixed evidence path');
    try {
      finalizeRequestSerializerInput(process.cwd(), readPinnedAppRuntime());
    } catch (error) {
      writeFileSync(
        out,
        `${JSON.stringify({ schemaVersion: 1, status: 'failed', reason: error instanceof Error ? error.message : 'Unknown compiler input failure' }, null, 2)}\n`,
      );
      throw error;
    }
  } else {
    if (path.resolve(out) !== path.resolve(preflightPath))
      throw new Error('Input preflight requires the fixed build receipt path');
    prepareRequestSerializerInput(process.cwd(), readPinnedAppRuntime());
  }
}
