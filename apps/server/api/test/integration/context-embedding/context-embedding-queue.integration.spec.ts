import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { buildMemorySourceSnapshotHashQuery } from '@api/collections/contexts/utils/context-embedding-claim-query.util';
import {
  ContextEmbeddingRuntime,
  type EmbeddingWorld,
  FIXTURE_VECTOR,
  TEST_MODEL,
  waitFor,
} from '@api-test/integration/context-embedding/context-embedding-runtime.fixture';
import { Prisma } from '@genfeedai/prisma';
import { ContextEmbeddingProcessor } from '@workers/processors/api/queues/context-embedding/context-embedding.processor';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.setConfig({ testTimeout: 180000, hookTimeout: 600000 });

let runtime: ContextEmbeddingRuntime;
const measurements: Array<Record<string, number | string>> = [];
function calls(input: string) {
  return runtime.transport.calls.filter((call) => call.input === input).length;
}
async function makeEntry(world: EmbeddingWorld, content: string) {
  return runtime.writer.write({
    organizationId: world.organizationId,
    contextBaseId: world.baseId,
    dto: { content },
    principal: { origin: 'ACTOR', actor: world.actor },
  });
}
async function vector(entryId: string, organizationId: string) {
  const rows = await runtime.db.$queryRawUnsafe<
    Array<{ embedding: string | null; generation: number; stored: number }>
  >(
    'SELECT "embedding"::text AS embedding, "embeddingGeneration" AS generation, "embeddingStoredGeneration" AS stored FROM "context_entries" WHERE "id"=$1 AND "organizationId"=$2',
    entryId,
    organizationId,
  );
  return rows[0];
}
async function due(jobId: string, organizationId: string) {
  await runtime.db.$executeRawUnsafe(
    `UPDATE "context_embedding_jobs" SET "nextAttemptAt"=clock_timestamp()-INTERVAL '1 second' WHERE "id"=$1 AND "organizationId"=$2 AND "isDeleted"=false AND "status"='RETRYABLE'`,
    jobId,
    organizationId,
  );
}
async function expireLease(jobId: string, organizationId: string) {
  await runtime.db.$executeRawUnsafe(
    `UPDATE "context_embedding_jobs" SET "leaseExpiresAt"=clock_timestamp()-INTERVAL '1 second' WHERE "id"=$1 AND "organizationId"=$2 AND "isDeleted"=false AND "status"='PROCESSING'`,
    jobId,
    organizationId,
  );
}
async function knowledge(
  world: EmbeddingWorld,
  chunks: string[],
  executionId = randomUUID(),
) {
  const source = await runtime.db.knowledgeSource.create({
    data: {
      organizationId: world.organizationId,
      userId: world.ownerId,
      brandId: world.brandId,
      scope: 'brand',
      title: 'Synthetic cited source',
      kind: 'TEXT',
      purpose: 'BRAND_TRUTH',
    },
  });
  const version = await runtime.db.knowledgeSourceVersion.create({
    data: {
      organizationId: world.organizationId,
      sourceId: source.id,
      version: 1,
      contentHash:
        'sha256:' + createHash('sha256').update(chunks.join(' ')).digest('hex'),
      observedAt: new Date(),
      payload: { text: chunks.join(' ') },
      provenance: { kind: 'TEXT', fixture: 'synthetic captured content' },
    },
  });
  const base = await runtime.db.contextBase.create({
    data: {
      organizationId: world.organizationId,
      sourceBrandId: world.brandId,
      createdById: world.ownerId,
      data: {
        knowledgeScope: 'brand',
        purpose: 'knowledge-base',
        label: 'Knowledge',
        entryCount: 0,
      },
    },
  });
  const capture = await runtime.db.knowledgeCaptureRequest.create({
    data: {
      organizationId: world.organizationId,
      sourceId: source.id,
      idempotencyKey: randomUUID(),
      kind: 'TEXT',
    },
  });
  const input = {
    organizationId: world.organizationId,
    sourceId: source.id,
    versionId: version.id,
    contextBaseId: base.id,
    admissionExecutionId: executionId,
    initiatingActor: world.actor,
    observedValidators: { etag: 'sealed-fixture-etag' },
    chunks: chunks.map((content, chunkIndex) => ({
      content,
      metadata: { chunkIndex, sourceId: source.id, versionId: version.id },
    })),
  };
  const manifest = await runtime.completion.stage(input);
  return { source, version, base, capture, input, manifest };
}
async function finishKnowledge(
  world: EmbeddingWorld,
  item: Awaited<ReturnType<typeof knowledge>>,
) {
  await waitFor(
    async () =>
      (await runtime.db.contextEmbeddingJob.count({
        where: {
          organizationId: world.organizationId,
          generation: item.manifest.generation,
          isDeleted: false,
          status: { not: 'SUCCEEDED' },
          contextEntry: {
            is: {
              organizationId: world.organizationId,
              knowledgeEmbeddingManifestId: item.manifest.id,
              isDeleted: false,
            },
          },
        },
      })) === 0,
  );
  await expect(
    runtime.completion.complete(
      world.organizationId,
      item.source.id,
      item.version.id,
    ),
  ).resolves.toBe('completed');
}

