import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  closeContextEmbeddingResources,
  inspectContextEmbeddingTransport,
  resolvePrismaMigrationTools,
  validateContextEmbeddingRuntime,
} from '@api-test/integration/context-embedding/context-embedding-migration.fixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildApiE2eTierPlan,
  countFailedFileRecords,
  discoverApiE2eSpecs,
  validateApiE2eTierManifest,
  validateContextEmbeddingReport,
} from './api-e2e-tiers';
import {
  API_E2E_TIER_MANIFEST,
  type ApiE2eTierManifest,
} from './api-e2e-tiers.manifest';

const testDirectories: string[] = [];

afterEach(() => {
  for (const testDirectory of testDirectories.splice(0)) {
    rmSync(testDirectory, { force: true, recursive: true });
  }
});

function createFixture(files: string[]): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'api-e2e-tiers-'));
  testDirectories.push(rootDir);

  for (const file of files) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, 'describe("fixture", () => {});\n');
  }

  return rootDir;
}

const manifest = (
  coreFiles: string[],
  exclusions: ApiE2eTierManifest['exclusions'] = [],
  isolatedPublishFiles: string[] = [],
): ApiE2eTierManifest => ({
  coreFiles,
  exclusions,
  isolatedPublishFiles,
});

describe('API E2E tiers', () => {
  it('keeps every repository exclusion discoverable and issue-tracked', () => {
    expect(
      validateApiE2eTierManifest(
        discoverApiE2eSpecs(),
        API_E2E_TIER_MANIFEST,
        'full',
      ),
    ).toEqual([]);
  });

  it('discovers every spec recursively and ignores support files', () => {
    const rootDir = createFixture([
      'test/e2e/auth.e2e-spec.ts',
      'test/e2e/e2e-test.utils.ts',
      'test/integration/payments.integration.spec.ts',
      'test/integration/nested/worker.spec.ts',
    ]);

    expect(discoverApiE2eSpecs(rootDir)).toEqual([
      'test/e2e/auth.e2e-spec.ts',
      'test/integration/nested/worker.spec.ts',
      'test/integration/payments.integration.spec.ts',
    ]);
  });

  it('keeps the core tier explicit while full automatically includes new specs', () => {
    const files = [
      'test/e2e/core.e2e-spec.ts',
      'test/integration/excluded.integration.spec.ts',
      'test/integration/new.integration.spec.ts',
    ];
    const rootDir = createFixture(files);
    const tierManifest = manifest(
      ['test/e2e/core.e2e-spec.ts'],
      [
        {
          file: 'test/integration/excluded.integration.spec.ts',
          reason: 'Requires a hermetic replacement.',
          trackingIssue: 71,
        },
      ],
    );

    expect(
      buildApiE2eTierPlan({
        manifest: tierManifest,
        rootDir,
        tier: 'core',
      }).selectedFiles,
    ).toEqual(['test/e2e/core.e2e-spec.ts']);
    expect(
      buildApiE2eTierPlan({
        manifest: tierManifest,
        rootDir,
        tier: 'full',
      }).selectedFiles,
    ).toEqual([
      'test/e2e/core.e2e-spec.ts',
      'test/integration/new.integration.spec.ts',
    ]);
  });

  it('keeps isolated-publish specs off core and full', () => {
    const isolatedFile =
      'test/integration/isolated-publish/lane.integration.spec.ts';
    const files = [
      'test/e2e/core.e2e-spec.ts',
      isolatedFile,
      'test/integration/new.integration.spec.ts',
    ];
    const rootDir = createFixture(files);
    const tierManifest = manifest(
      ['test/e2e/core.e2e-spec.ts'],
      [],
      [isolatedFile],
    );

    expect(
      buildApiE2eTierPlan({
        manifest: tierManifest,
        rootDir,
        tier: 'isolated-publish',
      }).selectedFiles,
    ).toEqual([isolatedFile]);
    expect(
      buildApiE2eTierPlan({
        manifest: tierManifest,
        rootDir,
        tier: 'full',
      }).selectedFiles,
    ).toEqual([
      'test/e2e/core.e2e-spec.ts',
      'test/integration/new.integration.spec.ts',
    ]);
  });

  it('requires every exclusion to have a reason and tracking issue', () => {
    const excludedFile = 'test/integration/excluded.integration.spec.ts';
    const files = [excludedFile];

    expect(
      validateApiE2eTierManifest(
        files,
        manifest(
          [],
          [
            {
              file: excludedFile,
              reason: ' ',
              trackingIssue: 0,
            },
          ],
        ),
      ),
    ).toEqual([
      `Excluded file has no reason: ${files[0]}`,
      `Excluded file has no tracking issue: ${files[0]}`,
    ]);
  });

  it('fails when a core or excluded file is renamed without manifest updates', () => {
    expect(
      validateApiE2eTierManifest(
        ['test/e2e/renamed.e2e-spec.ts'],
        manifest(
          ['test/e2e/missing.e2e-spec.ts'],
          [
            {
              file: 'test/integration/missing.integration.spec.ts',
              reason: 'Pending repair.',
              trackingIssue: 71,
            },
          ],
        ),
      ),
    ).toEqual([
      'Core file is not discoverable: test/e2e/missing.e2e-spec.ts',
      'Excluded file is not discoverable: test/integration/missing.integration.spec.ts',
    ]);
  });

  it('does not fail the required core tier when a full-tier exclusion is deleted', () => {
    const rootDir = createFixture(['test/e2e/core.e2e-spec.ts']);
    const tierManifest = manifest(
      ['test/e2e/core.e2e-spec.ts'],
      [
        {
          file: 'test/integration/deleted.integration.spec.ts',
          reason: 'Pending repair.',
          trackingIssue: 71,
        },
      ],
    );

    expect(
      buildApiE2eTierPlan({
        manifest: tierManifest,
        rootDir,
        tier: 'core',
      }).selectedFiles,
    ).toEqual(['test/e2e/core.e2e-spec.ts']);
    expect(() =>
      buildApiE2eTierPlan({
        manifest: tierManifest,
        rootDir,
        tier: 'full',
      }),
    ).toThrow(
      'Excluded file is not discoverable: test/integration/deleted.integration.spec.ts',
    );
  });

  it('does not validate full-tier exclusion metadata for the core tier', () => {
    const rootDir = createFixture(['test/e2e/core.e2e-spec.ts']);
    const tierManifest = manifest(
      ['test/e2e/core.e2e-spec.ts'],
      [
        {
          file: 'test/e2e/core.e2e-spec.ts',
          reason: ' ',
          trackingIssue: 0,
        },
        {
          file: 'test/e2e/core.e2e-spec.ts',
          reason: ' ',
          trackingIssue: 0,
        },
      ],
    );

    expect(
      buildApiE2eTierPlan({
        manifest: tierManifest,
        rootDir,
        tier: 'core',
      }).selectedFiles,
    ).toEqual(['test/e2e/core.e2e-spec.ts']);
  });
});

