import {
  collectionDocument,
  fetchResponse,
  installMockFetch,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { ContextsService } from '@services/ai/contexts.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('ContextsService', () => {
  const token = 'contexts-token';
  let fetchMock: ReturnType<typeof installMockFetch>;

  function lastCall(): [string, RequestInit] {
    return fetchMock.mock.calls[0] as [string, RequestInit];
  }

  beforeEach(() => {
    ContextsService.clearInstance(token);
    fetchMock = installMockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('caches instances per token and clears them', () => {
    const first = ContextsService.getInstance(token);
    expect(ContextsService.getInstance(token)).toBe(first);
    ContextsService.clearInstance(token);
    expect(ContextsService.getInstance(token)).not.toBe(first);
  });

  it('preserves the serialized base and validates operation meta when admitting explicit historical work', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        ...resourceDocument({ label: 'Docs' }, { id: 'ctx_1' }),
        meta: { admitted: 1, skipped: 1, nextCursor: 'next' },
      }),
    );
    const result = await ContextsService.getInstance(token).backfillEmbeddings(
      'ctx_1',
      { maxEntries: 2, cursor: 'prior' },
    );
    expect(result).toEqual({
      contextBase: { id: 'ctx_1', label: 'Docs' },
      admission: { admitted: 1, skipped: 1, nextCursor: 'next' },
    });
    const [url, init] = lastCall();
    expect(url).toContain('/contexts/ctx_1/embeddings/backfill');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      maxEntries: 2,
      cursor: 'prior',
    });
  });

  it.each([
    undefined,
    null,
    {},
    { admitted: -1, skipped: 0, nextCursor: null },
    { admitted: 1.1, skipped: 0, nextCursor: null },
    { admitted: '1', skipped: 0, nextCursor: null },
    { admitted: 1, skipped: -1, nextCursor: null },
    { admitted: 1, skipped: 0 },
    { admitted: 1, skipped: 0, nextCursor: '' },
    { admitted: 1, skipped: 0, nextCursor: 1 },
    { admitted: 1, skipped: 0, nextCursor: null, leaseToken: 'must-not-cross' },
  ])('rejects missing or malformed operation metadata %j', async (meta) => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        ...resourceDocument({ label: 'Docs' }, { id: 'ctx_1' }),
        meta,
      }),
    );
    await expect(
      ContextsService.getInstance(token).backfillEmbeddings('ctx_1', {
        maxEntries: 2,
      }),
    ).rejects.toThrow('metadata');
  });

  it('createContext POSTs and deserializes the resource', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse(resourceDocument({ label: 'Docs' }, { id: 'ctx_1' })),
    );

    const service = ContextsService.getInstance(token);
    const result = await service.createContext({ label: 'Docs' });

    const [url, init] = lastCall();
    expect(url).toContain('/contexts');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ label: 'Docs' });
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${token}`,
    );
    expect(result).toEqual({ id: 'ctx_1', label: 'Docs' });
  });

  it('listContexts GETs and deserializes the collection', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse(collectionDocument([{ id: 'ctx_1', label: 'Docs' }])),
    );

    const service = ContextsService.getInstance(token);
    const result = await service.listContexts();

    const [url, init] = lastCall();
    expect(url).toContain('/contexts?limit=100&page=1');
    expect(init.method).toBe('GET');
    expect(result).toEqual([{ id: 'ctx_1', label: 'Docs' }]);
  });

  it('listContexts walks every page', async () => {
    const withPages = (id: string, page: number) => ({
      ...collectionDocument([{ id, label: id }]),
      links: { pagination: { limit: 100, page, pages: 2, total: 101 } },
    });
    fetchMock
      .mockResolvedValueOnce(fetchResponse(withPages('ctx_1', 1)))
      .mockResolvedValueOnce(fetchResponse(withPages('ctx_2', 2)));

    const result = await ContextsService.getInstance(token).listContexts();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('page=2');
    expect(result.map((context) => context.id)).toEqual(['ctx_1', 'ctx_2']);
  });

  it('getContext GETs a single context', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse(resourceDocument({ label: 'Docs' }, { id: 'ctx_1' })),
    );

    const service = ContextsService.getInstance(token);
    const result = await service.getContext('ctx_1');

    const [url] = lastCall();
    expect(url).toContain('/contexts/ctx_1');
    expect(result).toEqual({ id: 'ctx_1', label: 'Docs' });
  });

  it('updateContext PATCHes the updates', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse(resourceDocument({ label: 'Edited' }, { id: 'ctx_1' })),
    );

    const service = ContextsService.getInstance(token);
    await service.updateContext('ctx_1', { label: 'Edited' });

    const [url, init] = lastCall();
    expect(url).toContain('/contexts/ctx_1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ label: 'Edited' });
  });

  it('deleteContext DELETEs the context', async () => {
    fetchMock.mockResolvedValue(fetchResponse({}));

    const service = ContextsService.getInstance(token);
    await service.deleteContext('ctx_1');

    const [url, init] = lastCall();
    expect(url).toContain('/contexts/ctx_1');
    expect(init.method).toBe('DELETE');
  });

  it.each([{ contextBaseId: 'ctx_1' }, { contextBaseIds: ['ctx_1'] }])(
    'query POSTs canonical context scope %j',
    async (scope) => {
      fetchMock.mockResolvedValue(
        fetchResponse([{ content: 'voice', relevance: 0.9 }]),
      );

      const service = ContextsService.getInstance(token);
      const result = await service.query({
        ...scope,
        query: 'brand voice',
      });

      const [url, init] = lastCall();
      expect(url).toContain('/contexts/query');
      expect(JSON.parse(init.body as string)).toEqual({
        contextBaseId: 'ctx_1',
        query: 'brand voice',
      });
      expect(result.totalResults).toBe(1);
      expect(result.chunks[0]?.content).toBe('voice');
    },
  );

  it('enhancePrompt POSTs to the contexts enhance endpoint', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        context: [{ content: 'fact', relevance: 0.8, source: 'Docs' }],
        enhancedPrompt: 'raw',
        estimatedQualityBoost: 40,
        originalPrompt: 'raw',
      }),
    );

    const service = ContextsService.getInstance(token);
    const result = await service.enhancePrompt({
      contentType: 'caption',
      contextBaseIds: ['ctx_1'],
      prompt: 'raw',
    });

    const [url, init] = lastCall();
    expect(url).toContain('/contexts/enhance');
    expect(JSON.parse(init.body as string).contextBaseIds).toEqual(['ctx_1']);
    expect(result.enhancedPrompt).toBe('raw');
    expect(result.context).toEqual(['fact']);
  });

  it('getRelevantContext POSTs prompt to enhance', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        context: [{ content: 'a', relevance: 1, source: 's' }],
      }),
    );

    const service = ContextsService.getInstance(token);
    const result = await service.getRelevantContext('prompt', 'caption', {
      brandId: 'brand_1',
      maxChunks: 3,
    });

    const [url, init] = lastCall();
    expect(url).toContain('/contexts/enhance');
    expect(JSON.parse(init.body as string)).toEqual({
      contentType: 'caption',
      maxResults: 3,
      prompt: 'prompt',
    });
    expect(result).toEqual({
      context: ['a'],
      relevanceScores: [1],
      sources: ['s'],
    });
  });

  it('throws the endpoint error message on failure', async () => {
    fetchMock.mockResolvedValue(fetchResponse({}, { ok: false }));

    const service = ContextsService.getInstance(token);
    await expect(service.listContexts()).rejects.toThrow(
      'Failed to list contexts',
    );
  });
});
