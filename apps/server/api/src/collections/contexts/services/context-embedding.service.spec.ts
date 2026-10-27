import { createHash } from 'node:crypto';
import { ContextEmbeddingService } from '@api/collections/contexts/services/context-embedding.service';
import {
  ContextEmbeddingProviderError,
  type ContextEmbeddingProviderService,
} from '@api/collections/contexts/services/context-embedding-provider.service';
import type { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type ContextEmbeddingJob,
  ContextEmbeddingJobStatus,
  type ContextEntry,
  Prisma,
} from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const hash = (text: string) =>
    createHash('sha256').update(text).digest('hex');
  const job: ContextEmbeddingJob = {
    id: 'intent',
    organizationId: 'org',
    contextEntryId: 'entry',
    generation: 1,
    origin: 'ACTOR',
    actorUserId: 'user',
    actorIsApiKey: false,
    actorScopes: [],
    actorApiKeyId: null,
    sourceMemoryId: null,
    sourceSnapshotHash: null,
    contentHash: hash('content'),
    modelIdentifier: 'pinned-model',
    dimension: 1024,
    attempts: 0,
    status: ContextEmbeddingJobStatus.PENDING,
    admissionOperation: 'ENTRY_WRITE',
    isDeleted: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    startedAt: null,
    completedAt: null,
    nextAttemptAt: new Date(0),
    leaseToken: null,
    leaseExpiresAt: null,
    safeFailureCode: null,
    workflowProvenance: null,
  };
  const entry: ContextEntry = {
    id: 'entry',
    organizationId: 'org',
    contextBaseId: 'base',
    data: { content: 'content' },
    embeddingGeneration: 1,
    embeddingStoredGeneration: 0,
    sourceAgentMemoryId: null,
    sourceAgentMemoryRevisionId: null,
    sourceSnapshotHash: null,
    knowledgeSourceId: null,
    knowledgeSourceVersionId: null,
    isDeleted: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    embeddingClaimedAt: null,
    embeddingFailedAt: null,
    knowledgeEmbeddingManifestId: null,
    knowledgeChunkIndex: null,
  };
  const tx = {
    contextEmbeddingJob: {
      findFirst: vi.fn().mockImplementation(async () => job),
    },
    contextEntry: {
      findFirst: vi.fn().mockImplementation(async () => entry),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contextBase: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'base',
        organizationId: 'org',
        isDeleted: false,
      }),
    },
    $queryRaw: vi
      .fn()
      .mockImplementation(async (query: Prisma.Sql) =>
        query.sql.includes('AS "isDue"')
          ? [{ isDue: true }]
          : query.sql.includes('RETURNING')
            ? [{ id: 'intent' }]
            : [],
      ),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  let inTransaction = false;
  const prisma = {
    $transaction: vi.fn().mockImplementation(async (work) => {
      inTransaction = true;
      try {
        return await work(tx);
      } finally {
        inTransaction = false;
      }
    }),
  };
  const writer = {
    contentHash: hash,
    memorySnapshot: vi.fn().mockResolvedValue(null),
    assertPrincipal: vi.fn().mockResolvedValue(undefined),
  };
  const provider = {
    stored: vi.fn().mockImplementation(async () => {
      expect(inTransaction).toBe(false);
      return Array(1024).fill(0.1);
    }),
  };
  const service = new ContextEmbeddingService(
    prisma as unknown as PrismaService,
    writer as unknown as ContextEmbeddingWriteService,
    provider as unknown as ContextEmbeddingProviderService,
  );
  const payload = {
    jobId: job.id,
    organizationId: job.organizationId,
    generation: job.generation,
  };
  return { service, payload, job, entry, tx, prisma, writer, provider };
}

describe('database-authoritative context embedding execution', () => {
  it('calls the pinned provider outside transactions and commits the vector behind a live database lease fence', async () => {
    const f = fixture();
    await f.service.process(f.payload);
    expect(f.provider.stored).toHaveBeenCalledExactlyOnceWith(
      'content',
      'pinned-model',
    );
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(2);
    const [commit] = f.tx.$executeRaw.mock.calls[0];
    expect(commit.sql).toContain('"leaseExpiresAt" > clock_timestamp()');
    expect(commit.sql).toContain('"leaseToken" =');
    expect(commit.values).toContain(f.payload.generation);
    expect(f.tx.$executeRaw.mock.calls[1][0].sql).toContain(
      '"embeddingStoredGeneration"',
    );
    expect(f.writer.assertPrincipal).toHaveBeenCalledTimes(2);
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(2);
  });
  it('rejects a duplicate delivered identity whose job is no longer due', async () => {
    const f = fixture();
    f.tx.$queryRaw.mockImplementation(async (query: Prisma.Sql) =>
      query.sql.includes('AS "isDue"') ? [{ isDue: false }] : [],
    );
    await f.service.process(f.payload);
    expect(f.provider.stored).not.toHaveBeenCalled();
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('settles an expired third attempt without a fourth provider call', async () => {
    const f = fixture();
    f.job.attempts = 3;
    f.job.status = ContextEmbeddingJobStatus.PROCESSING;
    await f.service.process(f.payload);
    expect(f.provider.stored).not.toHaveBeenCalled();
    expect(f.tx.$executeRaw.mock.calls[0][0].values).toContain(
      'ATTEMPTS_EXHAUSTED',
    );
    expect(f.tx.$executeRaw.mock.calls[0][0].values).toContain(
      ContextEmbeddingJobStatus.FAILED,
    );
  });
  it('cannot write a vector after a stale lease loses the conditional commit', async () => {
    const f = fixture();
    f.tx.$executeRaw.mockResolvedValue(0);
    await f.service.process(f.payload);
    expect(f.provider.stored).toHaveBeenCalledOnce();
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(f.tx.$executeRaw.mock.calls[0][0].sql).not.toContain(
      '"context_entries"',
    );
  });
  it('cancels revoked admission authority before contacting the provider', async () => {
    const f = fixture();
    f.writer.assertPrincipal.mockRejectedValue(new Error('denied'));
    await f.service.process(f.payload);
    expect(f.provider.stored).not.toHaveBeenCalled();
    expect(f.tx.$executeRaw.mock.calls[0][0].values).toContain(
      ContextEmbeddingJobStatus.CANCELLED,
    );
  });
  it('rechecks authority after the provider and never stores a revoked result', async () => {
    const f = fixture();
    f.writer.assertPrincipal
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('revoked'));
    await f.service.process(f.payload);
    expect(f.provider.stored).toHaveBeenCalledOnce();
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(f.tx.$executeRaw.mock.calls[0][0].values).toContain(
      ContextEmbeddingJobStatus.CANCELLED,
    );
  });
  it('records only the fixed retry classification and retains the database backoff', async () => {
    const f = fixture();
    f.provider.stored.mockRejectedValue(
      new ContextEmbeddingProviderError('PROVIDER_UNAVAILABLE', true),
    );
    await f.service.process(f.payload);
    const [settle] = f.tx.$executeRaw.mock.calls[0];
    expect(settle.values).toContain(ContextEmbeddingJobStatus.RETRYABLE);
    expect(settle.sql).toContain("INTERVAL '30 seconds'");
    expect(settle.sql).toContain("INTERVAL '120 seconds'");
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('leaves a failed database commit recoverable instead of misclassifying it as a provider failure', async () => {
    const f = fixture();
    const failure = new Error('database unavailable');
    f.tx.$executeRaw.mockRejectedValue(failure);
    await expect(f.service.process(f.payload)).rejects.toBe(failure);
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(f.provider.stored).toHaveBeenCalledOnce();
  });
});