describe('real context embedding database and WorkerHost acceptance', () => {
  beforeAll(async () => {
    runtime = new ContextEmbeddingRuntime();
    await runtime.open();
  });
  afterAll(async () => {
    if (!runtime) return;
    const receipt = {
      ...runtime.environment,
      startupCompleted: runtime.startupCompleted,
      queueContainment: runtime.queueContainment,
      workerContainment: runtime.workerContainment,
      ancillaryCacheMode: runtime.ancillaryCacheMode,
      ancillaryPubsubMode: runtime.ancillaryPubsubMode,
      pgvectorVersion: runtime.pgvectorVersion,
      migrationCount: runtime.migrationCount,
      migrationInventory: runtime.migrationInventory,
      providerCalls: runtime.transport.calls.length,
      maxProviderConcurrency: runtime.transport.maxActive,
      measurements,
    };
    const directory = resolve('test-results/context-embedding');
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, 'runtime-receipt.json'),
      JSON.stringify(receipt, null, 2),
    );
    const cleanup = await runtime.close();
    await writeFile(
      resolve(directory, 'cleanup-receipt.json'),
      JSON.stringify(
        {
          ...runtime.environment,
          ...cleanup,
        },
        null,
        2,
      ),
    );
    expect(runtime.unexpectedQueueErrors).toEqual([]);
  });

  it('starts real production Core and a two-slot WorkerHost with no automatic historical admission', async () => {
    expect(runtime.db.isCloudTenantGuard).toBe(true);
    expect(runtime.queueContainment.map((binding) => binding.name)).toEqual(
      expect.arrayContaining(['context-embedding', 'notification-delivery']),
    );
    expect(runtime.workerContainment).toEqual({
      host: runtime.redisUrl.hostname,
      port: Number(runtime.redisUrl.port || '6379'),
      db: 0,
      prefix: runtime.prefix,
    });
    expect(runtime.ancillaryCacheMode).toBe(
      'unavailable-transport; real cache-miss data and authorization',
    );
    expect(runtime.ancillaryPubsubMode).toBe(
      'disabled by absent base Redis URL; no pubsub parity evidence',
    );

    expect(runtime.migrationCount).toBeGreaterThan(0);
    expect(
      await runtime.db.$queryRawUnsafe('SELECT id FROM context_embedding_jobs'),
    ).toEqual([]);
    expect(
      runtime.app.get(ContextEmbeddingProcessor).worker.opts.concurrency,
    ).toBe(2);
    expect(runtime.queue.name).toBe('context-embedding');
  });

  it('commits entry and intent before Redis, then actual processor, finite vector and read-only similarity', async () => {
    const world = await runtime.world();
    const text = 'durable-entry-' + randomUUID();
    const hold = runtime.transport.hold(text);
    const entry = await makeEntry(world, text);
    await hold.received;
    const job = await runtime.intent(world, entry.id);
    expect(job).toMatchObject({
      origin: 'ACTOR',
      actorUserId: world.ownerId,
      attempts: 1,
      status: 'PROCESSING',
      dimension: 1024,
      modelIdentifier: TEST_MODEL,
      generation: 1,
    });
    expect((await vector(entry.id, world.organizationId)).embedding).toBeNull();
    const active = (await runtime.queue.getJobs(['active'])).find(
      (item) => item.data.jobId === job.id,
    );
    expect(Object.keys(active?.data ?? {}).sort()).toEqual([
      'generation',
      'jobId',
      'organizationId',
    ]);
    expect(active?.opts.attempts).toBe(1);
    const lease = await runtime.db.$queryRawUnsafe<Array<{ seconds: number }>>(
      'SELECT EXTRACT(EPOCH FROM ("leaseExpiresAt"-clock_timestamp()))::float AS seconds FROM "context_embedding_jobs" WHERE "id"=$1 AND "organizationId"=$2',
      job.id,
      world.organizationId,
    );
    expect(lease[0].seconds).toBeGreaterThan(100);
    expect(lease[0].seconds).toBeLessThanOrEqual(120);
    hold.release();
    await runtime.status(world, entry.id, 'SUCCEEDED');
    expect(await vector(entry.id, world.organizationId)).toMatchObject({
      generation: 1,
      stored: 1,
    });
    const result = await runtime.contexts.queryContext(
      { contextBaseId: world.baseId, query: 'synthetic similarity query' },
      world.organizationId,
      world.ownerId,
    );
    expect(result).toEqual([
      expect.objectContaining({ content: text, relevance: 1 }),
    ]);
    expect(calls(text)).toBe(1);
    const providerCall = runtime.transport.calls.find(
      (call) => call.input === text,
    );
    expect(providerCall).toMatchObject({
      originalPath: '/api/v1/embeddings',
      authorization: 'Bearer context-embedding-loopback-only',
      provider: { data_collection: 'deny', zdr: true },
    });
  });

  it('recovers a committed intent when its queued message is lost and the actual worker closes and restarts', async () => {
    const world = await runtime.world();
    await runtime.stopWorker();
    const text = 'lost-message-' + randomUUID();
    const entry = await makeEntry(world, text);
    const job = await runtime.intent(world, entry.id);
    await (
      await runtime.queue.getJob('context-embedding-' + job.id + '-1')
    )?.remove();
    expect(calls(text)).toBe(0);
    await runtime.restartWorker();
    await runtime.sweep.sweep();
    await runtime.status(world, entry.id, 'SUCCEEDED');
    expect(calls(text)).toBe(1);
    expect((await runtime.intent(world, entry.id)).attempts).toBe(1);
  });

  it('keeps a committed intent during an actual Redis outage and recovers after the dedicated process restarts', async () => {
    const world = await runtime.world();
    const before = (await runtime.redis.info('server')).match(
      /^run_id:(.*)$/m,
    )?.[1];
    await runtime.stopRedis();
    let entryId = '';
    try {
      const entry = await makeEntry(world, 'redis-outage-' + randomUUID());
      entryId = entry.id;
      expect(await runtime.intent(world, entry.id)).toMatchObject({
        status: 'PENDING',
        attempts: 0,
      });
      expect(
        (await vector(entry.id, world.organizationId)).embedding,
      ).toBeNull();
    } finally {
      await runtime.startRedis();
    }
    expect(
      (await runtime.redis.info('server')).match(/^run_id:(.*)$/m)?.[1],
    ).not.toBe(before);
    await runtime.sweep.sweep();
    await runtime.status(world, entryId, 'SUCCEEDED');
    expect((await runtime.intent(world, entryId)).attempts).toBe(1);
  });

  it('cancels an actual stalled HTTP request at sixty seconds and releases its worker slot', async () => {
    const world = await runtime.world();
    const text = 'sixty-second-cancellation-' + randomUUID();
    const before = runtime.transport.aborted;
    const hold = runtime.transport.hold(text);
    const start = performance.now();
    const entry = await makeEntry(world, text);
    await hold.received;
    await runtime.status(world, entry.id, 'RETRYABLE', 75000);
    expect(performance.now() - start).toBeGreaterThanOrEqual(59000);
    expect(performance.now() - start).toBeLessThan(75000);
    await waitFor(() => runtime.transport.aborted === before + 1);
    expect(await runtime.intent(world, entry.id)).toMatchObject({
      safeFailureCode: 'TIMEOUT',
      attempts: 1,
    });
    hold.release();
    await runtime.contexts.removeEntry(
      world.baseId,
      entry.id,
      world.organizationId,
    );
    const next = await makeEntry(world, 'released-slot-' + randomUUID());
    await runtime.status(world, next.id, 'SUCCEEDED');
  });

  it('rolls back a real database commit fault, retains its lease, and recovers after the actual worker restarts', async () => {
    const world = await runtime.world();
    const text = 'database-commit-fault-' + randomUUID();
    const hold = runtime.transport.hold(text);
    const entry = await makeEntry(world, text);
    await hold.received;
    const job = await runtime.intent(world, entry.id);
    await runtime.db.$executeRawUnsafe(
      'CREATE TABLE context_embedding_fixture_faults (entry_id text PRIMARY KEY)',
    );
    await runtime.db.$executeRawUnsafe(
      `CREATE FUNCTION context_embedding_fixture_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN IF NEW.embedding IS NOT NULL AND EXISTS (SELECT 1 FROM context_embedding_fixture_faults WHERE entry_id=NEW.id) THEN RAISE EXCEPTION 'synthetic disposable commit fault'; END IF; RETURN NEW; END $fault$`,
    );
    await runtime.db.$executeRawUnsafe(
      'CREATE TRIGGER context_embedding_fixture_commit_fault BEFORE UPDATE ON context_entries FOR EACH ROW EXECUTE FUNCTION context_embedding_fixture_fail_commit()',
    );
    try {
      await runtime.db.$executeRawUnsafe(
        'INSERT INTO context_embedding_fixture_faults(entry_id) VALUES ($1)',
        entry.id,
      );
      hold.release();
      await waitFor(
        async () =>
          !(await runtime.queue.getJob('context-embedding-' + job.id + '-1')),
      );
      expect(await runtime.intent(world, entry.id)).toMatchObject({
        status: 'PROCESSING',
        attempts: 1,
        leaseToken: job.leaseToken,
      });
      expect(
        (await vector(entry.id, world.organizationId)).embedding,
      ).toBeNull();
    } finally {
      await runtime.db.$executeRawUnsafe(
        'DROP TRIGGER context_embedding_fixture_commit_fault ON context_entries',
      );
      await runtime.db.$executeRawUnsafe(
        'DROP FUNCTION context_embedding_fixture_fail_commit()',
      );
      await runtime.db.$executeRawUnsafe(
        'DROP TABLE context_embedding_fixture_faults',
      );
    }
    await expireLease(job.id, world.organizationId);
    await runtime.restartWorker();
    await runtime.sweep.sweep();
    await runtime.status(world, entry.id, 'SUCCEEDED');
    expect((await runtime.intent(world, entry.id)).attempts).toBe(2);
    expect(calls(text)).toBe(2);
  });

  it.each([400, 401, 403])(
    'fails provider %s without hidden retries or a vector',
    async (status) => {
      const world = await runtime.world();
      const text = 'provider-terminal-' + randomUUID();
      runtime.transport.behaviors.set(text, { status });
      const entry = await makeEntry(world, text);
      await runtime.status(world, entry.id, 'FAILED');
      expect((await runtime.intent(world, entry.id)).attempts).toBe(1);
      expect(
        (await vector(entry.id, world.organizationId)).embedding,
      ).toBeNull();
      expect(calls(text)).toBe(1);
    },
  );

  it.each(['dimension', 'nonfinite'])(
    'rejects an invalid %s vector from real HTTP transport',
    async (kind) => {
      const world = await runtime.world();
      const text = 'invalid-vector-' + randomUUID();
      const invalid = kind === 'dimension' ? [1, 2] : [...FIXTURE_VECTOR];
      if (kind === 'nonfinite') invalid[3] = NaN;
      runtime.transport.behaviors.set(text, { vector: invalid });
      const entry = await makeEntry(world, text);
      await runtime.status(world, entry.id, 'FAILED');
      expect(await runtime.intent(world, entry.id)).toMatchObject({
        attempts: 1,
        safeFailureCode: 'INVALID_VECTOR',
      });
      expect(
        (await vector(entry.id, world.organizationId)).embedding,
      ).toBeNull();
    },
  );

  it('bounds retry backoff and fails an expired third lease without a fourth provider call', async () => {
    const world = await runtime.world();
    const text = 'retry-cap-' + randomUUID();
    runtime.transport.behaviors.set(text, { status: 503 });
    const entry = await makeEntry(world, text);
    await runtime.status(world, entry.id, 'RETRYABLE');
    let job = await runtime.intent(world, entry.id);
    expect(job.attempts).toBe(1);
    let remaining = await runtime.db.$queryRawUnsafe<
      Array<{ seconds: number }>
    >(
      'SELECT EXTRACT(EPOCH FROM ("nextAttemptAt"-clock_timestamp()))::float AS seconds FROM "context_embedding_jobs" WHERE "id"=$1 AND "organizationId"=$2',
      job.id,
      world.organizationId,
    );
    expect(remaining[0].seconds).toBeGreaterThan(0);
    expect(remaining[0].seconds).toBeLessThanOrEqual(30);
    await due(job.id, world.organizationId);
    await runtime.sweep.sweep();
    await waitFor(async () => {
      job = await runtime.intent(world, entry.id);
      return job.status === 'RETRYABLE' && job.attempts === 2;
    });
    remaining = await runtime.db.$queryRawUnsafe<Array<{ seconds: number }>>(
      'SELECT EXTRACT(EPOCH FROM ("nextAttemptAt"-clock_timestamp()))::float AS seconds FROM "context_embedding_jobs" WHERE "id"=$1 AND "organizationId"=$2',
      job.id,
      world.organizationId,
    );
    expect(remaining[0].seconds).toBeGreaterThan(30);
    expect(remaining[0].seconds).toBeLessThanOrEqual(120);
    runtime.transport.behaviors.delete(text);
    const hold = runtime.transport.hold(text);
    await due(job.id, world.organizationId);
    await runtime.sweep.sweep();
    await hold.received;
    expect((await runtime.intent(world, entry.id)).attempts).toBe(3);
    await expireLease(job.id, world.organizationId);
    await runtime.execution.process({
      jobId: job.id,
      organizationId: world.organizationId,
      generation: 1,
    });
    await runtime.status(world, entry.id, 'FAILED');
    hold.release();
    await waitFor(
      async () =>
        !(await runtime.queue.getJob('context-embedding-' + job.id + '-1')),
    );
    expect(calls(text)).toBe(3);
    expect((await vector(entry.id, world.organizationId)).embedding).toBeNull();
  });

  it('fences a stale result after a competing actual database lease wins', async () => {
    const world = await runtime.world();
    const text = 'fenced-result-' + randomUUID();
    const first = runtime.transport.hold(text);
    const entry = await makeEntry(world, text);
    await first.received;
    const job = await runtime.intent(world, entry.id);
    const firstToken = job.leaseToken;
    await expireLease(job.id, world.organizationId);
    const second = runtime.transport.hold(text);
    const winning = runtime.execution.process({
      jobId: job.id,
      organizationId: world.organizationId,
      generation: 1,
    });
    await second.received;
    expect((await runtime.intent(world, entry.id)).leaseToken).not.toBe(
      firstToken,
    );
    first.release();
    await waitFor(
      async () =>
        !(await runtime.queue.getJob('context-embedding-' + job.id + '-1')),
    );
    expect((await vector(entry.id, world.organizationId)).embedding).toBeNull();
    expect((await runtime.intent(world, entry.id)).status).toBe('PROCESSING');
    const winnerVector = Array.from({ length: 1024 }, (_, i) =>
      i === 1 ? 1 : 0,
    );
    runtime.transport.behaviors.set(text, { vector: winnerVector });
    second.release();
    await winning;
    expect((await vector(entry.id, world.organizationId)).embedding).toBe(
      '[' + winnerVector.join(',') + ']',
    );
    expect(await runtime.intent(world, entry.id)).toMatchObject({
      attempts: 2,
      status: 'SUCCEEDED',
    });
  });

  it('cannot resurrect a deleted entry after the provider returns', async () => {
    const world = await runtime.world();
    const text = 'delete-during-provider-' + randomUUID();
    const hold = runtime.transport.hold(text);
    const entry = await makeEntry(world, text);
    await hold.received;
    const job = await runtime.intent(world, entry.id);
    await runtime.contexts.removeEntry(
      world.baseId,
      entry.id,
      world.organizationId,
    );
    hold.release();
    await waitFor(
      async () =>
        !(await runtime.queue.getJob('context-embedding-' + job.id + '-1')),
    );
    expect(await runtime.intent(world, entry.id)).toMatchObject({
      status: 'CANCELLED',
      attempts: 1,
    });
    expect(await vector(entry.id, world.organizationId)).toMatchObject({
      embedding: null,
      generation: 2,
    });
  });

  it('rechecks current API key authority after provider work', async () => {
    const world = await runtime.world();
    const text = 'revoke-key-' + randomUUID();
    const key = await runtime.db.apiKey.create({
      data: {
        organizationId: world.organizationId,
        userId: world.ownerId,
        key: randomUUID(),
        label: 'Synthetic acceptance key',
        scopes: ['memory:write'],
      },
    });
    const hold = runtime.transport.hold(text);
    const entry = await runtime.writer.write({
      organizationId: world.organizationId,
      contextBaseId: world.baseId,
      dto: { content: text },
      principal: {
        origin: 'ACTOR',
        actor: {
          ...world.actor,
          isApiKey: true,
          apiKeyId: key.id,
          scopes: ['memory:write'],
        },
      },
    });
    await hold.received;
    await runtime.db.apiKey.updateMany({
      where: { id: key.id, organizationId: world.organizationId },
      data: { isRevoked: true },
    });
    hold.release();
    await runtime.status(world, entry.id, 'CANCELLED');
    expect((await vector(entry.id, world.organizationId)).embedding).toBeNull();
  });

  it('does not mark Knowledge READY or settle capture before every sealed vector and then returns real citations', async () => {
    const world = await runtime.world();
    const first = 'manifest-first-' + randomUUID();
    const second = 'manifest-second-' + randomUUID();
    const hold = runtime.transport.hold(first);
    const item = await knowledge(world, [first, second]);
    await hold.received;
    await expect(
      runtime.completion.complete(
        world.organizationId,
        item.source.id,
        item.version.id,
      ),
    ).resolves.toBe('queued');
    expect(
      (
        await runtime.db.knowledgeSourceVersion.findFirstOrThrow({
          where: {
            id: item.version.id,
            organizationId: world.organizationId,
            isDeleted: false,
          },
        })
      ).processingState,
    ).toBe('PROCESSING');
    expect(
      (
        await runtime.db.knowledgeCaptureRequest.findFirstOrThrow({
          where: {
            id: item.capture.id,
            organizationId: world.organizationId,
            isDeleted: false,
          },
        })
      ).status,
    ).toBe('queued');
    const replay = await runtime.completion.stage({
      ...item.input,
      admissionExecutionId: randomUUID(),
    });
    expect(replay.id).toBe(item.manifest.id);
    await expect(
      runtime.completion.stage({
        ...item.input,
        chunks: [{ content: 'different immutable snapshot', metadata: {} }],
      }),
    ).rejects.toThrow('conflicts');
    hold.release();
    await finishKnowledge(world, item);
    expect(
      (
        await runtime.db.knowledgeCaptureRequest.findFirstOrThrow({
          where: {
            id: item.capture.id,
            organizationId: world.organizationId,
            isDeleted: false,
          },
        })
      ).status,
    ).toBe('completed');
    const before = runtime.transport.calls.length;
    const hits = await runtime.retrieval.retrieveSelectedBrandContentMemory(
      {
        organizationId: world.organizationId,
        brandId: world.brandId,
        userId: world.ownerId,
        query: 'synthetic cited query',
      },
      [item.source.id],
    );
    expect(hits).toHaveLength(2);
    expect(
      hits.every(
        (hit) =>
          hit.citation?.sourceId === item.source.id &&
          hit.citation.versionId === item.version.id,
      ),
    ).toBe(true);
    expect(runtime.transport.calls.length - before).toBe(1);
    expect(
      await runtime.db.contextEmbeddingJob.count({
        where: { organizationId: world.organizationId, isDeleted: false },
      }),
    ).toBe(2);
  });

  it('preserves failed execution history and admits one new generation only for a distinct explicit retry', async () => {
    const world = await runtime.world();
    const text = 'explicit-retry-' + randomUUID();
    runtime.transport.behaviors.set(text, { status: 400 });
    const item = await knowledge(world, [text]);
    await waitFor(
      async () =>
        (await runtime.db.contextEmbeddingJob.count({
          where: {
            organizationId: world.organizationId,
            status: 'FAILED',
            isDeleted: false,
          },
        })) === 1,
    );
    await expect(
      runtime.completion.complete(
        world.organizationId,
        item.source.id,
        item.version.id,
      ),
    ).resolves.toBe('failed');
    expect((await runtime.completion.stage(item.input)).id).toBe(
      item.manifest.id,
    );
    expect(calls(text)).toBe(1);
    runtime.transport.behaviors.delete(text);
    const retry = await runtime.completion.stage({
      ...item.input,
      admissionExecutionId: randomUUID(),
    });
    expect(retry.generation).toBe(2);
    await finishKnowledge(world, { ...item, manifest: retry });
    const history = await runtime.db.contextEmbeddingJob.findMany({
      where: { organizationId: world.organizationId, isDeleted: false },
      orderBy: { generation: 'asc' },
    });
    expect(
      history.map((job) => [job.generation, job.attempts, job.status]),
    ).toEqual([
      [1, 1, 'FAILED'],
      [2, 1, 'SUCCEEDED'],
    ]);
    expect(calls(text)).toBe(2);
  });

  it('keeps the predecessor searchable until a fully embedded refresh swaps atomically, and preserves it after candidate failure', async () => {
    const world = await runtime.world();
    const initial = await knowledge(world, [
      'refresh predecessor ' + randomUUID(),
    ]);
    await finishKnowledge(world, initial);
    await runtime.db.knowledgeSource.updateMany({
      where: {
        id: initial.source.id,
        organizationId: world.organizationId,
        isDeleted: false,
      },
      data: { isRefreshEnabled: true, refreshIntervalMinutes: 60 },
    });
    const text = 'refresh replacement ' + randomUUID();
    const candidate = await runtime.db.knowledgeSourceVersion.create({
      data: {
        sourceId: initial.source.id,
        organizationId: world.organizationId,
        version: 2,
        isCurrent: false,
        contentHash:
          'sha256:' + createHash('sha256').update(text).digest('hex'),
        payload: { text },
        provenance: { kind: 'TEXT', fixture: 'synthetic refresh replacement' },
        observedAt: new Date(),
      },
    });
    const run = await runtime.db.knowledgeSourceRefreshRun.create({
      data: {
        organizationId: world.organizationId,
        sourceId: initial.source.id,
        tickKey: randomUUID(),
        candidateVersionId: candidate.id,
        expectedCurrentVersionId: initial.version.id,
        status: 'PROCESSING',
      },
    });
    const hold = runtime.transport.hold(text);
    const input = {
      ...initial.input,
      versionId: candidate.id,
      admissionExecutionId: randomUUID(),
      chunks: [
        {
          content: text,
          metadata: {
            sourceId: initial.source.id,
            versionId: candidate.id,
            chunkIndex: 0,
          },
        },
      ],
    };
    const manifest = await runtime.completion.stage(input);
    await hold.received;
    expect(
      await runtime.completion.complete(
        world.organizationId,
        initial.source.id,
        candidate.id,
      ),
    ).toBe('queued');
    let versions = await runtime.db.knowledgeSourceVersion.findMany({
      where: {
        organizationId: world.organizationId,
        sourceId: initial.source.id,
        isDeleted: false,
      },
      orderBy: { version: 'asc' },
    });
    expect(
      versions.map((v) => [v.isCurrent, v.processingState, v.retrievalState]),
    ).toEqual([
      [true, 'READY', 'ACTIVE'],
      [false, 'PROCESSING', 'ACTIVE'],
    ]);
    let hits = await runtime.retrieval.retrieveSelectedBrandContentMemory(
      {
        organizationId: world.organizationId,
        brandId: world.brandId,
        userId: world.ownerId,
        query: 'before refresh swap',
      },
      [initial.source.id],
    );
    expect(hits.map((hit) => hit.citation?.versionId)).toEqual([
      initial.version.id,
    ]);
    hold.release();
    await finishKnowledge(world, {
      ...initial,
      version: candidate,
      input,
      manifest,
    });
    versions = await runtime.db.knowledgeSourceVersion.findMany({
      where: {
        organizationId: world.organizationId,
        sourceId: initial.source.id,
        isDeleted: false,
      },
      orderBy: { version: 'asc' },
    });
    expect(
      versions.map((v) => [v.isCurrent, v.processingState, v.retrievalState]),
    ).toEqual([
      [false, 'READY', 'SUPERSEDED'],
      [true, 'READY', 'ACTIVE'],
    ]);
    expect(
      await runtime.db.knowledgeSourceRefreshRun.findFirst({
        where: {
          id: run.id,
          organizationId: world.organizationId,
          isDeleted: false,
        },
      }),
    ).toMatchObject({ status: 'COMPLETED', outcome: 'CHANGED' });
    hits = await runtime.retrieval.retrieveSelectedBrandContentMemory(
      {
        organizationId: world.organizationId,
        brandId: world.brandId,
        userId: world.ownerId,
        query: 'after refresh swap',
      },
      [initial.source.id],
    );
    expect(hits.map((hit) => hit.citation?.versionId)).toEqual([candidate.id]);
    const bad = 'failed refresh ' + randomUUID();
    const failed = await runtime.db.knowledgeSourceVersion.create({
      data: {
        sourceId: initial.source.id,
        organizationId: world.organizationId,
        version: 3,
        isCurrent: false,
        contentHash: 'sha256:' + createHash('sha256').update(bad).digest('hex'),
        payload: { text: bad },
        provenance: { kind: 'TEXT', fixture: 'synthetic failed replacement' },
        observedAt: new Date(),
      },
    });
    const failedRun = await runtime.db.knowledgeSourceRefreshRun.create({
      data: {
        organizationId: world.organizationId,
        sourceId: initial.source.id,
        tickKey: randomUUID(),
        candidateVersionId: failed.id,
        expectedCurrentVersionId: candidate.id,
        status: 'PROCESSING',
      },
    });
    runtime.transport.behaviors.set(bad, { status: 400 });
    await runtime.completion.stage({
      ...input,
      versionId: failed.id,
      admissionExecutionId: randomUUID(),
      chunks: [
        {
          content: bad,
          metadata: {
            sourceId: initial.source.id,
            versionId: failed.id,
            chunkIndex: 0,
          },
        },
      ],
    });
    await waitFor(
      async () =>
        (await runtime.db.contextEmbeddingJob.count({
          where: {
            organizationId: world.organizationId,
            isDeleted: false,
            status: 'FAILED',
          },
        })) === 1,
    );
    expect(
      await runtime.completion.complete(
        world.organizationId,
        initial.source.id,
        failed.id,
      ),
    ).toBe('failed');
    expect(
      await runtime.db.knowledgeSourceVersion.findFirst({
        where: {
          id: candidate.id,
          organizationId: world.organizationId,
          isDeleted: false,
        },
      }),
    ).toMatchObject({
      isCurrent: true,
      processingState: 'READY',
      retrievalState: 'ACTIVE',
    });
    const settled = await runtime.db.knowledgeSourceRefreshRun.findFirstOrThrow(
      {
        where: {
          id: failedRun.id,
          organizationId: world.organizationId,
          isDeleted: false,
        },
      },
    );
    expect(settled.status).toBe('FAILED');
    expect(settled.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());
    expect(
      await runtime.db.knowledgeSource.findFirst({
        where: {
          id: initial.source.id,
          organizationId: world.organizationId,
          isDeleted: false,
        },
      }),
    ).toMatchObject({ consecutiveFailures: 1, syncState: 'FAILED' });
  });

  it.each(['deleted', 'purged', 'expired', 'private'])(
    'fences a Knowledge source made %s during provider work',
    async (kind) => {
      const world = await runtime.world();
      const text = 'source-fence-' + kind + '-' + randomUUID();
      const hold = runtime.transport.hold(text);
      const item = await knowledge(world, [text]);
      await hold.received;
      if (kind === 'deleted')
        await runtime.db.knowledgeSource.updateMany({
          where: {
            id: item.source.id,
            organizationId: world.organizationId,
            isDeleted: false,
          },
          data: { isDeleted: true },
        });
      if (kind === 'purged')
        await runtime.db.knowledgeSourceVersion.updateMany({
          where: {
            id: item.version.id,
            organizationId: world.organizationId,
            isDeleted: false,
          },
          data: {
            retentionState: 'PAYLOAD_PURGED',
            purgedAt: new Date(),
            payload: Prisma.DbNull,
            provenance: Prisma.DbNull,
          },
        });
      if (kind === 'expired')
        await runtime.db.knowledgeSourceVersion.updateMany({
          where: {
            id: item.version.id,
            organizationId: world.organizationId,
            isDeleted: false,
          },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
      if (kind === 'private')
        await runtime.db.knowledgeSource.updateMany({
          where: {
            id: item.source.id,
            organizationId: world.organizationId,
            isDeleted: false,
          },
          data: { scope: 'personal', userId: world.otherUserId, brandId: null },
        });
      hold.release();
      await waitFor(
        async () =>
          (await runtime.db.contextEmbeddingJob.count({
            where: {
              organizationId: world.organizationId,
              isDeleted: false,
              status: 'CANCELLED',
            },
          })) === 1,
      );
      const entries = await runtime.db.contextEntry.findMany({
        where: {
          organizationId: world.organizationId,
          isDeleted: false,
          knowledgeSourceVersionId: item.version.id,
        },
      });
      expect(entries).toHaveLength(1);
      expect(
        (await vector(entries[0].id, world.organizationId)).embedding,
      ).toBeNull();
      expect(
        await runtime.retrieval.retrieveSelectedBrandContentMemory(
          {
            organizationId: world.organizationId,
            brandId: world.brandId,
            userId: world.ownerId,
            query: 'revoked source query',
          },
          [item.source.id],
        ),
      ).toEqual([]);
    },
  );

  it('admits bounded history only on an explicit current OWNER request and never duplicates a concurrent intent', async () => {
    const world = await runtime.world();
    await runtime.stopWorker();
    const entries = [];
    for (let i = 0; i < 3; i++)
      entries.push(
        await runtime.db.contextEntry.create({
          data: {
            contextBaseId: world.baseId,
            organizationId: world.organizationId,
            data: { content: 'legacy bounded ' + i },
          },
        }),
      );
    expect(
      await runtime.db.contextEmbeddingJob.count({
        where: { organizationId: world.organizationId, isDeleted: false },
      }),
    ).toBe(0);
    const first = await runtime.writer.backfill(
      world.baseId,
      world.organizationId,
      world.actor,
      { maxEntries: 2 },
    );
    expect(first.admission).toMatchObject({
      admitted: 2,
      skipped: 0,
    });
    expect(first.admission.nextCursor).toEqual(expect.any(String));
    await runtime.writer.backfill(
      world.baseId,
      world.organizationId,
      world.actor,
      { maxEntries: 2 },
    );
    expect(
      await runtime.db.contextEmbeddingJob.count({
        where: { organizationId: world.organizationId, isDeleted: false },
      }),
    ).toBeLessThanOrEqual(3);
    await expect(
      runtime.writer.backfill(world.baseId, world.organizationId, world.actor, {
        maxEntries: 201,
      }),
    ).rejects.toThrow();
    const foreign = await runtime.world();
    await expect(
      runtime.writer.backfill(
        world.baseId,
        foreign.organizationId,
        foreign.actor,
        { maxEntries: 1 },
      ),
    ).rejects.toThrow();
    await runtime.db.member.updateMany({
      where: {
        id: world.memberId,
        organizationId: world.organizationId,
        isDeleted: false,
      },
      data: { isActive: false },
    });
    await expect(
      runtime.writer.backfill(world.baseId, world.organizationId, world.actor, {
        maxEntries: 1,
      }),
    ).rejects.toThrow();
    await runtime.restartWorker();
    await runtime.sweep.sweep();
    await waitFor(
      async () =>
        (await runtime.db.contextEmbeddingJob.count({
          where: {
            organizationId: world.organizationId,
            isDeleted: false,
            status: 'CANCELLED',
          },
        })) > 0,
    );
    expect(entries).toHaveLength(3);
  });

  it('completes an empty sealed manifest without a provider request', async () => {
    const world = await runtime.world();
    const before = runtime.transport.calls.length;
    const item = await knowledge(world, []);
    await finishKnowledge(world, item);
    expect(runtime.transport.calls.length).toBe(before);
  });

  it('defers invisible admitted work without consuming an attempt and recovers visibility through bounded maintenance', async () => {
    const world = await runtime.world();
    await runtime.stopWorker();
    const text = 'invisible-intent-' + randomUUID();
    const item = await knowledge(world, [text]);
    await runtime.db.knowledgeSource.updateMany({
      where: {
        id: item.source.id,
        organizationId: world.organizationId,
        isDeleted: false,
      },
      data: { isVisible: false },
    });
    await runtime.restartWorker();
    await waitFor(
      async () =>
        (await runtime.db.contextEmbeddingJob.count({
          where: {
            organizationId: world.organizationId,
            isDeleted: false,
            attempts: 0,
            status: 'RETRYABLE',
          },
        })) === 1,
    );
    expect(calls(text)).toBe(0);
    await runtime.db.knowledgeSource.updateMany({
      where: {
        id: item.source.id,
        organizationId: world.organizationId,
        isDeleted: false,
      },
      data: { isVisible: true },
    });
    const job = await runtime.db.contextEmbeddingJob.findFirstOrThrow({
      where: { organizationId: world.organizationId, isDeleted: false },
    });
    await due(job.id, world.organizationId);
    await runtime.sweep.sweep();
    await finishKnowledge(world, item);
    expect(calls(text)).toBe(1);
  });

  it('binds actual null, Unicode and nested JSON memory sources, excludes promotion-only changes, and hides changed successful sources', async () => {
    const world = await runtime.world();
    const content = 'Unicode source 😀 café ' + randomUUID();
    const memory = await runtime.db.agentMemory.create({
      data: {
        organizationId: world.organizationId,
        userId: world.ownerId,
        brandId: world.brandId,
        scope: 'brand',
        content,
        type: null,
        kind: null,
        sourceUrl: null,
        tags: ['β', 'a'],
        metadata: {
          nested: { unicode: '雪', actualNull: null },
          order: [2, 1],
        },
      },
    });
    const entry = await runtime.writer.write({
      organizationId: world.organizationId,
      contextBaseId: world.baseId,
      dto: { content },
      principal: { origin: 'DERIVED_MEMORY', sourceMemoryId: memory.id },
    });
    await runtime.status(world, entry.id, 'SUCCEEDED');
    const job = await runtime.intent(world, entry.id);
    expect(entry.sourceSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(job.sourceSnapshotHash).toBe(entry.sourceSnapshotHash);
    expect(job.actorUserId).toBeNull();
    const snapshotSql = buildMemorySourceSnapshotHashQuery().sql;
    const current = await runtime.db.$queryRawUnsafe<Array<{ hash: string }>>(
      'SELECT ' +
        snapshotSql +
        ' AS hash FROM "agent_memories" m WHERE m."id"=$1 AND m."organizationId"=$2 AND m."isDeleted"=false',
      memory.id,
      world.organizationId,
    );
    expect(current[0].hash).toBe(entry.sourceSnapshotHash);
    await runtime.db.agentMemory.updateMany({
      where: {
        id: memory.id,
        organizationId: world.organizationId,
        isDeleted: false,
      },
      data: { promotedAt: new Date(), promotedByUserId: world.ownerId },
    });
    expect(
      await runtime.contexts.queryContext(
        { contextBaseId: world.baseId, query: 'promotion-only query' },
        world.organizationId,
        world.ownerId,
      ),
    ).toHaveLength(1);
    await runtime.db.agentMemory.updateMany({
      where: {
        id: memory.id,
        organizationId: world.organizationId,
        isDeleted: false,
      },
      data: {
        metadata: {
          nested: { unicode: 'changed', actualNull: null },
          order: [2, 1],
        },
      },
    });
    expect(
      await runtime.contexts.queryContext(
        { contextBaseId: world.baseId, query: 'changed source query' },
        world.organizationId,
        world.ownerId,
      ),
    ).toEqual([]);
    expect(calls(content)).toBe(1);
    await expect(
      runtime.db.$executeRawUnsafe(
        'UPDATE "context_entries" SET "sourceSnapshotHash"=NULL WHERE "id"=$1 AND "organizationId"=$2',
        entry.id,
        world.organizationId,
      ),
    ).rejects.toThrow();
    await expect(
      runtime.db.$executeRawUnsafe(
        'UPDATE "context_embedding_jobs" SET "sourceSnapshotHash"=NULL WHERE "id"=$1 AND "organizationId"=$2',
        job.id,
        world.organizationId,
      ),
    ).rejects.toThrow();
  });

  it('fences a still-eligible memory source change during provider work and retires a personal source through the real archive service', async () => {
    const world = await runtime.world();
    const content = 'changed-memory-source-' + randomUUID();
    const memory = await runtime.db.agentMemory.create({
      data: {
        organizationId: world.organizationId,
        userId: world.ownerId,
        brandId: world.brandId,
        scope: 'brand',
        content,
      },
    });
    const hold = runtime.transport.hold(content);
    const entry = await runtime.writer.write({
      organizationId: world.organizationId,
      contextBaseId: world.baseId,
      dto: { content },
      principal: {
        origin: 'ACTOR',
        actor: world.actor,
        sourceMemoryId: memory.id,
      },
    });
    await hold.received;
    await runtime.db.agentMemory.updateMany({
      where: {
        id: memory.id,
        organizationId: world.organizationId,
        isDeleted: false,
      },
      data: { sourceUrl: 'https://fixture.test/changed-identity' },
    });
    hold.release();
    await runtime.status(world, entry.id, 'CANCELLED');
    expect((await vector(entry.id, world.organizationId)).embedding).toBeNull();
    const personalContent = 'personal-source-' + randomUUID();
    const personalBase = await runtime.db.contextBase.create({
      data: {
        organizationId: world.organizationId,
        createdById: world.ownerId,
        data: { knowledgeScope: 'personal', entryCount: 0 },
      },
    });
    const personal = await runtime.db.agentMemory.create({
      data: {
        organizationId: world.organizationId,
        userId: world.ownerId,
        scope: 'personal',
        content: personalContent,
      },
    });
    const saved = await runtime.writer.write({
      organizationId: world.organizationId,
      contextBaseId: personalBase.id,
      dto: { content: personalContent },
      principal: { origin: 'DERIVED_MEMORY', sourceMemoryId: personal.id },
    });
    await runtime.status(world, saved.id, 'SUCCEEDED');
    expect(
      await runtime.contexts.queryContext(
        { contextBaseId: personalBase.id, query: 'own personal source' },
        world.organizationId,
        world.ownerId,
      ),
    ).toHaveLength(1);
    expect(
      await runtime.contexts.queryContext(
        { contextBaseId: personalBase.id, query: 'other personal source' },
        world.organizationId,
        world.otherUserId,
      ),
    ).toEqual([]);
    await new AgentMemoriesService(
      runtime.db,
      runtime.logger,
    ).archivePersonalMemory(personal.id, world.ownerId, world.organizationId);
    expect(
      await runtime.contexts.queryContext(
        { contextBaseId: personalBase.id, query: 'archived source' },
        world.organizationId,
        world.ownerId,
      ),
    ).toEqual([]);
    expect(await vector(saved.id, world.organizationId)).toMatchObject({
      generation: 2,
    });
  });

  it.each(['before-claim', 'before-commit', 'after-success'])(
    'checks committed-memory identity changes %s against real PostgreSQL values',
    async (phase) => {
      for (const field of [
        'owner',
        'brand',
        'scope',
        'campaign',
        'source',
        'content',
      ]) {
        const world = await runtime.world();
        const content =
          'snapshot-matrix-' + phase + '-' + field + '-' + randomUUID();
        const campaign = await runtime.db.agentCampaign.create({
          data: {
            organizationId: world.organizationId,
            userId: world.ownerId,
            brandId: world.brandId,
            label: 'Snapshot matrix',
          },
        });
        const memory = await runtime.db.agentMemory.create({
          data: {
            organizationId: world.organizationId,
            userId: world.ownerId,
            brandId: world.brandId,
            scope: 'brand',
            content,
          },
        });
        if (phase === 'before-claim') await runtime.stopWorker();
        const hold =
          phase === 'before-commit'
            ? runtime.transport.hold(content)
            : undefined;
        const entry = await runtime.writer.write({
          organizationId: world.organizationId,
          contextBaseId: world.baseId,
          dto: { content },
          principal: { origin: 'DERIVED_MEMORY', sourceMemoryId: memory.id },
        });
        if (hold) await hold.received;
        if (phase === 'after-success')
          await runtime.status(world, entry.id, 'SUCCEEDED');
        await runtime.db.agentMemory.updateMany({
          where: {
            id: memory.id,
            organizationId: world.organizationId,
            isDeleted: false,
          },
          data: {
            ...(field === 'owner' ? { userId: world.otherUserId } : {}),
            ...(field === 'brand' ? { brandId: world.otherBrandId } : {}),
            ...(field === 'scope' ? { scope: 'org', brandId: null } : {}),
            ...(field === 'campaign' ? { campaignId: campaign.id } : {}),
            ...(field === 'source' ? { sourceType: 'changed-source' } : {}),
            ...(field === 'content' ? { content: content + ' changed' } : {}),
          },
        });
        hold?.release();
        if (phase === 'before-claim') {
          await runtime.restartWorker();
          await runtime.sweep.sweep();
        }
        if (phase !== 'after-success') {
          await runtime.status(world, entry.id, 'CANCELLED');
          expect(
            (await vector(entry.id, world.organizationId)).embedding,
          ).toBeNull();
        }
        expect(calls(content)).toBe(phase === 'before-claim' ? 0 : 1);
        expect(
          await runtime.contexts.queryContext(
            { contextBaseId: world.baseId, query: 'source identity fence' },
            world.organizationId,
            world.ownerId,
          ),
        ).toEqual([]);
      }
    },
  );

  it('runs 200 representative jobs through the real two-slot queue and records finite searchable timing', async () => {
    const world = await runtime.world();
    const began = performance.now();
    const chunks = Array.from(
      { length: 200 },
      (_, i) => 'normal-load-' + i + '-' + world.organizationId,
    );
    const first = runtime.transport.hold(chunks[0]);
    const second = runtime.transport.hold(chunks[1]);
    const item = await knowledge(world, chunks);
    const admittedAt = performance.now();
    await Promise.all([first.received, second.received]);
    expect(runtime.transport.active).toBe(2);
    first.release();
    second.release();
    await finishKnowledge(world, item);
    const completedAt = performance.now();
    const hits = await runtime.retrieval.retrieveBrandKnowledge({
      organizationId: world.organizationId,
      userId: world.ownerId,
      brandId: world.brandId,
      query: 'normal load searchable',
      limit: 5,
      minRelevance: 0,
    });
    expect(hits).toHaveLength(5);
    expect(
      hits.every((hit) => hit.citation?.versionId === item.version.id),
    ).toBe(true);
    expect(runtime.transport.maxActive).toBeLessThanOrEqual(2);
    expect(chunks.reduce((total, content) => total + calls(content), 0)).toBe(
      200,
    );
    const searchableMs = performance.now() - began;
    measurements.push({
      case: '200-job-loopback',
      admittedMs: admittedAt - began,
      completedMs: completedAt - began,
      searchableMs,
      providerCalls: 200,
    });
    expect(searchableMs).toBeLessThan(600000);
  });
});
