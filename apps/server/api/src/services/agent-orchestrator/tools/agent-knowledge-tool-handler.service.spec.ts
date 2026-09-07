import { AgentKnowledgeToolHandler } from '@api/services/agent-orchestrator/tools/agent-knowledge-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctx = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  threadId: 'thread-1',
  userId: 'user-1',
} as ToolExecutionContext;
const actor = { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' };

const source = {
  brandId: 'brand-1',
  id: 'source-1',
  isVisible: true,
  kind: KnowledgeSourceKind.URL,
  purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
  scope: KnowledgeMemoryScope.BRAND,
  title: 'Pricing',
};
const version = {
  id: 'version-1',
  observedAt: new Date('2026-09-01T00:00:00.000Z'),
  payload: {
    referenceUrl: 'https://brand.example/pricing',
    text: 'x'.repeat(2000),
  },
  processingError: null,
  processingState: KnowledgeProcessingState.READY,
  provenance: { capturedBy: 'api', url: 'https://brand.example/pricing' },
  retrievalState: 'ACTIVE',
  version: 2,
};

function buildHandler() {
  const records = {
    deleteSource: vi.fn().mockResolvedValue({ ...source, isVisible: false }),
    getCurrentVersion: vi.fn().mockResolvedValue(version),
    getSource: vi.fn().mockResolvedValue(source),
    listSourceSpaces: vi
      .fn()
      .mockResolvedValue([{ id: 'inbox', isInbox: true, title: 'Inbox' }]),
    listSources: vi.fn().mockResolvedValue({
      docs: [
        source,
        { ...source, id: 'source-2', purpose: KnowledgeSourcePurpose.RESEARCH },
      ],
      totalDocs: 2,
      totalPages: 1,
    }),
    updateSource: vi.fn().mockResolvedValue({
      ...source,
      purpose: KnowledgeSourcePurpose.INSPIRATION,
    }),
  };
  const capture = {
    capture: vi.fn().mockResolvedValue({
      jobId: 'job-1',
      source,
      version: { ...version, processingState: KnowledgeProcessingState.QUEUED },
    }),
    retry: vi.fn().mockResolvedValue({
      jobId: 'job-2',
      version: { ...version, processingState: KnowledgeProcessingState.QUEUED },
    }),
  };
  const contexts = {
    retrieveBrandContentMemory: vi.fn().mockResolvedValue([
      {
        citation: {
          kind: 'URL',
          purpose: 'BRAND_TRUTH',
          sourceId: 'source-1',
          title: 'Pricing',
          version: 2,
          versionId: 'version-1',
        },
        content: 'Plans start at $29',
        relevance: 0.9,
      },
      { content: 'Uncited legacy memory', relevance: 0.8 },
    ]),
  };
  const handler = new AgentKnowledgeToolHandler(
    { log: vi.fn() } as never,
    records as never,
    capture as never,
    contexts as never,
  );
  return { capture, contexts, handler, records };
}

describe('AgentKnowledgeToolHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches brand Knowledge with explicit filters and returns only cited passages', async () => {
    const { contexts, handler } = buildHandler();

    const result = await handler.searchKnowledge(
      {
        limit: 40,
        purposes: ['BRAND_TRUTH', 'bogus'],
        query: '  pricing  ',
        sourceIds: ['source-1'],
      },
      ctx,
    );

    expect(contexts.retrieveBrandContentMemory).toHaveBeenCalledWith({
      brandId: 'brand-1',
      knowledgePurposes: [KnowledgeSourcePurpose.BRAND_TRUTH],
      knowledgeSourceIds: ['source-1'],
      limit: 12,
      minRelevance: 0.6,
      organizationId: 'org-1',
      query: 'pricing',
    });
    expect(result.success).toBe(true);
    expect(result.data?.passages).toEqual([
      expect.objectContaining({
        citation: expect.objectContaining({ sourceId: 'source-1' }),
        content: 'Plans start at $29',
        relevance: 0.9,
      }),
    ]);
  });

  it('refuses to search without a brand or a query', async () => {
    const { contexts, handler } = buildHandler();
    expect(
      (
        await handler.searchKnowledge(
          { query: 'x' },
          { ...ctx, brandId: undefined },
        )
      ).success,
    ).toBe(false);
    expect((await handler.searchKnowledge({}, ctx)).error).toBe(
      'query is required',
    );
    expect(contexts.retrieveBrandContentMemory).not.toHaveBeenCalled();
  });

  it('lists sources with their current version state and filters by purpose', async () => {
    const { handler, records } = buildHandler();

    const result = await handler.listKnowledgeSources(
      { limit: 500, purpose: 'RESEARCH' },
      ctx,
    );

    expect(records.listSources).toHaveBeenCalledWith(actor, 1, 100);
    expect(result.data?.sources).toEqual([
      expect.objectContaining({
        id: 'source-2',
        processingState: KnowledgeProcessingState.READY,
        purpose: KnowledgeSourcePurpose.RESEARCH,
        versionId: 'version-1',
      }),
    ]);
    expect(result.data).toMatchObject({ limit: 100, page: 1, total: 2 });
  });

  it('reads one source with a bounded preview, provenance and spaces', async () => {
    const { handler, records } = buildHandler();

    const result = await handler.readKnowledgeSource(
      { sourceId: 'source-1' },
      ctx,
    );

    expect(records.getSource).toHaveBeenCalledWith(actor, 'source-1');
    expect(records.listSourceSpaces).toHaveBeenCalledWith(actor, 'source-1');
    expect(result.data).toMatchObject({
      id: 'source-1',
      isPreviewTruncated: true,
      provenance: { capturedBy: 'api', url: 'https://brand.example/pricing' },
      spaces: [{ id: 'inbox', isInbox: true, title: 'Inbox' }],
    });
    expect(String(result.data?.textPreview)).toHaveLength(1500);
  });

  it('captures through the canonical capture service with a safe default purpose', async () => {
    const { capture, handler } = buildHandler();

    const result = await handler.captureKnowledge(
      {
        kind: 'URL',
        referenceUrl: 'https://brand.example/faq',
        title: ' FAQ ',
      },
      ctx,
    );

    expect(capture.capture).toHaveBeenCalledWith(actor, {
      kind: KnowledgeSourceKind.URL,
      provenance: { capturedBy: 'agent', threadId: 'thread-1' },
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      referenceUrl: 'https://brand.example/faq',
      scope: KnowledgeMemoryScope.BRAND,
      text: undefined,
      title: 'FAQ',
    });
    expect(result.data).toMatchObject({ id: 'source-1', jobId: 'job-1' });
    expect(
      (await handler.captureKnowledge({ kind: 'VIDEO', title: 'x' }, ctx))
        .error,
    ).toContain('TEXT, URL or DOCUMENT');
  });

  it('routes purpose changes, archive and retry to the records and capture services', async () => {
    const { capture, handler, records } = buildHandler();

    await handler.assignKnowledgePurpose(
      { isVisible: false, purpose: 'INSPIRATION', sourceId: 'source-1' },
      ctx,
    );
    expect(records.updateSource).toHaveBeenCalledWith(actor, 'source-1', {
      isVisible: false,
      purpose: KnowledgeSourcePurpose.INSPIRATION,
    });
    expect(
      (await handler.assignKnowledgePurpose({ sourceId: 'source-1' }, ctx))
        .success,
    ).toBe(false);

    const archived = await handler.archiveKnowledgeSource(
      { sourceId: 'source-1' },
      ctx,
    );
    expect(records.deleteSource).toHaveBeenCalledWith(actor, 'source-1');
    expect(archived.data).toMatchObject({
      isVisible: false,
      message: 'Source archived.',
    });

    const retried = await handler.retryKnowledgeIngestion(
      { sourceId: 'source-1' },
      ctx,
    );
    expect(capture.retry).toHaveBeenCalledWith(actor, 'source-1');
    expect(retried.data).toMatchObject({
      jobId: 'job-2',
      message: 'Ingestion requeued.',
    });
  });

  it('propagates tenant denial from the records service unchanged', async () => {
    const { handler, records } = buildHandler();
    const denied = Object.assign(new Error('Knowledge source not found'), {
      status: 404,
    });
    records.getSource.mockRejectedValueOnce(denied);

    await expect(
      handler.readKnowledgeSource(
        { sourceId: 'source-1' },
        { ...ctx, brandId: 'brand-2' },
      ),
    ).rejects.toBe(denied);
  });
});
