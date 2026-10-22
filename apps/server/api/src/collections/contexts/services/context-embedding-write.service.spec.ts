import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import type { ContextEmbeddingQueueService } from '@api/collections/contexts/services/context-embedding-queue.service';
import { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const actor = {
    userId: 'actual-user',
    organizationId: 'org',
    isApiKey: false,
    scopes: [] as string[],
  };
  const tx = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'actual-user' }) },
    organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org' }) },
    apiKey: {
      findFirst: vi.fn().mockResolvedValue({ scopes: ['memory:write'] }),
    },
    contextBase: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'base',
        organizationId: 'org',
        sourceBrandId: null,
        createdById: actor.userId,
        data: {},
      }),
    },
    contextEntry: {
      findFirst: vi.fn().mockImplementation(async ({ where }) => ({
        id: where.id,
        organizationId: 'org',
        contextBaseId: 'base',
        embeddingGeneration: 0,
        embeddingStoredGeneration: 0,
        sourceAgentMemoryId: null,
        sourceSnapshotHash: null,
        data: { content: 'legacy content' },
      })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi
        .fn()
        .mockImplementation(async ({ data }) => ({ ...data, id: 'entry' })),
    },
    contextEmbeddingJob: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(async ({ data }) => ({ ...data, id: 'intent' })),
    },
    $queryRaw: vi
      .fn()
      .mockImplementation(async (query: Prisma.Sql) =>
        query.sql.includes('AS "eligible"') ? [{ eligible: true }] : [],
      ),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  let hasCommitted = false;
  const prisma = {
    member: {
      findFirst: vi.fn().mockResolvedValue({ role: { key: MemberRole.ADMIN } }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn().mockImplementation(async (work) => {
      const value = await work(tx);
      hasCommitted = true;
      return value;
    }),
  };
  const policy = {
    resolve: vi.fn().mockResolvedValue({}),
    assert: vi.fn().mockResolvedValue(undefined),
  };
  const provider = {
    selectModel: vi.fn().mockResolvedValue('existing-model'),
    stored: vi.fn(),
    query: vi.fn(),
  };
  const queue = {
    enqueue: vi.fn().mockImplementation(async () => {
      expect(hasCommitted).toBe(true);
    }),
  };
  const logger = { warn: vi.fn() };
  const service = new ContextEmbeddingWriteService(
    prisma as unknown as PrismaService,
    policy as unknown as BrandAccessService,
    provider as unknown as ContextEmbeddingProviderService,
    queue as unknown as ContextEmbeddingQueueService,
    logger as unknown as LoggerService,
  );
  return { service, tx, prisma, policy, provider, queue, logger, actor };
}
describe('transactional context embedding admission', () => {
  it('commits the entry, durable generation and base count before offering identity to Redis', async () => {
    const f = fixture();
    await expect(
      f.service.write({
        contextBaseId: 'base',
        organizationId: 'org',
        dto: { content: 'Saved content' },
        principal: { origin: 'ACTOR', actor: f.actor },
      }),
    ).resolves.toMatchObject({
      id: 'entry',
      embeddingGeneration: 1,
      embeddingStoredGeneration: 0,
    });
    expect(f.tx.contextEmbeddingJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org',
        contextEntryId: 'entry',
        generation: 1,
        modelIdentifier: 'existing-model',
        actorUserId: 'actual-user',
        contentHash: f.service.contentHash('Saved content'),
      }),
    });
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(f.queue.enqueue).toHaveBeenCalledExactlyOnceWith({
      jobId: 'intent',
      organizationId: 'org',
      generation: 1,
    });
    expect(f.provider.stored).not.toHaveBeenCalled();
    expect(f.provider.query).not.toHaveBeenCalled();
  });
  it('returns the committed entry when postcommit Redis transport is lost', async () => {
    const f = fixture();
    f.queue.enqueue.mockRejectedValue(new Error('Redis unavailable'));
    await expect(
      f.service.write({
        contextBaseId: 'base',
        organizationId: 'org',
        dto: { content: 'Saved content' },
        principal: { origin: 'ACTOR', actor: f.actor },
      }),
    ).resolves.toMatchObject({ id: 'entry' });
    expect(f.tx.contextEmbeddingJob.create).toHaveBeenCalledTimes(1);
    expect(f.logger.warn).toHaveBeenCalledWith(
      'Context embedding transport unavailable; durable intent remains due',
    );
  });
  it('denies a revoked actual key before capture-side writes can start', async () => {
    const f = fixture();
    f.tx.apiKey.findFirst.mockResolvedValue(null);
    await expect(
      f.service.assertCaptureAuthority(
        {
          origin: 'ACTOR',
          actor: {
            ...f.actor,
            isApiKey: true,
            apiKeyId: 'revoked-key',
            scopes: ['memory:write'],
          },
        },
        'org',
      ),
    ).rejects.toThrow('Context access denied');
    expect(f.tx.contextEntry.create).not.toHaveBeenCalled();
    expect(f.tx.contextEmbeddingJob.create).not.toHaveBeenCalled();
    expect(f.queue.enqueue).not.toHaveBeenCalled();
    expect(f.provider.stored).not.toHaveBeenCalled();
  });
  it('denies captured scope shrink instead of expanding or downgrading actor authority', async () => {
    const f = fixture();
    f.tx.apiKey.findFirst.mockResolvedValue({ scopes: [] });
    await expect(
      f.service.assertCaptureAuthority(
        {
          origin: 'ACTOR',
          actor: {
            ...f.actor,
            isApiKey: true,
            apiKeyId: 'live-key',
            scopes: ['memory:write'],
          },
        },
        'org',
      ),
    ).rejects.toThrow('Context access denied');
    expect(f.queue.enqueue).not.toHaveBeenCalled();
  });
});

