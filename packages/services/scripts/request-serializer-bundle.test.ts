import {
  REQUEST_SERIALIZER_BUNDLE_ROUTES,
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
        type: 'part',
        route,
        filename: '[client-fs]/write.js',
        source_path:
          '[project]/packages/serializers/src/server/ingredients/image.serializer.ts',
        size: 1000,
        compressed_size: 400,
      },
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

describe('serializer bundle evidence', () => {
  it('proves initial absence and a single deferred group including concatenated canonical code', () => {
    const report = verifyRequestSerializerBundle(graph());
    expect(report.routes).toHaveLength(4);
    expect(report.routes[1].deferred).toEqual({
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
});
