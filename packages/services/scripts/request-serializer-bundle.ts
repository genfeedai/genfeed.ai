import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const coverage = z.enum(['exact', 'unsupported', 'not_a_chunk']);
const recordSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('meta'), schema_version: z.literal(1) }),
  z.object({ type: z.literal('module'), ident: z.string(), path: z.string() }),
  z.object({
    type: z.literal('route'),
    route: z.string(),
    coverage: z.object({ entries: z.string(), groups: z.string() }),
  }),
  z.object({
    type: z.literal('output'),
    route: z.string(),
    filename: z.string(),
    modules: z.array(z.string()),
    coverage,
  }),
  z.object({
    type: z.literal('part'),
    route: z.string(),
    filename: z.string(),
    source_path: z.string(),
    size: z.number().int().nonnegative(),
    compressed_size: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('group'),
    route: z.string(),
    kind: z.string(),
    trigger_module_ident: z.string().nullable(),
    trigger_join: z.string(),
    outputs: z.array(z.string()),
  }),
]);

type AnalyzeRecord = z.infer<typeof recordSchema>;
type Group = Extract<AnalyzeRecord, { type: 'group' }>;
type Output = Extract<AnalyzeRecord, { type: 'output' }>;
type Part = Extract<AnalyzeRecord, { type: 'part' }>;

type SourceEvidence = {
  modules: number;
  sourceParts: number;
  paths: string[];
};

type OutputEvidence = {
  filename: string;
  rawSourceContributionBytes: number;
  compressedSourceContributionBytes: number;
  actualEmittedGzipBytes: null;
  sources: {
    canonical: SourceEvidence;
    runtime: SourceEvidence;
    tsJsonapi: SourceEvidence;
    lodash: SourceEvidence;
  };
  otherSourcePaths: string[];
};

type DeferredEvidence = {
  javaScriptChunks: number;
  javaScriptOutputs: string[];
  alreadyInitialJavaScriptChunks: number;
  alreadyInitialJavaScriptOutputs: string[];
  newOutputEvidence: OutputEvidence[];
  alreadyInitialOutputEvidence: OutputEvidence[];
};

export type BundleFailureDiagnostic = {
  status: 'failed';
  route: string;
  reason: string;
  initialJavaScriptChunks: number;
  forbiddenInitialSources: number;
  deferred: DeferredEvidence | null;
};

type VerificationOptions = {
  originalSources?: readonly string[];
  onFailure?: (diagnostic: BundleFailureDiagnostic) => void;
};

export const REQUEST_SERIALIZER_BUNDLE_ROUTES = [
  '/login',
  '/[orgSlug]/[brandSlug]/workspace/overview',
  '/[orgSlug]/[brandSlug]/library/assets',
  '/[orgSlug]/[brandSlug]/publishing/posts',
] as const;

function isClientJavaScript(file: string): boolean {
  return file.startsWith('[client-fs]/') && file.endsWith('.js');
}

function forbiddenSource(source: string): boolean {
  return (
    /\/packages\/serializers\//.test(source) ||
    /\/node_modules\/(?:ts-jsonapi|lodash)\//.test(source)
  );
}