describe('dedicated Context Embedding Acceptance lane', () => {
  it('selects only its two actual files and delegates them out of full without changing core', () => {
    const selected = API_E2E_TIER_MANIFEST.contextEmbeddingFiles ?? [];
    expect(selected).toHaveLength(2);
    expect(
      buildApiE2eTierPlan({ tier: 'context-embedding' }).selectedFiles,
    ).toEqual(selected);
    for (const tier of ['core', 'full', 'isolated-publish'] as const) {
      expect(
        buildApiE2eTierPlan({ tier }).selectedFiles.some((file) =>
          selected.includes(file),
        ),
      ).toBe(false);
    }
    expect(
      buildApiE2eTierPlan({ tier: 'full' })
        .excludedFiles.filter((row) => selected.includes(row.file))
        .every((row) => row.trackingIssue === 5149),
    ).toBe(true);
  });
  it('rejects missing, duplicate or undiscoverable dedicated ownership', () => {
    const files = ['test/integration/a.spec.ts', 'test/integration/b.spec.ts'];
    expect(
      validateApiE2eTierManifest(
        files,
        {
          coreFiles: [],
          isolatedPublishFiles: [],
          exclusions: [],
          contextEmbeddingFiles: [files[0], files[0]],
        },
        'context-embedding',
      ),
    ).toContain('Duplicate context-embedding files');
    expect(
      validateApiE2eTierManifest(
        files,
        { coreFiles: [], isolatedPublishFiles: [], exclusions: [] },
        'context-embedding',
      ),
    ).toContain('Context-embedding requires exactly two acceptance files');
  });
  it('rejects a missing report, zero assertions, skipped assertions, duplicate files and foreign file names', () => {
    const files = API_E2E_TIER_MANIFEST.contextEmbeddingFiles ?? [];
    const name = (file: string) =>
      path.resolve(import.meta.dirname, '..', file);
    const good = {
      testResults: files.map((file) => ({
        name: name(file),
        status: 'passed',
        assertionResults: [{ status: 'passed' }],
      })),
    };
    expect(validateContextEmbeddingReport(good, files)).toEqual([]);
    expect(validateContextEmbeddingReport({}, files)).not.toEqual([]);
    expect(
      validateContextEmbeddingReport(
        {
          testResults: good.testResults.map((row) => ({
            ...row,
            assertionResults: [],
          })),
        },
        files,
      ),
    ).not.toEqual([]);
    expect(
      validateContextEmbeddingReport(
        {
          testResults: good.testResults.map((row) => ({
            ...row,
            assertionResults: [{ status: 'pending' }],
          })),
        },
        files,
      ),
    ).not.toEqual([]);
    expect(
      validateContextEmbeddingReport(
        { testResults: [good.testResults[0], good.testResults[0]] },
        files,
      ),
    ).not.toEqual([]);
    expect(
      validateContextEmbeddingReport(
        {
          testResults: good.testResults.map((row) => ({
            ...row,
            name: name('test/integration/foreign.spec.ts'),
          })),
        },
        files,
      ),
    ).not.toEqual([]);
  });
});

