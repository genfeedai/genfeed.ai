import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';

vi.mock(
  '@api/collections/contexts/utils/extract-source-text.util',
  async () => {
    const actual = await vi.importActual<
      typeof import('@api/collections/contexts/utils/extract-source-text.util')
    >('@api/collections/contexts/utils/extract-source-text.util');
    return { ...actual, extractSourceText: vi.fn() };
  },
);

import {
  KnowledgeSourceIngestService,
  toSafeFailureReason,
} from '@api/collections/contexts/services/knowledge-source-ingest.service';
import { extractSourceText } from '@api/collections/contexts/utils/extract-source-text.util';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRefreshRunStatus,
  KnowledgeRetentionState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';

const initiatingActor = {
  userId: 'user-1',
  organizationId: 'org-1',
  isApiKey: false,
  scopes: [],
};
const request = {
  initiatingActor,
  organizationId: 'org-1',
  sourceId: 'source-1',
  versionId: 'version-1',
};

function versionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-1',
    isCurrent: true,
    payload: { text: 'Plans start at $29 per month.' },
    retentionState: KnowledgeRetentionState.RETAINED,
    source: {
      brandId: 'brand-1',
      id: 'source-1',
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      scope: KnowledgeMemoryScope.BRAND,
      title: 'Pricing',
      userId: 'user-1',
    },
    version: 1,
    ...overrides,
  };
}

