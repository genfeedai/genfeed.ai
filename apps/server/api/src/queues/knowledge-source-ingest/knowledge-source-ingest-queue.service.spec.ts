import {
  KnowledgeSourceIngestQueueService,
  knowledgeSourceBackfillJobId,
  knowledgeSourceIngestJobId,
} from '@api/queues/knowledge-source-ingest/knowledge-source-ingest-queue.service';
import {
  KNOWLEDGE_SOURCE_BACKFILL_JOB_NAME,
  KNOWLEDGE_SOURCE_INGEST_JOB_NAME,
} from '@genfeedai/queue-contracts';

describe('KnowledgeSourceIngestQueueService', () => {
  it('mints BullMQ-safe job ids without colons', () => {
    expect(knowledgeSourceIngestJobId('ctx-1', 'src_1')).toBe(
      'kb-ingest-ctx-1-src_1',
    );
    expect(knowledgeSourceBackfillJobId('org-1')).toBe('kb-backfill-org-1');
    expect(knowledgeSourceBackfillJobId()).toBe('kb-backfill-all');
    expect(knowledgeSourceIngestJobId('ctx-1', 'src_1')).not.toContain(':');
    expect(knowledgeSourceBackfillJobId('org-1')).not.toContain(':');
  });

  it('enqueues an ingest job with a deterministic id', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'kb-ingest-ctx-1-src_1' }),
      getJob: vi.fn().mockResolvedValue(null),
    };
    const service = new KnowledgeSourceIngestQueueService(
      { log: vi.fn(), warn: vi.fn() } as never,
      queue as never,
    );

    await expect(
      service.enqueueIngest({
        contextBaseId: 'ctx-1',
        organizationId: 'org-1',
        sourceId: 'src_1',
      }),
    ).resolves.toBe('kb-ingest-ctx-1-src_1');

    expect(queue.add).toHaveBeenCalledWith(
      KNOWLEDGE_SOURCE_INGEST_JOB_NAME,
      {
        contextBaseId: 'ctx-1',
        organizationId: 'org-1',
        sourceId: 'src_1',
      },
      expect.objectContaining({ jobId: 'kb-ingest-ctx-1-src_1' }),
    );
  });

  it('reuses an in-flight ingest lease and replaces a completed one', async () => {
    const activeQueue = {
      add: vi.fn().mockResolvedValue({ id: 'kb-ingest-ctx-1-src_1' }),
      getJob: vi.fn().mockResolvedValue({
        getState: vi.fn().mockResolvedValue('active'),
        remove: vi.fn(),
      }),
    };
    const activeService = new KnowledgeSourceIngestQueueService(
      { log: vi.fn(), warn: vi.fn() } as never,
      activeQueue as never,
    );

    await activeService.enqueueIngest({
      contextBaseId: 'ctx-1',
      organizationId: 'org-1',
      sourceId: 'src_1',
    });
    expect(activeQueue.add).not.toHaveBeenCalled();

    const remove = vi.fn().mockResolvedValue(undefined);
    const completedQueue = {
      add: vi.fn().mockResolvedValue({ id: 'kb-ingest-ctx-1-src_1' }),
      getJob: vi.fn().mockResolvedValue({
        getState: vi.fn().mockResolvedValue('completed'),
        remove,
      }),
    };
    const completedService = new KnowledgeSourceIngestQueueService(
      { log: vi.fn(), warn: vi.fn() } as never,
      completedQueue as never,
    );

    await completedService.enqueueIngest({
      contextBaseId: 'ctx-1',
      organizationId: 'org-1',
      sourceId: 'src_1',
    });
    expect(remove).toHaveBeenCalled();
    expect(completedQueue.add).toHaveBeenCalled();
  });

  it('enqueues a tenant-scoped backfill job', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'kb-backfill-org-1' }),
      getJob: vi.fn().mockResolvedValue(null),
    };
    const service = new KnowledgeSourceIngestQueueService(
      { log: vi.fn(), warn: vi.fn() } as never,
      queue as never,
    );

    await expect(
      service.enqueueBackfill({ organizationId: 'org-1' }),
    ).resolves.toBe('kb-backfill-org-1');
    expect(queue.add).toHaveBeenCalledWith(
      KNOWLEDGE_SOURCE_BACKFILL_JOB_NAME,
      { organizationId: 'org-1' },
      expect.objectContaining({ jobId: 'kb-backfill-org-1' }),
    );
  });
});
