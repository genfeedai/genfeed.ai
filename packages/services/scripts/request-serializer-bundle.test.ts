import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REQUEST_SERIALIZER_BUNDLE_ROUTES,
  selectRequestSerializerOriginalSources,
  verifyRequestSerializerBundle,
} from '@services/scripts/request-serializer-bundle';
import { describe, expect, it } from 'vitest';

function graph() {
  return [
    { type: 'meta', schema_version: 1 },
    {
      type: 'module',
      ident: 'read',
      path: '[project]/packages/services/core/base.service.ts',
    },
    {
      type: 'module',
      ident: 'runtime',
      path: '[project]/packages/services/core/request-serializers.runtime.ts',
    },
    {
      type: 'module',
      ident: 'jsonapi',
      path: '[project]/node_modules/ts-jsonapi/lib/index.js',
    },
    {
      type: 'module',
      ident: 'lodash',
      path: '[project]/node_modules/lodash/lodash.js',
    },
    ...REQUEST_SERIALIZER_BUNDLE_ROUTES.flatMap((route) => [
      { type: 'route', route, coverage: { entries: 'exact', groups: 'exact' } },
      {
        type: 'output',
        route,
        filename: '[client-fs]/initial.js',
        modules: ['read'],
        coverage: 'exact',
      },
      {
        type: 'output',
        route,
        filename: '[client-fs]/write.js',
        modules: ['runtime', 'jsonapi', 'lodash'],
        coverage: 'exact',
      },
      {
        type: 'output',
        route,
        filename: '[client-fs]/vendor.js',
        modules: ['read'],
        coverage: 'exact',
      },
      {
        type: 'part',
        route,
        filename: '[client-fs]/write.js',
        source_path:
          '[project]/packages/serializers/src/server/ingredients/image.serializer.ts',
        size: 1000,
        compressed_size: 400,
      },
      ...['ts-jsonapi/lib/index.js', 'lodash/lodash.js'].map((source) => ({
        type: 'part',
        route,
        filename: '[client-fs]/write.js',
        source_path: `[project]/node_modules/${source}`,
        size: 0,
        compressed_size: 0,
      })),
      {
        type: 'group',
        route,
        kind: 'bootstrap',
        trigger_module_ident: 'read',
        trigger_join: 'joined',
        outputs: ['[client-fs]/initial.js'],
      },
      {
        type: 'group',
        route,
        kind: 'async',
        trigger_module_ident:
          '[project]/packages/services/core/request-serializers.runtime.ts [app-client] (ecmascript)',
        trigger_join: 'joined',
        outputs: ['[client-fs]/write.js'],
      },
    ]),
  ];
}

const artifactPath = 'packages/serializers/dist/request-runtime.bundle.js';
const artifactModule = `[project]/${artifactPath} [app-client] (ecmascript)`;
const originalSources = [
  'packages/serializers/src/index.ts',
  'node_modules/ts-jsonapi/lib/index.ts',
  'node_modules/lodash/lodash.js',
];
const descriptor = (source: string) => ({
  path: source,
  sha256: 'a'.repeat(64),
  bytes: 1000,
});
const compilerInput = {
  resourcePath: artifactPath,
  buildId: '00000000-0000-4000-8000-000000000001',
  preflightSha256: 'b'.repeat(64),
  compilerCallbacks: 1,
  artifacts: {
    javaScript: descriptor(artifactPath),
    sourceMap: descriptor(`${artifactPath}.map`),
    provenance: descriptor(
      'packages/serializers/dist/request-runtime.provenance.json',
    ),
  },
} as const;
function compiledGraph() {
  return [
    ...graph()
      .filter((record) => record.type !== 'part')
      .map((record) =>
        record.type === 'output' &&
        'filename' in record &&
        record.filename === '[client-fs]/write.js'
          ? { ...record, modules: ['runtime'] }
          : record,
      ),
    {
      type: 'module',
      ident: artifactModule,
      path: `[project]/${artifactPath}`,
    },
    ...REQUEST_SERIALIZER_BUNDLE_ROUTES.map((route) => ({
      type: 'part',
      route,
      filename: '[client-fs]/write.js',
      source_path: `[project]/${artifactPath}`,
      size: 1000,
      compressed_size: 400,
    })),
  ];
}