describe('observed acceptance runtime identity', () => {
  const healthy = {
    nodeVersion: '26.12.1',
    bunVersion: '1.4.4',
    selector: 'latest',
    packageManager: 'bun@1.4.3',
    ciCheckRuntime: 'Linux/X64/1.4.4/v26.12.1',
    platform: 'linux',
    architecture: 'x64',
  };
  it('accepts exact rolling stable identity while retaining the distinct packageManager declaration', () => {
    expect(validateContextEmbeddingRuntime(healthy)).toEqual({
      node: '26.12.1',
      bun: '1.4.4',
      bunSelector: 'latest',
      packageManager: 'bun@1.4.3',
      ciCheckRuntime: healthy.ciCheckRuntime,
    });
  });
  it('accepts a matching explicit stable selector', () => {
    expect(
      validateContextEmbeddingRuntime({ ...healthy, selector: '1.4.4' }).bun,
    ).toBe('1.4.4');
  });
  it.each([
    { nodeVersion: '24.22.0', ciCheckRuntime: 'Linux/X64/1.4.4/v24.22.0' },
    { ciCheckRuntime: undefined },
    { ciCheckRuntime: 'Linux/X64/1.4.3/v26.12.1' },
    { platform: 'darwin', ciCheckRuntime: 'macOS/X64/1.4.4/v26.12.1' },
    { architecture: 'arm64', ciCheckRuntime: 'Linux/ARM64/1.4.4/v26.12.1' },
    { bunVersion: '1.4.4-canary.1' },
    { bunVersion: 'invalid' },
    { selector: '1.4.3' },
    { selector: 'nightly' },
    { nodeVersion: '24.invalid' },
  ])('rejects invalid or mismatched runtime identity %j', (change) => {
    expect(() =>
      validateContextEmbeddingRuntime({ ...healthy, ...change }),
    ).toThrow();
  });
});

