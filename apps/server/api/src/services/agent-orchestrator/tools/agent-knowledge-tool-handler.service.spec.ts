import { InvalidKnowledgeSearchCursorError } from '@api/collections/contexts/utils/knowledge-search-cursor.util';
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
    unscheduleRefresh: vi.fn().mockResolvedValue(undefined),
  };
  const knowledgeContentRetrievalService = {
    searchBrandKnowledge: vi.fn().mockResolvedValue({
      hits: [
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
      ],
    }),
  };
  const contextCoverage = {
    forActor: vi.fn().mockResolvedValue({
      families: [],
      isIncomplete: false,
      usage: 'search',
    }),
  };
  const handler = new AgentKnowledgeToolHandler(
    { log: vi.fn() } as never,
    records as never,
    capture as never,
    knowledgeContentRetrievalService as never,
    contextCoverage as never,
  );
  return {
    capture,
    contextCoverage,
    handler,
    knowledgeContentRetrievalService,
    records,
  };
}

describe('AgentKnowledgeToolHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches coverage to an empty search and says it is incomplete when sources are partial', async () => {
    const { contextCoverage, knowledgeContentRetrievalService, handler } =
      buildHandler();
    knowledgeContentRetrievalService.searchBrandKnowledge.mockResolvedValue({
      hits: [],
    });
    const coverage = {
      families: [
        {
          family: 'knowledge',
          lastSuccessAt: null,
          purpose: 'BRAND_TRUTH',
          recoveries: [],
          state: 'partial',
        },
      ],
      isIncomplete: true,
      usage: 'search',
    };
    contextCoverage.forActor.mockResolvedValue(coverage);

    const result = await handler.searchKnowledge(
      { purposes: ['BRAND_TRUTH'], query: 'pricing' },
      ctx,
    );

    expect(contextCoverage.forActor).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', organizationId: 'org-1' }),
      { purposes: [KnowledgeSourcePurpose.BRAND_TRUTH], usage: 'search' },
    );
    expect(result.data?.coverage).toEqual(coverage);
    expect(result.data?.message).toContain('coverage is incomplete');
    expect(result.data?.passages).toEqual([]);
  });

  it('keeps the plain empty message when an empty search has complete coverage', async () => {
    const { knowledgeContentRetrievalService, handler } = buildHandler();
    knowledgeContentRetrievalService.searchBrandKnowledge.mockResolvedValue({
      hits: [],
    });

    const result = await handler.searchKnowledge({ query: 'pricing' }, ctx);

    expect(result.data?.message).toContain('No saved Knowledge matched');
  });

  it('still answers an empty search when the coverage read fails', async () => {
    const { contextCoverage, knowledgeContentRetrievalService, handler } =
      buildHandler();
    knowledgeContentRetrievalService.searchBrandKnowledge.mockResolvedValue({
      hits: [],
    });
    contextCoverage.forActor.mockRejectedValue(new Error('db down'));

    const result = await handler.searchKnowledge({ query: 'pricing' }, ctx);

    expect(result.success).toBe(true);
    expect(result.data?.coverage).toBeUndefined();
  });

  it('does not read coverage when a search returns passages', async () => {
    const { contextCoverage, handler } = buildHandler();

    await handler.searchKnowledge({ query: 'pricing' }, ctx);

    expect(contextCoverage.forActor).not.toHaveBeenCalled();
  });

  it('returns coverage for the authenticated scope and defaults usage to search', async () => {
    const { contextCoverage, handler } = buildHandler();
    contextCoverage.forActor.mockResolvedValue({
      families: [
        {
          family: 'social_connections',
          lastSuccessAt: null,
          recoveries: [
            {
              kind: 'reconnect',
              label: 'Reconnect account',
              platform: 'twitter',
              state: 'disconnected',
            },
          ],
          state: 'disconnected',
        },
      ],
      isIncomplete: true,
      usage: 'search',
    });

    const result = await handler.execute(
      'get_context_coverage',
      { brandId: 'other-brand', purposes: ['RESEARCH'] },
      ctx,
    );

    expect(contextCoverage.forActor).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', organizationId: 'org-1' }),
      { purposes: [KnowledgeSourcePurpose.RESEARCH], usage: 'search' },
    );
    expect(result.success).toBe(true);
    expect(result.data?.isIncomplete).toBe(true);
    expect(result.data?.message).toContain('Coverage is incomplete');
  });

  it('passes the context usage through to coverage', async () => {
    const { contextCoverage, handler } = buildHandler();

    await handler.getContextCoverage({ usage: 'context' }, ctx);

    expect(contextCoverage.forActor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ usage: 'context' }),
    );
  });

  it('searches brand Knowledge with explicit filters and returns only cited passages', async () => {
    const { knowledgeContentRetrievalService, handler } = buildHandler();

    const result = await handler.searchKnowledge(
      {
        limit: 40,
        purposes: ['BRAND_TRUTH', 'bogus'],
        query: '  pricing  ',
        sourceIds: ['source-1'],
      },
      ctx,
    );

    expect(
      knowledgeContentRetrievalService.searchBrandKnowledge,
    ).toHaveBeenCalledWith({
      brandId: 'brand-1',
      knowledgePurposes: [KnowledgeSourcePurpose.BRAND_TRUTH],
      knowledgeSourceIds: ['source-1'],
      limit: 12,
      minRelevance: 0,
      mode: 'search',
      organizationId: 'org-1',
      query: 'pricing',
      userId: 'user-1',
      isApiKey: undefined,
      scopes: undefined,
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

  it('keeps the relevance floor when no sources are named', async () => {
    const { knowledgeContentRetrievalService, handler } = buildHandler();

    await handler.searchKnowledge({ query: 'pricing' }, ctx);

    expect(
      knowledgeContentRetrievalService.searchBrandKnowledge,
    ).toHaveBeenCalledWith(expect.objectContaining({ minRelevance: 0.6 }));
  });

  it('refuses to search without a brand or a query', async () => {
    const { knowledgeContentRetrievalService, handler } = buildHandler();
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
    expect(
      knowledgeContentRetrievalService.searchBrandKnowledge,
    ).not.toHaveBeenCalled();
  });

  it('searches the brand passed by the caller when the session has none', async () => {
    const { knowledgeContentRetrievalService, handler } = buildHandler();

    const result = await handler.searchKnowledge(
      { brandId: 'brand-explicit', query: 'pricing' },
      { ...ctx, brandId: undefined },
    );

    expect(result.success).toBe(true);
    expect(
      knowledgeContentRetrievalService.searchBrandKnowledge,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-explicit',
        organizationId: 'org-1',
        query: 'pricing',
        userId: 'user-1',
        isApiKey: undefined,
        scopes: undefined,
      }),
    );
  });

  it('filters by purpose and processing state in the query, before pagination', async () => {
    const { handler, records } = buildHandler();
    records.listSources.mockResolvedValue({
      docs: [
        { ...source, id: 'source-2', purpose: KnowledgeSourcePurpose.RESEARCH },
      ],
      totalDocs: 1,
      totalPages: 1,
    });

    const result = await handler.listKnowledgeSources(
      { limit: 500, processingState: 'READY', purpose: 'RESEARCH' },
      ctx,
    );

    expect(records.listSources).toHaveBeenCalledWith(actor, 1, 100, {
      processingState: KnowledgeProcessingState.READY,
      purpose: KnowledgeSourcePurpose.RESEARCH,
    });
    expect(result.data?.sources).toEqual([
      expect.objectContaining({
        id: 'source-2',
        processingState: KnowledgeProcessingState.READY,
        purpose: KnowledgeSourcePurpose.RESEARCH,
        versionId: 'version-1',
      }),
    ]);
    expect(result.data).toMatchObject({ limit: 100, page: 1, total: 1 });
  });

  it('ignores unknown list filters instead of matching nothing', async () => {
    const { handler, records } = buildHandler();

    await handler.listKnowledgeSources(
      { processingState: 'BOGUS', purpose: 'NOPE' },
      ctx,
    );

    expect(records.listSources).toHaveBeenCalledWith(actor, 1, 25, {
      processingState: undefined,
      purpose: undefined,
    });
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
      (await handler.captureKnowledge({ kind: 'FILE', title: 'x' }, ctx)).error,
    ).toContain('TEXT, URL, DOCUMENT, RSS, AUDIO or VIDEO');
  });

  it('passes media transcript settings as capture fields that ingest reads', async () => {
    const { capture, handler } = buildHandler();

    await handler.captureKnowledge(
      {
        isTranscriptGenerationAllowed: true,
        kind: 'VIDEO',
        referenceUrl: 'https://media.example/talk.mp4',
        title: 'Talk',
        transcriptUrl: 'https://media.example/talk.vtt',
      },
      ctx,
    );

    expect(capture.capture).toHaveBeenCalledWith(actor, {
      isTranscriptGenerationAllowed: true,
      kind: KnowledgeSourceKind.VIDEO,
      provenance: { capturedBy: 'agent', threadId: 'thread-1' },
      purpose: KnowledgeSourcePurpose.INSPIRATION,
      referenceUrl: 'https://media.example/talk.mp4',
      scope: KnowledgeMemoryScope.BRAND,
      text: undefined,
      title: 'Talk',
      transcriptUrl: 'https://media.example/talk.vtt',
    });
  });

  it('drops transcript settings for non-media kinds', async () => {
    const { capture, handler } = buildHandler();

    await handler.captureKnowledge(
      {
        isTranscriptGenerationAllowed: true,
        kind: 'URL',
        referenceUrl: 'https://brand.example/faq',
        title: 'FAQ',
        transcriptUrl: 'https://brand.example/faq.vtt',
      },
      ctx,
    );

    const dto = capture.capture.mock.calls[0][1];
    expect(dto).not.toHaveProperty('isTranscriptGenerationAllowed');
    expect(dto).not.toHaveProperty('transcriptUrl');
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
  describe('search filters and paging', () => {
    it('passes kinds, capture dates and the cursor to the search', async () => {
      const { knowledgeContentRetrievalService, handler } = buildHandler();

      await handler.searchKnowledge(
        {
          cursor: 'cursor-1',
          kinds: ['URL', 'bogus', 'URL', 'DOCUMENT'],
          occurredFrom: '2026-09-01',
          occurredTo: '2026-09-30T23:59:59Z',
          query: 'pricing',
        },
        ctx,
      );

      expect(
        knowledgeContentRetrievalService.searchBrandKnowledge,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: 'cursor-1',
          kinds: ['URL', 'DOCUMENT'],
          occurredFrom: new Date('2026-09-01'),
          occurredTo: new Date('2026-09-30T23:59:59Z'),
        }),
      );
    });

    it.each([
      ['an unreadable start date', { occurredFrom: 'last tuesday' }],
      ['an unreadable end date', { occurredTo: 'soon' }],
      ['a non-string date', { occurredFrom: 20260901 }],
      [
        'a start date after the end date',
        { occurredFrom: '2026-10-01', occurredTo: '2026-09-01' },
      ],
    ])('refuses %s without searching', async (_label, filters) => {
      const { knowledgeContentRetrievalService, handler } = buildHandler();

      const result = await handler.searchKnowledge(
        { query: 'pricing', ...filters },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(
        knowledgeContentRetrievalService.searchBrandKnowledge,
      ).not.toHaveBeenCalled();
    });

    it('lists a timeline only when asked, and ranks otherwise', async () => {
      const { knowledgeContentRetrievalService, handler } = buildHandler();

      await handler.searchKnowledge({ mode: 'timeline', query: 'launch' }, ctx);
      await handler.searchKnowledge(
        { mode: 'anything else', query: 'launch' },
        ctx,
      );
      await handler.searchKnowledge({ query: 'launch' }, ctx);

      expect(
        knowledgeContentRetrievalService.searchBrandKnowledge.mock.calls.map(
          ([call]) => call.mode,
        ),
      ).toEqual(['timeline', 'search', 'search']);
    });

    it('returns the next cursor and says the result is truncated', async () => {
      const { knowledgeContentRetrievalService, handler } = buildHandler();
      knowledgeContentRetrievalService.searchBrandKnowledge.mockResolvedValue({
        hits: [
          {
            citation: { sourceId: 'source-1' },
            content: 'Plans start at $29',
            occurredAt: '2026-09-02T00:00:00.000Z',
            relevance: 0.9,
          },
        ],
        nextCursor: 'cursor-2',
      });

      const result = await handler.searchKnowledge({ query: 'pricing' }, ctx);

      expect(result.data).toMatchObject({
        isTruncated: true,
        nextCursor: 'cursor-2',
        passages: [
          expect.objectContaining({ occurredAt: '2026-09-02T00:00:00.000Z' }),
        ],
      });
    });

    it('omits the cursor on the last page', async () => {
      const { handler } = buildHandler();

      const result = await handler.searchKnowledge({ query: 'pricing' }, ctx);

      expect(result.data).not.toHaveProperty('nextCursor');
      expect(result.data).not.toHaveProperty('isTruncated');
    });

    it('turns a cursor from another search into a clear tool error', async () => {
      const { knowledgeContentRetrievalService, handler } = buildHandler();
      knowledgeContentRetrievalService.searchBrandKnowledge.mockRejectedValue(
        new InvalidKnowledgeSearchCursorError(),
      );

      const result = await handler.searchKnowledge(
        { cursor: 'stale', query: 'pricing' },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('cursor');
    });

    it('lets any other search failure surface', async () => {
      const { knowledgeContentRetrievalService, handler } = buildHandler();
      knowledgeContentRetrievalService.searchBrandKnowledge.mockRejectedValue(
        new Error('database unavailable'),
      );

      await expect(
        handler.searchKnowledge({ query: 'pricing' }, ctx),
      ).rejects.toThrow('database unavailable');
    });
  });
});
