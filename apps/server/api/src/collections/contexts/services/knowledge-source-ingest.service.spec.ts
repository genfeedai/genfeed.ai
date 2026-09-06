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
  type KnowledgeSourceIngestState,
  toSafeFailureReason,
} from '@api/collections/contexts/services/knowledge-source-ingest.service';
import { extractSourceText } from '@api/collections/contexts/utils/extract-source-text.util';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRetentionState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';

const request = {
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
  const tx = {
    $executeRaw: executeRaw,
    $queryRaw: queryRaw,
    contextBase,
    contextEntry,
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
    knowledgeSourceVersion,
  };
  const addEntry = vi.fn().mockResolvedValue({ id: 'entry' });
  const service = new KnowledgeSourceIngestService(
    prisma as never,
    { addEntry } as never,
  );
  return {
    addEntry,
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

  it('ingests captured text into version-linked chunks in a per-scope base', async () => {
    const {
      service,
      addEntry,
      contextBase,
      contextEntry,
      knowledgeSourceVersion,
      prisma,
    } = buildService();

    const loaded = await service.loadSource(request);
    expect(loaded).toMatchObject({
      status: 'ready',
      source: { id: 'source-1', purpose: KnowledgeSourcePurpose.BRAND_TRUTH },
      version: { id: 'version-1', text: 'Plans start at $29 per month.' },
    });
    expect(knowledgeSourceVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'version-1',
          organizationId: 'org-1',
          sourceId: 'source-1',
          isDeleted: false,
        }),
      }),
    );

    const marked = await service.markSource(loaded);
    expect(knowledgeSourceVersion.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: 'version-1',
        sourceId: 'source-1',
        organizationId: 'org-1',
        isDeleted: false,
      },
      data: {
        processingState: KnowledgeProcessingState.PROCESSING,
        processingError: null,
      },
    });

    const extracted = await service.extractSource(marked);
    expect(extracted.extracted).toEqual({
      mimeType: 'text/plain',
      text: 'Plans start at $29 per month.',
    });
    const chunked = service.chunkSource(extracted);
    expect(chunked.chunks).toEqual(['Plans start at $29 per month.']);

    await service.replaceChunks(chunked);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(contextBase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          sourceBrandId: 'brand-1',
          data: expect.objectContaining({
            knowledgeScope: KnowledgeMemoryScope.BRAND,
            purpose: 'knowledge-base',
            type: 'knowledge',
          }),
        }),
      }),
    );
    expect(contextEntry.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          isDeleted: false,
          knowledgeSourceId: 'source-1',
        },
      }),
    );
    expect(addEntry).toHaveBeenCalledWith(
      'base-created',
      {
        content: 'Plans start at $29 per month.',
        metadata: expect.objectContaining({
          chunkIndex: 0,
          kind: 'knowledge-source-chunk',
          purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
          sourceId: 'source-1',
          sourceTitle: 'Pricing',
          versionId: 'version-1',
        }),
      },
      'org-1',
      { knowledgeSourceId: 'source-1', knowledgeSourceVersionId: 'version-1' },
    );

    await expect(service.finalizeSource(chunked)).resolves.toEqual({
      chunkCount: 1,
      sourceId: 'source-1',
      status: 'completed',
      versionId: 'version-1',
    });
    expect(knowledgeSourceVersion.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          processingState: KnowledgeProcessingState.READY,
          processingError: null,
        },
      }),
    );
  });

  it('reuses an existing scope base and soft-deletes prior chunks before re-ingest', async () => {
    const { service, contextBase, contextEntry, executeRaw, prisma } =
      buildService();
    contextBase.findFirst.mockResolvedValue({ id: 'base-existing' });
    contextEntry.groupBy.mockResolvedValue([
      { _count: { _all: 3 }, contextBaseId: 'base-existing' },
    ]);
    contextEntry.updateMany.mockResolvedValue({ count: 3 });

    const state: KnowledgeSourceIngestState = {
      ...(await service.loadSource(request)),
      chunks: ['a', 'b'],
      extracted: { text: 'a b' },
    };
    await service.replaceChunks(state);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(contextEntry.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        isDeleted: false,
        knowledgeSourceId: 'source-1',
      },
      data: { isDeleted: true },
    });
    const decrement = executeRaw.mock.calls[0]?.[0] as {
      sql: string;
      values: unknown[];
    };
    expect(decrement.sql).toContain('jsonb_set');
    expect(decrement.values).toEqual(
      expect.arrayContaining([3, 'org-1', 'base-existing']),
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

  it('marks unsupported kinds and empty captures as failed with a safe reason', async () => {
    const video = buildService(
      versionRow({
        source: { ...versionRow().source, kind: KnowledgeSourceKind.VIDEO },
      }),
    );
    const unsupported = await video.service.loadSource(request);
    expect(unsupported.status).toBe('unsupported');
    await video.service.markSource(unsupported);
    expect(video.knowledgeSourceVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          processingState: KnowledgeProcessingState.FAILED,
          processingError: 'VIDEO sources are not ingested yet',
        },
      }),
    );
    await expect(
      video.service.finalizeSource(unsupported),
    ).resolves.toMatchObject({ status: 'unsupported' });

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
});