export function verifyRequestSerializerBundle(
  input: Iterable<unknown>,
  routes: readonly string[] = REQUEST_SERIALIZER_BUNDLE_ROUTES,
  options: VerificationOptions = {},
) {
  const records = [...input].map((record) => recordSchema.parse(record));
  if (records.filter((record) => record.type === 'meta').length !== 1) {
    throw new Error('Expected one versioned analyzer graph');
  }
  const modules = new Map(
    records.filter((r) => r.type === 'module').map((r) => [r.ident, r.path]),
  );
  const reports = routes.map((route) => {
    const routeRecord = records.find(
      (r) => r.type === 'route' && r.route === route,
    );
    if (
      routeRecord?.type !== 'route' ||
      routeRecord.coverage.entries !== 'exact' ||
      routeRecord.coverage.groups !== 'exact'
    ) {
      throw new Error(`Missing exact analyzer route coverage: ${route}`);
    }
    const groups = records.filter(
      (r): r is Group => r.type === 'group' && r.route === route,
    );
    const outputs = new Map(
      records
        .filter((r): r is Output => r.type === 'output' && r.route === route)
        .map((r) => [r.filename, r]),
    );
    const parts = records.filter(
      (r): r is Part => r.type === 'part' && r.route === route,
    );
    function sourcesFor(files: string[]): string[] {
      return [
        ...new Set(
          files.flatMap((file) => {
            const output = outputs.get(file);
            if (!output) throw new Error(`Missing analyzer output: ${file}`);
            if (
              output.coverage === 'not_a_chunk' &&
              /\/turbopack-/.test(file) &&
              output.modules.length === 0
            )
              return [];
            if (output.coverage !== 'exact')
              throw new Error(`Unsupported analyzer output coverage: ${file}`);
            const membership = output.modules.map((ident) => {
              const source = modules.get(ident);
              if (!source) throw new Error(`Unknown analyzer module: ${ident}`);
              return source;
            });
            return [
              ...membership,
              ...parts
                .filter((part) => part.filename === file)
                .map((part) => part.source_path),
            ];
          }),
        ),
      ];
    }
    const initial = [
      ...new Set(
        groups
          .filter(
            (group) =>
              group.kind === 'bootstrap' || group.kind === 'render_dependent',
          )
          .flatMap((group) => group.outputs)
          .filter(isClientJavaScript),
      ),
    ];
    if (!initial.length)
      throw new Error(`Missing initial client outputs: ${route}`);
    const leaked = sourcesFor(initial).filter(forbiddenSource);
    function fail(
      reason: string,
      deferred: DeferredEvidence | null = null,
    ): never {
      const diagnostic: BundleFailureDiagnostic = {
        status: 'failed',
        route,
        reason,
        initialJavaScriptChunks: initial.length,
        forbiddenInitialSources: leaked.length,
        deferred,
      };
      options.onFailure?.(diagnostic);
      throw new Error(`${reason}; ${JSON.stringify(diagnostic)}`);
    }
    function outputEvidence(filename: string): OutputEvidence {
      const sources = sourcesFor([filename]);
      const output = outputs.get(filename);
      if (!output) throw new Error(`Missing analyzer output: ${filename}`);
      const modulePaths = output.modules.map(
        (ident) => modules.get(ident) ?? '',
      );
      const contributions = parts.filter((part) => part.filename === filename);
      const sourcePaths = [
        ...new Set(contributions.map((part) => part.source_path)),
      ];
      function evidence(match: RegExp): SourceEvidence {
        return {
          modules: modulePaths.filter((source) => match.test(source)).length,
          sourceParts: sourcePaths.filter((source) => match.test(source))
            .length,
          paths: sources
            .filter((source) => match.test(source))
            .slice(0, 5)
            .map((source) => source.replace(/^\[[^\]]+\]\//, '')),
        };
      }
      return {
        filename,
        rawSourceContributionBytes: contributions.reduce(
          (sum, part) => sum + part.size,
          0,
        ),
        compressedSourceContributionBytes: contributions.reduce(
          (sum, part) => sum + part.compressed_size,
          0,
        ),
        actualEmittedGzipBytes: null,
        sources: {
          canonical: evidence(/\/packages\/serializers\//),
          runtime: evidence(
            /\/packages\/services\/core\/request-serializers\.runtime\.ts/,
          ),
          tsJsonapi: evidence(/\/node_modules\/ts-jsonapi\//),
          lodash: evidence(/\/node_modules\/lodash\//),
        },
        otherSourcePaths: sources
          .filter(
            (source) =>
              !forbiddenSource(source) &&
              !source.includes(
                '/packages/services/core/request-serializers.runtime.ts',
              ),
          )
          .slice(0, 10)
          .map((source) => source.replace(/^\[[^\]]+\]\//, '')),
      };
    }
    if (leaked.length)
      fail(
        `Request serializer code in initial outputs for ${route}: ${leaked.join(', ')}`,
      );
    const deferred = groups.filter(
      (group) =>
        group.kind === 'async' &&
        group.trigger_join === 'joined' &&
        group.trigger_module_ident?.includes(
          '/packages/services/core/request-serializers.runtime.ts [app-client]',
        ),
    );
    if (route === '/login' && deferred.length === 0)
      return {
        route,
        initialJavaScriptChunks: initial.length,
        forbiddenInitialSources: 0,
        deferred: null,
      };
    if (deferred.length !== 1)
      fail(`Expected one request serializer async group: ${route}`);
    const groupFiles = [
      ...new Set(deferred[0].outputs.filter(isClientJavaScript)),
    ];
    const files = groupFiles.filter((file) => !initial.includes(file));
    const alreadyInitial = groupFiles.filter((file) => initial.includes(file));
    const chunkEvidence: DeferredEvidence = {
      javaScriptChunks: files.length,
      javaScriptOutputs: files,
      alreadyInitialJavaScriptChunks: alreadyInitial.length,
      alreadyInitialJavaScriptOutputs: alreadyInitial,
      newOutputEvidence: files.map(outputEvidence),
      alreadyInitialOutputEvidence: alreadyInitial.map(outputEvidence),
    };
    if (files.length !== 1) {
      fail(
        `Expected exactly one deferred serializer JavaScript chunk: ${route}`,
        chunkEvidence,
      );
    }
    const sources = sourcesFor(files);
    for (const required of [
      '/packages/services/core/request-serializers.runtime.ts',
      '/packages/serializers/',
      '/node_modules/ts-jsonapi/',
      '/node_modules/lodash/',
    ]) {
      if (!sources.some((source) => source.includes(required)))
        fail(`Missing deferred ${required}: ${route}`, chunkEvidence);
    }
    const contributions = parts.filter((part) => files.includes(part.filename));
    for (const required of [
      '/packages/serializers/src/',
      '/node_modules/ts-jsonapi/',
      '/node_modules/lodash/',
    ]) {
      if (!contributions.some((part) => part.source_path.includes(required)))
        fail(
          `Missing original source-map provenance ${required}: ${route}`,
          chunkEvidence,
        );
    }
    for (const source of options.originalSources ?? []) {
      if (
        !contributions.some((part) => part.source_path.endsWith(`/${source}`))
      )
        fail(
          `Missing original source-map input ${source}: ${route}`,
          chunkEvidence,
        );
    }
    return {
      route,
      initialJavaScriptChunks: initial.length,
      forbiddenInitialSources: 0,
      deferred: {
        ...chunkEvidence,
        originalSourceFiles: options.originalSources?.length ?? null,
        requiredSources: {
          canonical: sources.filter((source) =>
            source.includes('/packages/serializers/'),
          ).length,
          tsJsonapi: sources.filter((source) =>
            source.includes('/node_modules/ts-jsonapi/'),
          ).length,
          lodash: sources.filter((source) =>
            source.includes('/node_modules/lodash/'),
          ).length,
        },
        rawSourceBytes: contributions.reduce((sum, part) => sum + part.size, 0),
        compressedSourceBytes: contributions.reduce(
          (sum, part) => sum + part.compressed_size,
          0,
        ),
      },
    };
  });
  return {
    schemaVersion: 1,
    membership: 'exact modules and concatenated source parts',
    byteAccounting:
      'Analyzer source contribution sums; actual emitted gzip is unavailable without a validated asset mapping.',
    routes: reports,
  };
}

export function readPinnedAppRuntime(appDirectory = path.resolve('apps/app')) {
  const appManifest = z
    .object({ dependencies: z.object({ next: z.string() }) })
    .parse(
      JSON.parse(readFileSync(path.join(appDirectory, 'package.json'), 'utf8')),
    );
  const appRequire = createRequire(path.join(appDirectory, 'package.json'));
  const nextManifest = z
    .object({ version: z.string() })
    .parse(appRequire('next/package.json'));
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

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const graph = process.argv[2];
  const out = process.argv[3];
  if (!graph || !out)
    throw new Error(
      'Usage: request-serializer-bundle.ts <graph.jsonl> <report.json> [route]',
    );
  const records: unknown[] = readFileSync(graph, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const runtime = readPinnedAppRuntime();
  const packageProof = z
    .object({
      schemaVersion: z.literal(1),
      inputs: z.record(
        z.string(),
        z.object({
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          bytesInOutput: z.number().positive(),
          sourceMaps: z.array(
            z.object({
              path: z.string(),
              sha256: z.string().regex(/^[a-f0-9]{64}$/),
            }),
          ),
          originalSources: z
            .array(
              z.object({
                path: z.string(),
                contentSha256: z
                  .string()
                  .regex(/^[a-f0-9]{64}$/)
                  .nullable(),
                evidence: z.enum([
                  'source-content-and-disk',
                  'local-map-content',
                  'local-map-identity-only',
                ]),
              }),
            )
            .min(1),
        }),
      ),
    })
    .parse(
      JSON.parse(
        readFileSync(
          'packages/serializers/dist/request-runtime.provenance.json',
          'utf8',
        ),
      ),
    );
  const originalSources = [
    ...new Set(
      Object.values(packageProof.inputs).flatMap((input) =>
        input.originalSources.map((source) => source.path),
      ),
    ),
  ].filter((source) =>
    /^(?:packages\/serializers\/src\/|node_modules\/(?:ts-jsonapi|lodash)\/)/.test(
      source,
    ),
  );
  if (!originalSources.length)
    throw new Error('Missing original package source provenance');
  const report = verifyRequestSerializerBundle(
    records,
    process.argv[4] ? [process.argv[4]] : undefined,
    {
      originalSources,
      onFailure: (diagnostic) => {
        writeFileSync(
          out,
          `${JSON.stringify({ schemaVersion: 1, ...diagnostic, runtime }, null, 2)}\n`,
        );
      },
    },
  );
  writeFileSync(out, `${JSON.stringify({ ...report, runtime }, null, 2)}\n`);
  console.info(
    'Request serializers absent from initial JS; one deferred chunk per write route.',
  );
}