describe('serializer bundle evidence', () => {
  it('proves initial absence and a single deferred group including concatenated canonical code', () => {
    const report = verifyRequestSerializerBundle(graph());
    expect(report.routes).toHaveLength(4);
    expect(report.routes[1].deferred).toMatchObject({
      javaScriptChunks: 1,
      javaScriptOutputs: ['[client-fs]/write.js'],
      alreadyInitialJavaScriptChunks: 0,
      alreadyInitialJavaScriptOutputs: [],
      requiredSources: { canonical: 1, tsJsonapi: 1, lodash: 1 },
      rawSourceBytes: 1000,
      compressedSourceBytes: 400,
    });
  });

  it('counts only additional network chunks when an async group shares initial dependencies', () => {
    const report = verifyRequestSerializerBundle(
      graph().map((record) =>
        record.type === 'group' && 'kind' in record && record.kind === 'async'
          ? {
              ...record,
              outputs: ['[client-fs]/initial.js', '[client-fs]/write.js'],
            }
          : record,
      ),
    );

    expect(report.routes[1].deferred).toMatchObject({
      javaScriptChunks: 1,
      javaScriptOutputs: ['[client-fs]/write.js'],
      alreadyInitialJavaScriptChunks: 1,
      alreadyInitialJavaScriptOutputs: ['[client-fs]/initial.js'],
      requiredSources: { canonical: 1, tsJsonapi: 1, lodash: 1 },
    });
  });

  it('reports exact source membership and labels contribution bytes without claiming emitted gzip', () => {
    const report = verifyRequestSerializerBundle(graph());
    expect(report.byteAccounting).toContain('source contribution sums');
    expect(report.routes[1].deferred?.newOutputEvidence).toEqual([
      {
        filename: '[client-fs]/write.js',
        rawSourceContributionBytes: 1000,
        compressedSourceContributionBytes: 400,
        actualEmittedGzipBytes: null,
        sources: {
          canonical: {
            modules: 0,
            sourceParts: 1,
            paths: [
              'packages/serializers/src/server/ingredients/image.serializer.ts',
            ],
          },
          runtime: {
            modules: 1,
            sourceParts: 0,
            paths: ['packages/services/core/request-serializers.runtime.ts'],
          },
          tsJsonapi: {
            modules: 1,
            sourceParts: 1,
            paths: ['node_modules/ts-jsonapi/lib/index.js'],
          },
          lodash: {
            modules: 1,
            sourceParts: 1,
            paths: ['node_modules/lodash/lodash.js'],
          },
        },
        otherSourcePaths: [],
      },
    ]);
  });

  it('writes compact new/cached output diagnostics before rejecting a genuine two-request split', () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), 'serializer-diagnostic-'),
    );
    const file = path.join(directory, 'failure.json');
    try {
      expect(() =>
        verifyRequestSerializerBundle(
          graph().map((record) =>
            record.type === 'group' &&
            'kind' in record &&
            record.kind === 'async'
              ? {
                  ...record,
                  outputs: [
                    '[client-fs]/initial.js',
                    '[client-fs]/write.js',
                    '[client-fs]/vendor.js',
                  ],
                }
              : record,
          ),
          undefined,
          {
            onFailure: (diagnostic) =>
              writeFileSync(file, JSON.stringify(diagnostic)),
          },
        ),
      ).toThrow('Expected exactly one deferred serializer JavaScript chunk');
      expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
        status: 'failed',
        route: '/login',
        forbiddenInitialSources: 0,
        deferred: {
          javaScriptChunks: 2,
          javaScriptOutputs: ['[client-fs]/write.js', '[client-fs]/vendor.js'],
          alreadyInitialJavaScriptChunks: 1,
          alreadyInitialJavaScriptOutputs: ['[client-fs]/initial.js'],
          newOutputEvidence: [
            {
              filename: '[client-fs]/write.js',
              sources: {
                canonical: { modules: 0, sourceParts: 1 },
                runtime: { modules: 1 },
                tsJsonapi: { modules: 1 },
                lodash: { modules: 1 },
              },
            },
            {
              filename: '[client-fs]/vendor.js',
              otherSourcePaths: ['packages/services/core/base.service.ts'],
            },
          ],
          alreadyInitialOutputEvidence: [
            {
              filename: '[client-fs]/initial.js',
              actualEmittedGzipBytes: null,
            },
          ],
        },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects generated-artifact membership without original canonical source-map provenance', () => {
    expect(() =>
      verifyRequestSerializerBundle(
        graph().map((record) =>
          record.type === 'part' &&
          'source_path' in record &&
          typeof record.source_path === 'string' &&
          record.source_path.includes('/packages/serializers/src/')
            ? {
                ...record,
                source_path:
                  '[project]/packages/serializers/dist/request-runtime.bundle.js',
              }
            : record,
        ),
      ),
    ).toThrow(
      'Missing original source-map provenance /packages/serializers/src/',
    );
  });

  it.each(['ts-jsonapi', 'lodash'])(
    'requires original %s source parts even when an outer module has matching membership',
    (vendor) => {
      expect(() =>
        verifyRequestSerializerBundle(
          graph().filter(
            (record) =>
              !(
                record.type === 'part' &&
                'source_path' in record &&
                typeof record.source_path === 'string' &&
                record.source_path.includes(`/node_modules/${vendor}/`)
              ),
          ),
        ),
      ).toThrow(
        `Missing original source-map provenance /node_modules/${vendor}/`,
      );
    },
  );

  it('checks every original canonical/vendor input recorded by the package build', () => {
    const originalSources = [
      'packages/serializers/src/server/ingredients/image.serializer.ts',
      'node_modules/ts-jsonapi/lib/index.js',
      'node_modules/lodash/lodash.js',
    ];
    expect(
      verifyRequestSerializerBundle(graph(), undefined, { originalSources })
        .routes[1].deferred?.originalSourceFiles,
    ).toBe(3);
    expect(() =>
      verifyRequestSerializerBundle(graph(), undefined, {
        originalSources: [
          ...originalSources,
          'packages/serializers/src/server/missing.serializer.ts',
        ],
      }),
    ).toThrow(
      'Missing original source-map input packages/serializers/src/server/missing.serializer.ts',
    );
  });

  it('fails closed on unsupported schema and coverage', () => {
    expect(() =>
      verifyRequestSerializerBundle([{ type: 'meta', schema_version: 2 }]),
    ).toThrow();
    expect(() =>
      verifyRequestSerializerBundle(
        graph().map((record) =>
          record.type === 'output'
            ? { ...record, coverage: 'unsupported' }
            : record,
        ),
      ),
    ).toThrow('Unsupported analyzer output coverage');
  });

  it('rejects inlined canonical source even when module membership contains only a safe outer module', () => {
    expect(() =>
      verifyRequestSerializerBundle([
        ...graph(),
        {
          type: 'part',
          route: '/login',
          filename: '[client-fs]/initial.js',
          source_path: '[project]/packages/serializers/src/configs/image.ts',
          size: 5,
          compressed_size: 3,
        },
      ]),
    ).toThrow('Request serializer code in initial outputs');
  });

  it('rejects library modules leaked into first load', () => {
    expect(() =>
      verifyRequestSerializerBundle(
        graph().map((record) =>
          record.type === 'output' &&
          'filename' in record &&
          record.filename === '[client-fs]/initial.js'
            ? { ...record, modules: ['lodash'] }
            : record,
        ),
      ),
    ).toThrow('Request serializer code in initial outputs');
  });

  it('rejects missing evidence, unknown modules and multiple deferred chunk requests', () => {
    expect(() =>
      verifyRequestSerializerBundle(
        graph().filter((record) => record.type !== 'route'),
      ),
    ).toThrow('Missing exact analyzer route coverage');
    expect(() =>
      verifyRequestSerializerBundle(
        graph().map((record) =>
          record.type === 'output'
            ? { ...record, modules: ['unknown'] }
            : record,
        ),
      ),
    ).toThrow('Unknown analyzer module');
    expect(() =>
      verifyRequestSerializerBundle(
        graph().map((record) =>
          record.type === 'group' && 'kind' in record && record.kind === 'async'
            ? {
                ...record,
                outputs: ['[client-fs]/write.js', '[client-fs]/vendor.js'],
              }
            : record,
        ),
      ),
    ).toThrow(
      '"javaScriptChunks":2,"javaScriptOutputs":["[client-fs]/write.js","[client-fs]/vendor.js"],"alreadyInitialJavaScriptChunks":0',
    );
  });
  it('selects only full canonical or installed package boundaries while preserving raw flat and Bun paths', () => {
    const genuine = [
      originalSources[0],
      originalSources[1],
      originalSources[2],
      'node_modules/.bun/ts-jsonapi@2.1.3/node_modules/ts-jsonapi/src/serializer.ts',
      'node_modules/.bun/lodash@4.18.1/node_modules/lodash/lodash.js',
    ];
    const spoofed = [
      'node_modules/.bun/ts-jsonapi@2.1.3/ts-jsonapi/src/serializer.ts',
      'node_modules/.bun/ts-jsonapi@2.1.3/node_modules/ts-jsonapi-fake/src/serializer.ts',
      'not_node_modules/ts-jsonapi/src/serializer.ts',
      'node_modules/lodash/../../ts-jsonapi/src/serializer.ts',
      'node_modules/lodash/',
      'packages/serializers/src-fake/index.ts',
    ];
    expect(
      selectRequestSerializerOriginalSources([...genuine, ...spoofed]),
    ).toEqual(genuine);
  });

  it('accepts authenticated full Bun vendor paths without rewriting their original identities', () => {
    const bunOriginals = [
      originalSources[0],
      'node_modules/.bun/ts-jsonapi@2.1.3/node_modules/ts-jsonapi/src/serializer.ts',
      'node_modules/.bun/lodash@4.18.1/node_modules/lodash/lodash.js',
    ];
    const report = verifyRequestSerializerBundle(compiledGraph(), undefined, {
      compilerInput,
      originalSources: bunOriginals,
    });
    expect(report.routes[1].deferred?.authenticatedPackageInput).toMatchObject({
      originalPackageSourceFiles: 3,
      positiveSourceParts: 1,
      globalModuleIdentities: [artifactModule],
    });
  });

  it.each([
    'node_modules/.bun/ts-jsonapi@2.1.3/ts-jsonapi/src/serializer.ts',
    'node_modules/.bun/ts-jsonapi@2.1.3/node_modules/ts-jsonapi-fake/src/serializer.ts',
    'not_node_modules/ts-jsonapi/src/serializer.ts',
    'node_modules/lodash/../../ts-jsonapi/src/serializer.ts',
  ])('rejects missing or spoofed Bun vendor boundaries: %s', (spoof) => {
    expect(() =>
      verifyRequestSerializerBundle(compiledGraph(), undefined, {
        compilerInput,
        originalSources: [originalSources[0], spoof, originalSources[2]],
      }),
    ).toThrow('authenticated package source');
  });

  it('joins authenticated actual input with the global native module index and concatenated positive output part', () => {
    const result = verifyRequestSerializerBundle(compiledGraph(), undefined, {
      compilerInput,
      originalSources,
    });
    expect(result.routes[1].deferred).toMatchObject({
      javaScriptChunks: 1,
      originalSourceFiles: null,
      requiredSources: { canonical: 1, tsJsonapi: 0, lodash: 0 },
      authenticatedPackageInput: {
        globalModuleIdentities: [artifactModule],
        positiveSourceParts: 1,
        originalPackageSourceFiles: 3,
        preflightSha256: compilerInput.preflightSha256,
      },
    });
    expect(
      result.routes[1].deferred?.newOutputEvidence[0].sources.canonical,
    ).toMatchObject({ modules: 0, sourceParts: 1 });
  });

  it('rejects part-only or wrong-path global compiler module evidence', () => {
    for (const records of [
      compiledGraph().filter(
        (record) => !('ident' in record) || record.ident !== artifactModule,
      ),
      compiledGraph().map((record) =>
        'ident' in record && record.ident === artifactModule
          ? { ...record, path: '[project]/other/request-runtime.bundle.js' }
          : record,
      ),
    ])
      expect(() =>
        verifyRequestSerializerBundle(records, undefined, {
          compilerInput,
          originalSources,
        }),
      ).toThrow('exact global app-client');
  });

  it('rejects global-index-only, wrong-path or zero-byte optimized source parts', () => {
    for (const records of [
      compiledGraph().filter((record) => record.type !== 'part'),
      compiledGraph().map((record) =>
        record.type === 'part'
          ? {
              ...record,
              source_path: '[project]/other/request-runtime.bundle.js',
            }
          : record,
      ),
      compiledGraph().map((record) =>
        record.type === 'part' ? { ...record, size: 0 } : record,
      ),
    ])
      expect(() =>
        verifyRequestSerializerBundle(records, undefined, {
          compilerInput,
          originalSources,
        }),
      ).toThrow('exact positive compiler input');
  });

  it('requires actual runtime wrapper membership in the single new output independently of the global index', () => {
    const records = compiledGraph().map((record) =>
      record.type === 'output' &&
      'filename' in record &&
      record.filename === '[client-fs]/write.js'
        ? { ...record, modules: [] }
        : record,
    );
    expect(() =>
      verifyRequestSerializerBundle(records, undefined, {
        compilerInput,
        originalSources,
      }),
    ).toThrow('actual runtime wrapper');
  });

  it('retains strict initial absence and one-new-request constraints for authenticated package input', () => {
    const leak = [
      ...compiledGraph(),
      {
        type: 'part',
        route: REQUEST_SERIALIZER_BUNDLE_ROUTES[1],
        filename: '[client-fs]/initial.js',
        source_path: `[project]/${artifactPath}`,
        size: 1000,
        compressed_size: 400,
      },
    ];
    expect(() =>
      verifyRequestSerializerBundle(leak, undefined, {
        compilerInput,
        originalSources,
      }),
    ).toThrow('initial');
    const split = compiledGraph().map((record) =>
      record.type === 'group' && 'kind' in record && record.kind === 'async'
        ? {
            ...record,
            outputs: ['[client-fs]/write.js', '[client-fs]/vendor.js'],
          }
        : record,
    );
    expect(() =>
      verifyRequestSerializerBundle(split, undefined, {
        compilerInput,
        originalSources,
      }),
    ).toThrow('exactly one deferred');
  });

  it.each([
    'packages/serializers/src/',
    'node_modules/ts-jsonapi/',
    'node_modules/lodash/',
  ])('cannot omit original package evidence for %s', (prefix) => {
    expect(() =>
      verifyRequestSerializerBundle(compiledGraph(), undefined, {
        compilerInput,
        originalSources: originalSources.filter(
          (source) => !source.startsWith(prefix),
        ),
      }),
    ).toThrow('authenticated package source');
  });
});