function buildService(
  row: ReturnType<typeof versionRow> | null = versionRow(),
) {
  const knowledgeSourceVersion = {
    findFirst: vi.fn().mockResolvedValue(row),
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const contextBase = {
    create: vi.fn().mockResolvedValue({ id: 'base-created' }),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  const contextEntry = {
    groupBy: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const executeRaw = vi.fn().mockResolvedValue(1);
  const queryRaw = vi.fn().mockResolvedValue([]);
  const knowledgeSource = {
    findFirst: vi.fn().mockResolvedValue({
      kind: KnowledgeSourceKind.URL,
      refreshIntervalMinutes: 1440,
    }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const knowledgeSourceRefreshRun = {
    findFirst: vi.fn().mockResolvedValue({
      expectedCurrentVersionId: 'version-1',
      id: 'run-1',
    }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const knowledgeCaptureRequest = {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const tx = {
    $executeRaw: executeRaw,
    $queryRaw: queryRaw,
    contextBase,
    contextEntry,
    knowledgeCaptureRequest,
    knowledgeSource,
    knowledgeSourceRefreshRun,
    knowledgeSourceVersion,
    knowledgeEmbeddingManifest: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
    knowledgeSourceVersion,
  };
  const completion = {
    stage: vi.fn().mockResolvedValue({ id: 'sealed-manifest' }),
    complete: vi.fn().mockResolvedValue('queued'),
    assertReady: vi.fn(),
  };
  const service = new KnowledgeSourceIngestService(
    prisma as never,
    brandAccessFixture(),
    new KnowledgeRecordsService(
      prisma as never,
      brandAccessFixture(),
      completion as never,
    ),
    completion as never,
  );

  return {
    completion,
    contextBase,
    contextEntry,
    executeRaw,
    knowledgeSourceVersion,
    prisma,
    queryRaw,
    service,
  };
}

describe('KnowledgeSourceIngestService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('extracts text then delegates one bounded snapshot with actual execution identity and actor', async () => {
    const {
      service,
      completion,
      contextBase,
      contextEntry,
      knowledgeSourceVersion,
    } = buildService();
    const loaded = await service.loadSource(request);
    expect(loaded).toMatchObject({
      status: 'ready',
      version: { text: 'Plans start at $29 per month.' },
    });
    const marked = await service.markSource(loaded);
    expect(knowledgeSourceVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          processingState: KnowledgeProcessingState.PROCESSING,
          processingError: null,
        },
      }),
    );
    const extracted = await service.extractSource(marked);
    const chunked = await service.chunkSource(extracted);
    const staged = await service.replaceChunks(chunked, 'server-execution');
    expect(staged.embeddingManifestId).toBe('sealed-manifest');
    expect(completion.stage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        sourceId: 'source-1',
        versionId: 'version-1',
        admissionExecutionId: 'server-execution',
        initiatingActor,
        chunks: [
          {
            content: 'Plans start at $29 per month.',
            metadata: expect.objectContaining({
              chunkIndex: 0,
              versionId: 'version-1',
              sourceId: 'source-1',
            }),
          },
        ],
      }),
    );
    expect(contextBase.create).toHaveBeenCalledOnce();
    expect(contextEntry.updateMany).not.toHaveBeenCalled();
    await expect(service.finalizeSource(staged)).resolves.toMatchObject({
      status: 'queued',
      chunkCount: 1,
    });
    expect(completion.complete).toHaveBeenCalledWith(
      'org-1',
      'source-1',
      'version-1',
      'sealed-manifest',
    );
    expect(knowledgeSourceVersion.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processingState: KnowledgeProcessingState.READY,
        }),
      }),
    );
  });

  it('reuses the scope base and leaves retirement to the atomic stage transaction', async () => {
    const { service, completion, contextBase, contextEntry } = buildService();
    contextBase.findFirst.mockResolvedValue({ id: 'existing-base' });
    const state = {
      ...(await service.loadSource(request)),
      chunks: ['a', 'b'],
      extracted: { text: 'a b' },
    };
    await service.replaceChunks(state, 'server-execution');
    expect(contextBase.create).not.toHaveBeenCalled();
    expect(contextEntry.updateMany).not.toHaveBeenCalled();
    expect(completion.stage).toHaveBeenCalledWith(
      expect.objectContaining({
        contextBaseId: 'existing-base',
        chunks: [
          expect.objectContaining({ content: 'a' }),
          expect.objectContaining({ content: 'b' }),
        ],
      }),
    );
  });

  it('stages candidates by their exact version and never retires predecessor chunks on the ingest adapter', async () => {
    const { service, completion, contextEntry } = buildService(
      versionRow({
        isCurrent: false,
        processingState: KnowledgeProcessingState.QUEUED,
      }),
    );
    await service.replaceChunks(
      {
        ...(await service.loadSource(request)),
        chunks: ['candidate'],
        extracted: { text: 'candidate' },
      },
      'server-execution',
    );
    expect(completion.stage).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'source-1', versionId: 'version-1' }),
    );
    expect(contextEntry.updateMany).not.toHaveBeenCalled();
  });

  it('keeps the captured version identity when a current-version flag changes during extraction', async () => {
    const { service, completion, knowledgeSourceVersion } = buildService();
    const state = {
      ...(await service.loadSource(request)),
      chunks: ['stale'],
      extracted: { text: 'stale' },
    };
    knowledgeSourceVersion.findFirst.mockResolvedValue({ isCurrent: false });
    await service.replaceChunks(state, 'server-execution');
    expect(completion.stage).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: 'version-1',
        admissionExecutionId: 'server-execution',
      }),
    );
  });

  it('fetches URL sources through the shared extractor', async () => {
    const { service } = buildService(
      versionRow({
        payload: { referenceUrl: 'https://brand.example/pricing' },
        source: {
          ...versionRow().source,
          kind: KnowledgeSourceKind.URL,
        },
      }),
    );
    vi.mocked(extractSourceText).mockResolvedValue({
      mimeType: 'text/html',
      text: 'Fetched pricing',
    });

    const state = await service.extractSource(
      await service.loadSource(request),
    );

    expect(extractSourceText).toHaveBeenCalledWith({
      category: 'url',
      referenceUrl: 'https://brand.example/pricing',
    });
    expect(state.extracted).toEqual({
      mimeType: 'text/html',
      text: 'Fetched pricing',
    });
  });

  it('carries etag and lastModified from a web fetch through to finalize and persists them for re-sync', async () => {
    const { service, completion, prisma } = buildService(
      versionRow({
        payload: { referenceUrl: 'https://brand.example/pricing' },
        source: {
          ...versionRow().source,
          kind: KnowledgeSourceKind.URL,
        },
      }),
    );
    vi.mocked(extractSourceText).mockResolvedValue({
      etag: 'W/"abc123"',
      lastModified: 'Wed, 24 Sep 2026 09:00:00 GMT',
      mimeType: 'text/html',
      text: 'Fetched pricing',
    });

    const extracted = await service.extractSource(
      await service.loadSource(request),
    );
    expect(extracted.extracted).toEqual({
      etag: 'W/"abc123"',
      lastModified: 'Wed, 24 Sep 2026 09:00:00 GMT',
      mimeType: 'text/html',
      text: 'Fetched pricing',
    });

    const chunked = await service.chunkSource(extracted);
    await service.replaceChunks(chunked, 'server-execution');
    await service.finalizeSource(chunked);

    expect(completion.stage).toHaveBeenCalledWith(
      expect.objectContaining({
        observedValidators: {
          etag: 'W/"abc123"',
          lastModified: 'Wed, 24 Sep 2026 09:00:00 GMT',
        },
      }),
    );
    expect(prisma.knowledgeSource.updateMany).not.toHaveBeenCalled();
  });

  it('skips missing, historical and purged versions without touching state', async () => {
    const missing = buildService(null);
    await expect(missing.service.loadSource(request)).resolves.toMatchObject({
      status: 'skipped',
    });
    const historical = buildService(versionRow({ isCurrent: false }));
    const skipped = await historical.service.loadSource(request);
    expect(skipped.status).toBe('skipped');
    await historical.service.markSource(skipped);
    expect(historical.knowledgeSourceVersion.updateMany).not.toHaveBeenCalled();
    await expect(
      historical.service.finalizeSource(skipped),
    ).resolves.toMatchObject({ status: 'skipped', chunkCount: 0 });
  });

  it('marks empty captures as failed with a safe reason', async () => {
    const empty = buildService(versionRow({ payload: {} }));
    const failed = await empty.service.loadSource(request);
    expect(failed).toMatchObject({
      failure: 'Source is missing captured text',
      status: 'failed',
    });
  });

  it('records a truncated single-line failure when a node throws', async () => {
    const { service, knowledgeSourceVersion } = buildService();
    const state = await service.loadSource(request);

    await expect(
      service.finalizeSource(
        state,
        `Failed to fetch source (503)\n${'x'.repeat(900)}`,
      ),
    ).resolves.toMatchObject({ status: 'failed', chunkCount: 0 });
    expect(knowledgeSourceVersion.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          processingState: KnowledgeProcessingState.FAILED,
          processingError: 'Failed to fetch source (503)',
        },
      }),
    );
    expect(toSafeFailureReason(new Error('a'.repeat(600)))).toHaveLength(500);
    expect(toSafeFailureReason(undefined)).toBe('Unknown error');
  });

  it('discovers every current retained version that still needs ingestion', async () => {
    const { service, knowledgeSourceVersion } = buildService();
    knowledgeSourceVersion.findMany.mockResolvedValue([
      { id: 'v-queued', sourceId: 'source-1' },
      { id: 'v-failed', sourceId: 'source-2' },
    ]);

    await expect(
      service.scanForBackfill({ organizationId: 'org-1' }),
    ).resolves.toEqual({
      queued: [
        {
          organizationId: 'org-1',
          sourceId: 'source-1',
          versionId: 'v-queued',
        },
        {
          organizationId: 'org-1',
          sourceId: 'source-2',
          versionId: 'v-failed',
        },
      ],
    });
    expect(knowledgeSourceVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          isCurrent: true,
          retentionState: KnowledgeRetentionState.RETAINED,
          processingState: {
            in: [
              KnowledgeProcessingState.QUEUED,
              KnowledgeProcessingState.PROCESSING,
              KnowledgeProcessingState.FAILED,
            ],
          },
        }),
      }),
    );
  });

  it('fails the refresh run when a candidate version ingest throws', async () => {
    const { service, prisma } = buildService(
      versionRow({
        isCurrent: false,
        processingState: KnowledgeProcessingState.QUEUED,
        retentionState: KnowledgeRetentionState.RETAINED,
      }),
    );
    const state = await service.loadSource(request);
    await expect(
      service.finalizeSource(state, 'Failed to fetch source (503)'),
    ).resolves.toMatchObject({ status: 'failed' });
    expect(prisma.knowledgeSourceRefreshRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: KnowledgeRefreshRunStatus.FAILED,
        }),
      }),
    );
  });

  it('leaves capture settlement to the vector barrier while indexing is pending', async () => {
    const { service, completion, prisma } = buildService();
    const state = await service.loadSource(request);
    await expect(service.finalizeSource(state)).resolves.toMatchObject({
      status: 'queued',
    });
    expect(completion.complete).toHaveBeenCalledWith(
      'org-1',
      'source-1',
      'version-1',
      undefined,
    );
    expect(prisma.knowledgeCaptureRequest.updateMany).not.toHaveBeenCalled();
  });

  it('fails the capture requests when the current version cannot ingest', async () => {
    const { service, prisma } = buildService();
    const state = await service.loadSource(request);

    await service.finalizeSource(state, 'Failed to fetch source (503)');

    expect(prisma.knowledgeCaptureRequest.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        isDeleted: false,
        sourceId: 'source-1',
        status: 'queued',
      },
      data: { error: 'Failed to fetch source (503)', status: 'failed' },
    });
    expect(prisma.knowledgeSourceRefreshRun.updateMany).not.toHaveBeenCalled();
  });

  it('leaves the capture ledger alone when a newer version superseded the run', async () => {
    const { service, prisma, knowledgeSourceVersion } = buildService();
    const state = await service.loadSource(request);
    knowledgeSourceVersion.findFirst.mockResolvedValue({ isCurrent: false });

    await service.finalizeSource(state, 'Failed to fetch source (503)');

    expect(prisma.knowledgeCaptureRequest.updateMany).not.toHaveBeenCalled();
    expect(prisma.knowledgeSourceRefreshRun.updateMany).not.toHaveBeenCalled();
  });
});
