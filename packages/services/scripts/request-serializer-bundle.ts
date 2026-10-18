import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  finalizeRequestSerializerInput,
  readPinnedAppRuntime,
} from './request-serializer-build-receipt';

export { readPinnedAppRuntime } from './request-serializer-build-receipt';

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
  compilerInput?: Pick<
    ReturnType<typeof finalizeRequestSerializerInput>,
    | 'resourcePath'
    | 'buildId'
    | 'artifacts'
    | 'preflightSha256'
    | 'compilerCallbacks'
  >;
  onFailure?: (diagnostic: BundleFailureDiagnostic) => void;
};

export const REQUEST_SERIALIZER_BUNDLE_ROUTES = [
  '/login',
  '/[orgSlug]/[brandSlug]/workspace/overview',
  '/[orgSlug]/[brandSlug]/library/assets',
  '/[orgSlug]/[brandSlug]/publishing/posts',
] as const;

const originalSourcePrefixes = [
  'packages/serializers/src/',
  'node_modules/ts-jsonapi/',
  'node_modules/lodash/',
] as const;

function matchesOriginalSourcePrefix(source: string, prefix: string): boolean {
  const segments = source.split('/');
  if (
    source.includes('\\') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  )
    return false;
  if (prefix.startsWith('node_modules/')) {
    const installedPackage = segments.lastIndexOf('node_modules');
    return (
      installedPackage !== -1 &&
      segments.length > installedPackage + 2 &&
      segments[installedPackage + 1] === prefix.split('/')[1]
    );
  }
  return source.startsWith(prefix) && source.length > prefix.length;
}