describe('actual failed file accounting', () => {
  it('counts two failed files independently of four nested failed suites', () => {
    expect(
      countFailedFileRecords({
        numFailedTestSuites: 4,
        testResults: [
          { name: '/a.spec.ts', status: 'failed' },
          { name: '/b.spec.ts', status: 'failed' },
        ],
      }),
    ).toBe(2);
  });
  it('retains a failed file when a sibling file passes', () => {
    expect(
      countFailedFileRecords({
        numFailedTestSuites: 4,
        testResults: [
          { name: '/a.spec.ts', status: 'passed' },
          { name: '/b.spec.ts', status: 'failed' },
        ],
      }),
    ).toBe(1);
  });
  it.each([
    {},
    { numFailedTestSuites: 0 },
    { testResults: [] },
    { testResults: [{ name: '/a.spec.ts' }] },
    { testResults: [{ status: 'passed' }] },
  ])('keeps absent or incomplete file records unknown %j', (report) => {
    expect(countFailedFileRecords(report)).toBeNull();
  });
});

describe('context embedding owner tools and partial startup cleanup', () => {
  it('resolves actual configuration and CLI from the package declaring Prisma 7.10.1 without a database', async () => {
    const tools = await resolvePrismaMigrationTools();
    expect(tools.version).toBe('7.10.1');
    expect(readFileSync(new URL(tools.configModule), 'utf8')).toContain(
      'defineConfig',
    );
    expect(readFileSync(tools.cli, 'utf8')).toMatch(/^#!\/usr\/bin\/env node/);
  });

  it('fails closed for missing or undeclared owner prerequisites', async () => {
    const root = createFixture([]);
    const owner = path.join(root, 'package.json');
    await expect(resolvePrismaMigrationTools(owner)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    writeFileSync(owner, JSON.stringify({ dependencies: {} }));
    await expect(resolvePrismaMigrationTools(owner)).rejects.toThrow(
      'must declare its exact Prisma dependency',
    );
    writeFileSync(owner, JSON.stringify({ dependencies: { prisma: 7 } }));
    await expect(resolvePrismaMigrationTools(owner)).rejects.toThrow(
      'must declare its exact Prisma dependency',
    );
    writeFileSync(
      owner,
      JSON.stringify({ dependencies: { prisma: '7.10.1' } }),
    );
    await expect(resolvePrismaMigrationTools(owner)).rejects.toMatchObject({
      code: 'MODULE_NOT_FOUND',
    });
  });

  it('awaits every owned closer despite earlier failures and retains the original failure first', async () => {
    const primary = new Error('migration prerequisite failed');
    const application = new Error('application close failed');
    const database = new Error('database disconnect failed');
    const calls: string[] = [];
    const result = await closeContextEmbeddingResources(
      [
        async () => {
          calls.push('application');
          throw application;
        },
        async () => {
          await Promise.resolve();
          calls.push('database');
          throw database;
        },
        async () => {
          calls.push('loopback');
        },
        async () => {
          calls.push('namespace');
        },
      ],
      primary,
    ).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(AggregateError);
    if (!(result instanceof AggregateError))
      throw new Error('Expected retained cleanup causes');
    expect(result.errors).toEqual([primary, application, database]);
    expect(calls).toEqual(['application', 'database', 'loopback', 'namespace']);
  });

  it('preserves the exact primary error when partial startup opened no resource', async () => {
    const primary = new Error('configuration resolution failed');
    await expect(closeContextEmbeddingResources([], primary)).rejects.toBe(
      primary,
    );
    await expect(closeContextEmbeddingResources([])).resolves.toBeUndefined();
  });

  it('closes an actually unstarted runtime once without inventing Redis or database verification', async () => {
    const url = new URL(
      'postgresql://localhost:5432/genfeed_context_embedding_test',
    );
    url.username = 'context_embedding_test';
    vi.stubEnv('CONTEXT_EMBEDDING_ACCEPTANCE', '1');
    vi.stubEnv('CONTEXT_EMBEDDING_TEST_DATABASE_URL', url.toString());
    vi.stubEnv('CONTEXT_EMBEDDING_REDIS_URL', 'redis://localhost:6379/0');
    vi.doMock('@api/shared/modules/prisma/prisma.service', () => ({
      PrismaService: class {
        async $disconnect() {
          throw new Error(
            'An unopened database handle must not be disconnected',
          );
        }
      },
    }));
    try {
      const { ContextEmbeddingRuntime } = await import(
        '@api-test/integration/context-embedding/context-embedding-runtime.fixture'
      );
      const runtime = new ContextEmbeddingRuntime();
      const first = runtime.close();
      expect(runtime.close()).toBe(first);
      await expect(first).resolves.toEqual({
        startupCompleted: false,
        redisPrefix: runtime.prefix,
        redisNamespaceAttempted: false,
        redisKeysRemaining: null,
        queuesClosed: null,
        applicationClosed: null,
        databaseClientDisconnected: null,
        loopbackServerClosed: null,
      });
      expect(runtime.redis.status).toBe('end');
    } finally {
      vi.doUnmock('@api/shared/modules/prisma/prisma.service');
      vi.unstubAllEnvs();
    }
  });

  it('rejects genuine cleanup failures even without a setup failure', async () => {
    const failure = new Error('namespace zero-key proof unavailable');
    const result = await closeContextEmbeddingResources([
      async () => {
        throw failure;
      },
    ]).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(AggregateError);
    if (!(result instanceof AggregateError))
      throw new Error('Expected retained cleanup causes');
    expect(result.errors).toEqual([failure]);
  });
});

describe('context embedding ancillary and queue containment', () => {
  const url = new URL('redis://localhost:6379/0');
  const prefix =
    'context-embedding-acceptance-00000000-0000-4000-8000-000000000000';
  const connection = { host: 'localhost', port: 6379, db: 0 };

  it('records actual explicit dedicated transport fields', () => {
    expect(
      inspectContextEmbeddingTransport(connection, prefix, url, prefix),
    ).toEqual({ ...connection, prefix });
  });

  it.each([
    [undefined, prefix],
    [{ options: connection }, prefix],
    [{ ...connection, host: 'foreign.example' }, prefix],
    [{ ...connection, port: 6380 }, prefix],
    [{ ...connection, db: 1 }, prefix],
    [{ host: 'localhost', port: 6379 }, prefix],
    [connection, undefined],
    [connection, 'bull'],
    [connection, prefix + '-foreign'],
  ])(
    'rejects missing, uninspectable, foreign or default transport %j/%j',
    (actual, actualPrefix) => {
      expect(() =>
        inspectContextEmbeddingTransport(actual, actualPrefix, url, prefix),
      ).toThrow('Uninspectable or foreign');
    },
  );

  it('uses the actual production global membership module and an explicitly unavailable nonauthorization cache transport', async () => {
    const { ContextEmbeddingRuntime, UNAVAILABLE_EMBEDDING_CACHE_TRANSPORT } =
      await import(
        '@api-test/integration/context-embedding/context-embedding-runtime.fixture'
      );
    const { SharedModule } = await import('@api/shared/shared.module');
    const { MembersModule } = await import(
      '@api/collections/members/members.module'
    );
    const { ContextEmbeddingCoreModule } = await import(
      '@api/collections/contexts/context-embedding-core.module'
    );
    expect(ContextEmbeddingRuntime.applicationImports).toEqual([
      SharedModule,
      ContextEmbeddingCoreModule,
    ]);
    expect(Reflect.getMetadata('__module:global__', SharedModule)).toBe(true);
    expect(Reflect.getMetadata('imports', SharedModule)).toContain(
      MembersModule,
    );
    expect(UNAVAILABLE_EMBEDDING_CACHE_TRANSPORT.isReady).toBe(false);
    expect(() => UNAVAILABLE_EMBEDDING_CACHE_TRANSPORT.instance).toThrow(
      'Unexpected raw access',
    );
  });
});
