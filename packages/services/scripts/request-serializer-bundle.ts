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
    if (leaked.length)
      throw new Error(
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
      throw new Error(`Expected one request serializer async group: ${route}`);
    const files = [...new Set(deferred[0].outputs.filter(isClientJavaScript))];
    if (files.length !== 1 || files.some((file) => initial.includes(file))) {
      throw new Error(
        `Expected exactly one deferred serializer JavaScript chunk: ${route}`,
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
        throw new Error(`Missing deferred ${required}: ${route}`);
    }
    const contributions = parts.filter((part) => files.includes(part.filename));
    return {
      route,
      initialJavaScriptChunks: initial.length,
      forbiddenInitialSources: 0,
      deferred: {
        javaScriptChunks: files.length,
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
    routes: reports,
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
  const report = verifyRequestSerializerBundle(
    records,
    process.argv[4] ? [process.argv[4]] : undefined,
  );
  const appDirectory = path.resolve('apps/app');
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
  const runtime = {
    nextVersion: nextManifest.version,
    pinnedNextVersion: appManifest.dependencies.next,
    sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
  };
  writeFileSync(out, `${JSON.stringify({ ...report, runtime }, null, 2)}\n`);
  console.info(
    'Request serializers absent from initial JS; one deferred chunk per write route.',
  );
}
