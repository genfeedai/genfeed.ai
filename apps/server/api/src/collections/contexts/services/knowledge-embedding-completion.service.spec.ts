import { createHash } from 'node:crypto';
import type { KnowledgeEmbeddingStageInput } from '@api/collections/contexts/interfaces/context-embedding-write.interface';
import type { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import type { ContextEmbeddingQueueService } from '@api/collections/contexts/services/context-embedding-queue.service';
import type { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import { KnowledgeEmbeddingCompletionService } from '@api/collections/contexts/services/knowledge-embedding-completion.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { KnowledgeProcessingState } from '@genfeedai/contracts';
import { type KnowledgeSourceVersion, Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const actor = {
    userId: 'actual-user',
    organizationId: 'org',
    isApiKey: false,
    scopes: [],
  };
  const source = {
    id: 'source',
    organizationId: 'org',
    userId: actor.userId,
    brandId: null,
    scope: 'org',
    isVisible: true,
    syncState: 'CURRENT',
    staleAt: null,
    consecutiveFailures: 0,
    kind: 'TEXT',
    refreshIntervalMinutes: null,
    firstFailureAt: null,
    gracePeriodMinutes: null,
  };
  const version = {
    id: 'version',
    sourceId: source.id,
    organizationId: 'org',
    isCurrent: true,
    embeddingGeneration: 1,
    retentionState: 'RETAINED',
    retrievalState: 'ACTIVE',
    supersededByVersionId: null,
    isDeleted: false,
  } as KnowledgeSourceVersion;
  const input: KnowledgeEmbeddingStageInput = {
    organizationId: 'org',
    sourceId: source.id,
    versionId: version.id,
    contextBaseId: 'base',
    admissionExecutionId: 'trusted-execution',
    initiatingActor: actor,
    chunks: [
      {
        content: 'content',
        metadata: { chunkIndex: 0, sourceId: source.id, versionId: version.id },
      },
    ],
    observedValidators: { etag: 'observed-etag' },
  };
  let inTransaction = false;
  const manifest = {
    id: 'manifest',
    organizationId: 'org',
    sourceId: source.id,
    versionId: version.id,
    generation: 1,
    expectedChunkCount: 1,
    modelIdentifier: 'pinned-model',
    orderedChunksHash: '',
    initiatingActor: actor,
    observedValidators: input.observedValidators,
    finalizedAt: null as Date | null,
    failedAt: null as Date | null,
  };
  const entry = {
    id: 'entry',
    data: { content: 'content', metadata: input.chunks[0].metadata },
    knowledgeChunkIndex: 0,
    embeddingGeneration: 1,
    embeddingStoredGeneration: 1,
  };
  const tx = {
    knowledgeSource: {
      findFirst: vi.fn().mockResolvedValue(source),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    knowledgeSourceVersion: {
      findFirst: vi.fn().mockResolvedValue(version),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    knowledgeSourceRefreshRun: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'run', expectedCurrentVersionId: 'previous' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    knowledgeEmbeddingManifest: {
      findFirst: vi.fn().mockResolvedValue(manifest),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        ...data,
        id: 'new-manifest',
      })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    knowledgeCaptureRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contextEntry: {
      findMany: vi.fn().mockResolvedValue([entry]),
      groupBy: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    contextEmbeddingJob: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRaw: vi
      .fn()
      .mockImplementation(async (query: Prisma.Sql) =>
        query.sql.includes('LIMIT 201 FOR UPDATE')
          ? [{ id: entry.id }]
          : query.sql.includes('AS "valid"')
            ? [{ valid: true }]
            : query.sql.includes('COUNT(*)')
              ? [{ count: 1 }]
              : [],
      ),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
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
    contentHash: (text: string) =>
      createHash('sha256').update(text).digest('hex'),
    assertActor: vi.fn().mockResolvedValue(undefined),
    writeInTransaction: vi
      .fn()
      .mockImplementation(async (client, _input, model, generation) => {
        expect(client).toBe(tx);
        expect(inTransaction).toBe(true);
        return {
          entry,
          job: {
            id: 'intent',
            organizationId: 'org',
            generation,
            modelIdentifier: model,
          },
        };
      }),
  };
  const provider = {
    selectModel: vi.fn().mockImplementation(async () => {
      expect(inTransaction).toBe(false);
      return 'pinned-model';
    }),
    stored: vi.fn(),
  };
  const queue = {
    enqueue: vi.fn().mockImplementation(async () => {
      expect(inTransaction).toBe(false);
    }),
  };
  const service = new KnowledgeEmbeddingCompletionService(
    prisma as unknown as PrismaService,
    writer as unknown as ContextEmbeddingWriteService,
    provider as unknown as ContextEmbeddingProviderService,
    queue as unknown as ContextEmbeddingQueueService,
  );
  manifest.orderedChunksHash = service.orderedHash(
    source.id,
    version.id,
    'pinned-model',
    input.chunks,
  );
  return {
    service,
    input,
    actor,
    source,
    version,
    manifest,
    entry,
    tx,
    prisma,
    writer,
    provider,
    queue,
  };
}

describe('sealed Knowledge embedding generations', () => {
  it('stages the complete snapshot and all jobs in one transaction before offering queue identities', async () => {
    const f = fixture();
    f.tx.knowledgeEmbeddingManifest.findFirst.mockResolvedValue(null);
    await expect(f.service.stage(f.input)).resolves.toMatchObject({
      id: 'new-manifest',
      expectedChunkCount: 1,
      generation: 1,
    });
    expect(f.prisma.$transaction).toHaveBeenCalledOnce();
    expect(f.tx.knowledgeEmbeddingManifest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        admissionExecutionId: 'trusted-execution',
        observedValidators: { etag: 'observed-etag' },
        orderedChunksHash: f.manifest.orderedChunksHash,
      }),
    });
    expect(f.writer.writeInTransaction).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({
        principal: { origin: 'ACTOR', actor: f.actor },
      }),
      'pinned-model',
      1,
      { id: 'new-manifest', index: 0 },
    );
    expect(f.queue.enqueue).toHaveBeenCalledExactlyOnceWith({
      jobId: 'intent',
      organizationId: 'org',
      generation: 1,
    });
    expect(f.provider.stored).not.toHaveBeenCalled();
  });
  it('replays a failed execution without resetting its generation or attempts', async () => {
    const f = fixture();
    f.manifest.failedAt = new Date();
    await expect(f.service.stage(f.input)).resolves.toBe(f.manifest);
    expect(f.writer.writeInTransaction).not.toHaveBeenCalled();
    expect(f.tx.knowledgeEmbeddingManifest.create).not.toHaveBeenCalled();
    expect(f.queue.enqueue).not.toHaveBeenCalled();
  });
  it('reuses a matching pending generation from another execution', async () => {
    const f = fixture();
    f.tx.knowledgeEmbeddingManifest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(f.manifest);
    await expect(f.service.stage(f.input)).resolves.toBe(f.manifest);
    expect(f.writer.writeInTransaction).not.toHaveBeenCalled();
  });
  it('allows a distinct explicit retry to advance one failed generation while preserving its manifest', async () => {
    const f = fixture();
    f.manifest.failedAt = new Date();
    f.tx.knowledgeEmbeddingManifest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(f.manifest);
    await expect(
      f.service.stage({
        ...f.input,
        admissionExecutionId: 'new-explicit-execution',
      }),
    ).resolves.toMatchObject({ generation: 2 });
    expect(f.tx.knowledgeEmbeddingManifest.updateMany).not.toHaveBeenCalled();
    expect(f.writer.writeInTransaction).toHaveBeenCalledWith(
      f.tx,
      expect.anything(),
      'pinned-model',
      2,
      { id: 'new-manifest', index: 0 },
    );
  });
  it('rejects a changed immutable chunk snapshot without creating jobs', async () => {
    const f = fixture();
    await expect(
      f.service.stage({
        ...f.input,
        chunks: [{ content: 'changed', metadata: {} }],
      }),
    ).rejects.toThrow('conflicts');
    expect(f.writer.writeInTransaction).not.toHaveBeenCalled();
    expect(f.queue.enqueue).not.toHaveBeenCalled();
  });
  it('keeps Knowledge processing queued when even one vector has an older generation', async () => {
    const f = fixture();
    f.entry.embeddingStoredGeneration = 0;
    await expect(f.service.complete('org', 'source', 'version')).resolves.toBe(
      'queued',
    );
    expect(f.tx.knowledgeSourceVersion.updateMany).not.toHaveBeenCalled();
    expect(f.tx.knowledgeCaptureRequest.updateMany).not.toHaveBeenCalled();
  });
  it('rejects manual READY before a new version has any sealed manifest', async () => {
    const f = fixture();
    f.tx.knowledgeEmbeddingManifest.findFirst.mockResolvedValue(null);
    await expect(
      f.service.assertReady(
        f.tx as unknown as Prisma.TransactionClient,
        f.version,
      ),
    ).rejects.toThrow('incomplete');
  });
  it('preserves legacy generation zero readiness semantics', async () => {
    const f = fixture();
    f.version.embeddingGeneration = 0;
    await expect(
      f.service.assertReady(
        f.tx as unknown as Prisma.TransactionClient,
        f.version,
      ),
    ).resolves.toBeUndefined();
    expect(f.tx.knowledgeEmbeddingManifest.findFirst).not.toHaveBeenCalled();
  });
  it('atomically marks complete only after the exact finite-vector ledger barrier and persists sealed validators', async () => {
    const f = fixture();
    await expect(f.service.complete('org', 'source', 'version')).resolves.toBe(
      'completed',
    );
    expect(f.tx.knowledgeSourceVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          isCurrent: true,
          processingState: 'READY',
          processingError: null,
        },
      }),
    );
    expect(f.tx.knowledgeSource.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ etag: 'observed-etag' }),
      }),
    );
    expect(f.tx.knowledgeCaptureRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'completed' } }),
    );
    expect(f.tx.knowledgeEmbeddingManifest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { finalizedAt: expect.any(Date) } }),
    );
  });
  it('completes an empty sealed chunk set without provider work', async () => {
    const f = fixture();
    f.manifest.expectedChunkCount = 0;
    f.manifest.orderedChunksHash = f.service.orderedHash(
      'source',
      'version',
      'pinned-model',
      [],
    );
    f.tx.contextEntry.findMany.mockResolvedValue([]);
    f.tx.$queryRaw.mockImplementation(async (query: Prisma.Sql) =>
      query.sql.includes('LIMIT 201 FOR UPDATE')
        ? []
        : query.sql.includes('AS "valid"')
          ? [{ valid: true }]
          : query.sql.includes('COUNT(*)')
            ? [{ count: 0 }]
            : [],
    );
    await expect(f.service.complete('org', 'source', 'version')).resolves.toBe(
      'completed',
    );
    expect(f.provider.stored).not.toHaveBeenCalled();
  });
  it('defers invisible source completion without promoting or settling capture', async () => {
    const f = fixture();
    f.source.isVisible = false;
    await expect(f.service.complete('org', 'source', 'version')).resolves.toBe(
      'queued',
    );
    expect(f.tx.knowledgeSourceVersion.updateMany).not.toHaveBeenCalled();
    expect(f.tx.knowledgeCaptureRequest.updateMany).not.toHaveBeenCalled();
  });
  it('marks failed chunks failed while preserving the prior current refresh version', async () => {
    const f = fixture();
    f.version.isCurrent = false;
    f.tx.contextEmbeddingJob.findFirst.mockResolvedValue({ status: 'FAILED' });
    await expect(f.service.complete('org', 'source', 'version')).resolves.toBe(
      'failed',
    );
    expect(f.tx.knowledgeSourceVersion.updateMany).toHaveBeenCalledTimes(1);
    expect(f.tx.knowledgeSourceVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          processingState: 'FAILED',
          processingError: 'Knowledge indexing failed',
        },
      }),
    );
    expect(f.tx.contextEntry.updateMany).not.toHaveBeenCalled();
  });
  it('allows a reopened manual candidate to queue only through its live predecessor fence', async () => {
    const f = fixture();
    f.version.isCurrent = false;
    f.version.processingState = 'FAILED';
    await expect(
      f.service.processingUpdate(
        f.tx as never,
        f.version,
        KnowledgeProcessingState.QUEUED,
      ),
    ).resolves.toEqual({
      processingState: 'QUEUED',
      processingError: null,
    });
    expect(f.tx.knowledgeSourceRefreshRun.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tickKey: 'manual-version:version',
        candidateVersionId: 'version',
        status: { in: ['QUEUED', 'PROCESSING'] },
      }),
    });
    expect(f.tx.knowledgeSourceVersion.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'previous', isCurrent: true }),
    });
  });

  it.each(['missing-run', 'expired', 'retired', 'ready-bypass'])(
    'rejects %s manual processing without a valid promotion fence',
    async (condition) => {
      const f = fixture();
      f.version.isCurrent = false;
      f.version.processingState = 'FAILED';
      if (condition === 'missing-run')
        f.tx.knowledgeSourceRefreshRun.findFirst.mockResolvedValue(null);
      if (condition === 'expired')
        f.tx.$queryRaw.mockResolvedValue([{ valid: false }]);
      if (condition === 'retired') f.version.retentionState = 'PAYLOAD_PURGED';
      await expect(
        f.service.processingUpdate(
          f.tx as never,
          f.version,
          condition === 'ready-bypass'
            ? KnowledgeProcessingState.READY
            : KnowledgeProcessingState.QUEUED,
        ),
      ).rejects.toThrow();
      expect(f.tx.knowledgeSourceVersion.updateMany).not.toHaveBeenCalled();
    },
  );
  it('binds the validated actor and transaction only after locked canonical readiness, and settles after promotion', async () => {
    const f = fixture();
    f.version.isCurrent = false;
    await expect(f.service.complete('org', 'source', 'version')).resolves.toBe(
      'completed',
    );
    const queries = f.tx.$queryRaw.mock.calls.map(([query]) => query);
    const lockIndex = queries.findIndex((query) =>
      query.sql.includes('LIMIT 201 FOR UPDATE'),
    );
    const witnessIndex = queries.findIndex((query) =>
      query.sql.includes('jsonb_build_object'),
    );
    expect(lockIndex).toBeGreaterThan(-1);
    expect(witnessIndex).toBeGreaterThan(lockIndex);
    expect(queries[witnessIndex]?.sql).toContain('txid_current()::text');
    const actorValue = queries[witnessIndex]?.values.find(
      (value: unknown) => typeof value === 'string' && value.startsWith('{'),
    );
    if (typeof actorValue !== 'string')
      throw new Error('Missing actual actor witness binding');
    expect(JSON.parse(actorValue)).toEqual(f.actor);
    expect(f.writer.assertActor).toHaveBeenCalledTimes(2);
    expect(
      f.tx.$queryRaw.mock.invocationCallOrder[witnessIndex],
    ).toBeGreaterThan(
      f.writer.assertActor.mock.invocationCallOrder[1] ?? Infinity,
    );
    const promotionOrder =
      f.tx.knowledgeSourceVersion.updateMany.mock.invocationCallOrder[1];
    expect(promotionOrder).toBeGreaterThan(
      f.tx.$queryRaw.mock.invocationCallOrder[witnessIndex] ?? Infinity,
    );
    expect(
      f.tx.knowledgeSourceRefreshRun.updateMany.mock.invocationCallOrder[0],
    ).toBeGreaterThan(promotionOrder ?? Infinity);
    expect(
      f.tx.knowledgeEmbeddingManifest.updateMany.mock.invocationCallOrder[0],
    ).toBeGreaterThan(
      f.tx.knowledgeSourceRefreshRun.updateMany.mock.invocationCallOrder[0] ??
        Infinity,
    );
    expect(
      queries.some((query) =>
        query.sql.includes(
          "set_config('genfeed.knowledge_candidate_promotion', '', true)",
        ),
      ),
    ).toBe(true);
  });

  it('clears the transaction retirement receipt only after successful promotion', async () => {
    const f = fixture();
    f.version.isCurrent = false;
    await f.service.complete('org', 'source', 'version');
    expect(
      f.tx.$queryRaw.mock.calls.some(([query]) =>
        query.sql.includes(
          "set_config('genfeed.knowledge_predecessor_retirement', '', true)",
        ),
      ),
    ).toBe(true);
  });

  it.each(['candidate', 'settlement'])(
    'rolls back when the expected single %s mutation is lost',
    async (kind) => {
      const f = fixture();
      f.version.isCurrent = false;
      if (kind === 'candidate')
        f.tx.knowledgeSourceVersion.updateMany
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 });
      else
        f.tx.knowledgeSourceRefreshRun.updateMany.mockResolvedValue({
          count: 0,
        });
      await expect(
        f.service.complete('org', 'source', 'version'),
      ).rejects.toThrow('changed');
      expect(f.tx.knowledgeEmbeddingManifest.updateMany).not.toHaveBeenCalled();
      if (kind === 'candidate') {
        expect(
          f.tx.knowledgeSourceRefreshRun.updateMany,
        ).not.toHaveBeenCalled();
        expect(
          f.tx.$queryRaw.mock.calls.some(([query]) =>
            query.sql.includes("knowledge_predecessor_retirement', '', true"),
          ),
        ).toBe(false);
      }
    },
  );

  it('rechecks live actor authority after readiness and before creating a witness', async () => {
    const f = fixture();
    f.version.isCurrent = false;
    f.writer.assertActor
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('revoked before promotion'));
    await expect(
      f.service.complete('org', 'source', 'version'),
    ).rejects.toThrow('revoked');
    expect(f.tx.knowledgeSourceVersion.updateMany).not.toHaveBeenCalled();
    expect(
      f.tx.$queryRaw.mock.calls.some(([query]) =>
        query.sql.includes('jsonb_build_object'),
      ),
    ).toBe(false);
  });

  it('does not ignore extra live candidate rows outside the sealed manifest', async () => {
    const f = fixture();
    f.version.isCurrent = false;
    const original = f.tx.$queryRaw.getMockImplementation();
    f.tx.$queryRaw.mockImplementation(async (query: Prisma.Sql) =>
      query.sql.includes('LIMIT 201 FOR UPDATE')
        ? [{ id: 'entry' }, { id: 'stray' }]
        : (original?.(query) ?? []),
    );
    await expect(f.service.complete('org', 'source', 'version')).resolves.toBe(
      'queued',
    );
    expect(f.tx.contextEntry.findMany).not.toHaveBeenCalled();
    expect(f.tx.knowledgeSourceVersion.updateMany).not.toHaveBeenCalled();
  });
});
