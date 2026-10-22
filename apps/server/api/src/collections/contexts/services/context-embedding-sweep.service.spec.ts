import type { ContextEmbeddingQueueService } from '@api/collections/contexts/services/context-embedding-queue.service';
import { ContextEmbeddingSweepService } from '@api/collections/contexts/services/context-embedding-sweep.service';
import type { KnowledgeEmbeddingCompletionService } from '@api/collections/contexts/services/knowledge-embedding-completion.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

describe('admitted context embedding recovery', () => {
  it('recovers separately bounded due intents and expired leases without historical entry discovery', async () => {
    const due = Array.from({ length: 200 }, (_, i) => ({
      jobId: 'due-' + i,
      organizationId: 'org',
      generation: 1,
    }));
    const expired = Array.from({ length: 200 }, (_, i) => ({
      jobId: 'expired-' + i,
      organizationId: 'org',
      generation: 2,
    }));
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce(due)
        .mockResolvedValueOnce(expired)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const service = new ContextEmbeddingSweepService(
      prisma as unknown as PrismaService,
      queue as unknown as ContextEmbeddingQueueService,
      { complete: vi.fn() } as unknown as KnowledgeEmbeddingCompletionService,
    );
    await expect(service.sweep()).resolves.toEqual({
      due: 200,
      expired: 200,
      unavailable: 0,
      manifests: 0,
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(400);
    expect(queue.enqueue).toHaveBeenCalledWith(expired[199]);
    for (const [query] of prisma.$queryRaw.mock.calls) {
      expect(query.sql).toContain('LIMIT 200');
      if (!query.sql.includes('"knowledge_embedding_manifests"'))
        expect(query.sql).toContain('clock_timestamp()');
      expect(query.sql).toContain('"context_embedding_jobs"');
      if (!query.sql.includes('"knowledge_embedding_manifests"'))
        expect(query.sql).not.toContain('"context_entries"');
    }
    expect(prisma.$queryRaw.mock.calls[0][0].sql).toContain(
      "'PENDING', 'RETRYABLE'",
    );
    expect(prisma.$queryRaw.mock.calls[1][0].sql).toContain("'PROCESSING'");
  });

  it('continues after transport loss and leaves database intents unchanged', async () => {
    const rows = [
      { jobId: 'a', organizationId: 'org', generation: 1 },
      { jobId: 'b', organizationId: 'org', generation: 1 },
    ];
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const queue = {
      enqueue: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(undefined),
    };
    const service = new ContextEmbeddingSweepService(
      prisma as unknown as PrismaService,
      queue as unknown as ContextEmbeddingQueueService,
      { complete: vi.fn() } as unknown as KnowledgeEmbeddingCompletionService,
    );
    await expect(service.sweep()).resolves.toEqual({
      due: 2,
      expired: 0,
      unavailable: 1,
      manifests: 0,
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
  });
});