export function selectRequestSerializerOriginalSources(
  sources: readonly string[],
): string[] {
  return sources.filter((source) =>
    originalSourcePrefixes.some((prefix) =>
      matchesOriginalSourcePrefix(source, prefix),
    ),
  );
}

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
    const contributions = parts.filter((part) => files.includes(part.filename));
    let authenticatedPackageInput = null;
    if (options.compilerInput) {
      const exactSource = `[project]/${options.compilerInput.resourcePath}`;
      if (
        options.compilerInput.resourcePath !==
        'packages/serializers/dist/request-runtime.bundle.js'
      )
        fail('Unexpected authenticated compiler resource', chunkEvidence);
      const artifactModules = records.filter(
        (record) =>
          record.type === 'module' &&
          record.path === exactSource &&
          record.ident.startsWith(`${exactSource} [app-client] (ecmascript)`),
      );
      if (!artifactModules.length)
        fail('Missing exact global app-client compiler module', chunkEvidence);
      const actualParts = contributions.filter(
        (part) => part.source_path === exactSource && part.size > 0,
      );
      if (!actualParts.length)
        fail(
          'Missing exact positive compiler input source part',
          chunkEvidence,
        );
      const wrapper =
        '[project]/packages/services/core/request-serializers.runtime.ts';
      if (
        !files.some((filename) =>
          outputs
            .get(filename)
            ?.modules.some((ident) => modules.get(ident) === wrapper),
        )
      )
        fail('Missing actual runtime wrapper output membership', chunkEvidence);
      for (const required of originalSourcePrefixes) {
        if (
          !options.originalSources?.some((source) =>
            matchesOriginalSourcePrefix(source, required),
          )
        )
          fail(
            `Missing authenticated package source ${required}`,
            chunkEvidence,
          );
      }
      authenticatedPackageInput = {
        ...options.compilerInput,
        globalModuleIdentities: artifactModules.map((record) =>
          record.type === 'module' ? record.ident : '',
        ),
        positiveSourceParts: actualParts.length,
        originalPackageSourceFiles: options.originalSources?.length ?? 0,
        evidence:
          'Actual byte-identical compiler callback and immutable package JS/map/provenance; global module index and positive optimized-output source part. Original source identities come from the authenticated package map, not synthetic analyzer parts.',
      };
    } else {
      for (const required of [
        '/packages/services/core/request-serializers.runtime.ts',
        '/packages/serializers/',
        '/node_modules/ts-jsonapi/',
        '/node_modules/lodash/',
      ]) {
        if (!sources.some((source) => source.includes(required)))
          fail(`Missing deferred ${required}: ${route}`, chunkEvidence);
      }
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
    }
    return {
      route,
      initialJavaScriptChunks: initial.length,
      forbiddenInitialSources: 0,
      deferred: {
        ...chunkEvidence,
        originalSourceFiles: options.compilerInput
          ? null
          : (options.originalSources?.length ?? null),
        authenticatedPackageInput,
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
  const compilerInput = finalizeRequestSerializerInput(process.cwd(), runtime);
  const packageProof = z
    .object({
      schemaVersion: z.literal(1),
      output: z.literal('packages/serializers/dist/request-runtime.bundle.js'),
      sourceMap: z.literal(
        'packages/serializers/dist/request-runtime.bundle.js.map',
      ),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      sourceMapSha256: z.string().regex(/^[a-f0-9]{64}$/),
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
  if (
    packageProof.sha256 !== compilerInput.artifacts.javaScript.sha256 ||
    packageProof.sourceMapSha256 !== compilerInput.artifacts.sourceMap.sha256
  )
    throw new Error(
      'Compiler input does not authenticate the actual original source map',
    );
  const actualMap = z
    .object({
      version: z.literal(3),
      sources: z.array(z.string()).max(512),
      sourcesContent: z.array(z.string().nullable()).max(512),
      sourceRoot: z.string().optional(),
      mappings: z.string().min(1),
    })
    .parse(JSON.parse(readFileSync(packageProof.sourceMap, 'utf8')));
  if (actualMap.sources.length !== actualMap.sourcesContent.length)
    throw new Error('Incomplete authenticated source-map content');
  const mapIdentities = new Map(
    actualMap.sources.map((source, index) => {
      const absolute = path.resolve(
        path.dirname(packageProof.sourceMap),
        actualMap.sourceRoot ?? '',
        source,
      );
      const relative = path
        .relative(process.cwd(), absolute)
        .split(path.sep)
        .join('/');
      const marker = absolute.lastIndexOf('/node_modules/');
      const identity =
        relative.startsWith('../') && marker !== -1
          ? absolute.slice(marker + 1)
          : relative;
      return [identity, actualMap.sourcesContent[index]];
    }),
  );
  const sha256 = (content: string) =>
    createHash('sha256').update(content).digest('hex');
  for (const [inputPath, input] of Object.entries(packageProof.inputs)) {
    for (const original of input.originalSources) {
      if (!mapIdentities.has(original.path))
        throw new Error(
          `Missing authenticated original identity: ${original.path}`,
        );
      const content = mapIdentities.get(original.path);
      if (content === null) {
        if (
          original.contentSha256 !== null ||
          original.evidence !== 'local-map-identity-only' ||
          !input.sourceMaps.length ||
          !inputPath.startsWith('node_modules/')
        )
          throw new Error('Unproven null vendor source identity');
      } else if (
        typeof content !== 'string' ||
        sha256(content) !== original.contentSha256 ||
        original.evidence === 'local-map-identity-only'
      )
        throw new Error(
          `Changed authenticated original content: ${original.path}`,
        );
      if (
        original.path.startsWith('packages/serializers/src/') &&
        (original.evidence !== 'source-content-and-disk' ||
          sha256(readFileSync(original.path, 'utf8')) !==
            original.contentSha256)
      )
        throw new Error('Changed canonical source content');
    }
  }
  const originalSources = selectRequestSerializerOriginalSources([
    ...new Set(
      Object.values(packageProof.inputs).flatMap((input) =>
        input.originalSources.map((source) => source.path),
      ),
    ),
  ]);
  if (!originalSources.length)
    throw new Error('Missing original package source provenance');
  const report = verifyRequestSerializerBundle(
    records,
    process.argv[4] ? [process.argv[4]] : undefined,
    {
      originalSources,
      compilerInput,
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
