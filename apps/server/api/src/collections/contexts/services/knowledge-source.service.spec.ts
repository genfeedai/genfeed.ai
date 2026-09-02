import { KnowledgeSourceService } from '@api/collections/contexts/services/knowledge-source.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { KnowledgeBaseCategory, KnowledgeBaseStatus } from '@genfeedai/enums';

describe('KnowledgeSourceService', () => {
  function buildService(
    options: {
      queue?: {
        enqueueBackfill: ReturnType<typeof vi.fn>;
        enqueueIngest: ReturnType<typeof vi.fn>;
      };
    } = {},
  ) {
    const contextBase = {
      data: { label: 'Brand knowledge', sources: [] as unknown[] },
      id: 'ctx-1',
      isDeleted: false,
      organizationId: 'org-1',
    };
    const findOne = vi.fn().mockResolvedValue(contextBase);
    const removeEntriesBySource = vi.fn().mockResolvedValue(2);
    const update = vi.fn().mockImplementation(({ data }) => {
      contextBase.data = data.data as typeof contextBase.data;
      return Promise.resolve(contextBase);
    });
    const enqueueIngest =
      options.queue?.enqueueIngest ??
      vi.fn().mockResolvedValue('kb-ingest-ctx-1-src_1');
    const enqueueBackfill =
      options.queue?.enqueueBackfill ??
      vi.fn().mockResolvedValue('kb-backfill-org-1');
    const service = new KnowledgeSourceService(
      { contextBase: { update } } as never,
      { findOne, removeEntriesBySource } as never,
      { enqueueBackfill, enqueueIngest } as never,
    );

    return {
      contextBase,
      enqueueBackfill,
      enqueueIngest,
      findOne,
      removeEntriesBySource,
      service,
      update,
    };
  }

  it('persists a draft source and enqueues ingest', async () => {
    const { enqueueIngest, service, update } = buildService();

    const result = await service.addSource(
      'ctx-1',
      {
        category: KnowledgeBaseCategory.URL,
        label: 'Docs',
        referenceUrl: 'https://docs.example.com',
      },
      'org-1',
    );

    expect(result.source.status).toBe(KnowledgeBaseStatus.DRAFT);
    expect(result.source.referenceUrl).toBe('https://docs.example.com');
    expect(result.jobId).toBe('kb-ingest-ctx-1-src_1');
    expect(enqueueIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        contextBaseId: 'ctx-1',
        organizationId: 'org-1',
        sourceId: result.source.id,
      }),
    );
    expect(update).toHaveBeenCalled();
  });

  it('re-ingests when the source URL changes and soft-deletes chunks on remove', async () => {
    const existing = {
      category: KnowledgeBaseCategory.URL,
      id: 'src_1',
      label: 'Docs',
      referenceUrl: 'https://docs.example.com',
      status: KnowledgeBaseStatus.COMPLETED,
    };
    const { enqueueIngest, findOne, removeEntriesBySource, service } =
      buildService();
    findOne.mockResolvedValue({
      data: { sources: [existing] },
      id: 'ctx-1',
      organizationId: 'org-1',
    });

    const updated = await service.updateSource(
      'ctx-1',
      'src_1',
      { referenceUrl: 'https://docs.example.com/v2' },
      'org-1',
    );
    expect(updated.source.status).toBe(KnowledgeBaseStatus.DRAFT);
    expect(enqueueIngest).toHaveBeenCalled();

    await service.removeSource('ctx-1', 'src_1', 'org-1');
    expect(removeEntriesBySource).toHaveBeenCalledWith(
      'ctx-1',
      'src_1',
      'org-1',
    );

    findOne.mockResolvedValue({
      data: { sources: [] },
      id: 'ctx-1',
      organizationId: 'org-1',
    });
    await expect(
      service.removeSource('ctx-1', 'missing', 'org-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enqueues a backfill job for the tenant', async () => {
    const { enqueueBackfill, service } = buildService();

    await expect(service.backfill('org-1')).resolves.toEqual({
      jobId: 'kb-backfill-org-1',
      queued: 1,
    });
    expect(enqueueBackfill).toHaveBeenCalledWith({ organizationId: 'org-1' });
  });
});