describe('explicit historical context embedding admission', () => {
  it('admits at most the requested bound and returns lookahead cursor without scanning another batch', async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
    const result = await f.service.backfill('base', 'org', f.actor, {
      maxEntries: 2,
    });
    expect(result.admission).toEqual({
      admitted: 2,
      skipped: 0,
      nextCursor: 'b',
    });
    expect(f.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(f.prisma.$queryRaw.mock.calls[0][0].values).toContain(3);
    expect(f.tx.contextEmbeddingJob.create).toHaveBeenCalledTimes(2);
    expect(f.tx.contextEmbeddingJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        admissionOperation: 'HISTORICAL_BACKFILL',
        origin: 'ACTOR',
        actorUserId: 'actual-user',
        generation: 1,
      }),
    });
    expect(f.tx.contextEntry.create).not.toHaveBeenCalled();
    expect(f.queue.enqueue).toHaveBeenCalledTimes(2);
    expect(f.provider.stored).not.toHaveBeenCalled();
  });
  it('counts already-admitted concurrent work as skipped without resetting attempts', async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValue([{ id: 'a' }]);
    f.tx.contextEmbeddingJob.findFirst.mockResolvedValue({
      status: 'PROCESSING',
      attempts: 2,
    });
    const result = await f.service.backfill('base', 'org', f.actor, {
      maxEntries: 1,
      cursor: '0',
    });
    expect(result.admission).toEqual({
      admitted: 0,
      skipped: 1,
      nextCursor: null,
    });
    expect(f.tx.contextEntry.updateMany).not.toHaveBeenCalled();
    expect(f.tx.contextEmbeddingJob.create).not.toHaveBeenCalled();
    expect(f.queue.enqueue).not.toHaveBeenCalled();
  });
  it('fails current governance before selecting historical candidates or a model', async () => {
    const f = fixture();
    f.prisma.member.findFirst.mockResolvedValue({
      role: { key: MemberRole.USER },
    });
    await expect(
      f.service.backfill('base', 'org', f.actor, { maxEntries: 1 }),
    ).rejects.toThrow('admin');
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(f.provider.selectModel).not.toHaveBeenCalled();
    expect(f.tx.contextEmbeddingJob.create).not.toHaveBeenCalled();
  });
  it('does not admit a concurrently changed generation when the final compare-and-set loses', async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValue([{ id: 'a' }]);
    f.tx.contextEntry.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      f.service.backfill('base', 'org', f.actor, { maxEntries: 1 }),
    ).resolves.toMatchObject({ admission: { admitted: 0, skipped: 1 } });
    expect(f.tx.contextEmbeddingJob.create).not.toHaveBeenCalled();
    expect(f.queue.enqueue).not.toHaveBeenCalled();
  });
  it('does not admit a source whose current retention or audience eligibility was lost', async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValue([{ id: 'a' }]);
    f.tx.$queryRaw.mockImplementation(async (query: Prisma.Sql) =>
      query.sql.includes('AS "eligible"') ? [{ eligible: false }] : [],
    );
    await expect(
      f.service.backfill('base', 'org', f.actor, { maxEntries: 1 }),
    ).resolves.toMatchObject({ admission: { admitted: 0, skipped: 1 } });
    expect(f.tx.contextEntry.updateMany).not.toHaveBeenCalled();
    expect(f.tx.contextEmbeddingJob.create).not.toHaveBeenCalled();
  });
});
