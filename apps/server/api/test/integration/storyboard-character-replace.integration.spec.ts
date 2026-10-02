import { randomUUID } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { StoryboardCharacterReplaceService } from '@api/collections/content-runs/services/storyboard-character-replace.service';
import { characterObservation } from '@api/collections/content-runs/services/storyboard-character-replace-state';
import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import {
  storyboardLegacyConfigSchema,
  storyboardPublicConfig,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import {
  StoryboardRunStoreService,
  storyboardJson,
} from '@api/collections/content-runs/services/storyboard-run-store.service';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { storyboardRunConfigSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { PrismaClient } from '@genfeedai/prisma';
import { HttpService } from '@nestjs/axios';
import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Queue, Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('durable character replacement with real PostgreSQL, BullMQ and isolated HTTP', () => {
  const prefix = `5767-${randomUUID()}`;
  const userId = `${prefix}-user`,
    organizationId = `${prefix}-org`,
    brandId = `${prefix}-brand`,
    videoId = `${prefix}-video`,
    imageId = `${prefix}-image`;
  let prisma: PrismaClient,
    second: PrismaClient,
    server: Server,
    endpoint: string,
    redisConnection: { host: string; port: number },
    account = 'fixture-key';
  let accepted = 0,
    posts = 0,
    gets = 0,
    mode = 'normal',
    providerStatus = 'queued',
    withOutput = false,
    held: ServerResponse | undefined;
  const submissions = new Map<
    string,
    { payload: string; request_id: string }
  >();
  function client(db: PrismaClient) {
    const store = new StoryboardRunStoreService(db as never);
    const provider = new HiggsFieldService(
      {
        get: (key: string) =>
          key === 'HIGGSFIELD_API_BASE_URL'
            ? endpoint
            : key === 'HIGGSFIELD_API_KEY'
              ? account
              : key === 'HIGGSFIELD_API_SECRET'
                ? 'fixture-secret'
                : undefined,
      } as never,
      { log: vi.fn(), error: vi.fn(), warn: vi.fn() } as never,
      new HttpService(),
      { resolveApiKey: async () => undefined } as never,
      {} as never,
    );
    const service = new StoryboardCharacterReplaceService(
      db as never,
      store,
      { revalidate: async () => undefined } as never,
      {
        libraryAsset: async () => ({
          sourceAssetId: videoId,
          url: `https://fixture.invalid/video?signature=${randomUUID()}`,
        }),
      } as never,
      provider,
      { buildUrl: (key: string) => `https://fixture.invalid/${key}` } as never,
    );
    return { service, store, provider };
  }
  beforeAll(async () => {
    const url =
      process.env.STORYBOARD_DISPOSABLE_DATABASE_URL ??
      (process.env.CI === 'true' ? process.env.DATABASE_URL : undefined);
    const database = url ? new URL(url) : null;
    const redis = process.env.REDIS_URL ? new URL(process.env.REDIS_URL) : null;
    if (
      !url ||
      !database ||
      !['localhost', '127.0.0.1'].includes(database.hostname) ||
      !(
        database.pathname.startsWith('/storyboard_5767_disposable') ||
        (process.env.CI === 'true' && database.pathname === '/test')
      ) ||
      !redis ||
      !['localhost', '127.0.0.1'].includes(redis.hostname)
    )
      throw new Error('Explicit disposable local database and Redis required');
    redisConnection = {
      host: redis.hostname,
      port: Number(redis.port || 6379),
    };
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    second = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    await prisma.user.create({ data: { id: userId, handle: userId } });
    await prisma.organization.create({
      data: {
        id: organizationId,
        userId,
        label: 'Fixture',
        slug: organizationId,
      },
    });
    await prisma.brand.create({
      data: {
        id: brandId,
        userId,
        organizationId,
        label: 'Fixture',
        slug: brandId,
      },
    });
    for (const [id, category] of [
      [videoId, IngredientCategory.VIDEO],
      [imageId, IngredientCategory.IMAGE],
    ] as const)
      await prisma.ingredient.create({
        data: {
          id,
          organizationId,
          brandId,
          userId,
          category,
          status: IngredientStatus.UPLOADED,
          s3Key: `${id}.media`,
        },
      });
    server = createServer(async (req, res) => {
      if (!req.socket.remoteAddress?.includes('127.0.0.1')) {
        res.writeHead(403).end();
        return;
      }
      if (req.method === 'POST') {
        posts++;
        let payload = '';
        for await (const chunk of req) payload += chunk;
        const key = `${req.headers.authorization}:${req.headers['idempotency-key']}`;
        let record = submissions.get(key);
        if (record && record.payload !== payload) {
          res.writeHead(422).end('{}');
          return;
        }
        if (mode === 'reject') {
          res.writeHead(422).end('{}');
          return;
        }
        if (!record) {
          record = { payload, request_id: `fixture-${++accepted}` };
          submissions.set(key, record);
        }
        if (mode === 'violate')
          record = { ...record, request_id: `fixture-${++accepted}` };
        const response = {
          request_id: record.request_id,
          ...(mode === 'missing-status'
            ? {}
            : { status: mode === 'nonstring-status' ? 123 : providerStatus }),
          ...(withOutput
            ? { video: { url: 'https://fixture.invalid/output' } }
            : {}),
        };
        if (mode === 'drop') {
          req.socket.destroy();
          return;
        }
        if (mode === 'hold') {
          held = res;
          res.setHeader('x-fixture-receipt', record.request_id);
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(response));
      } else {
        gets++;
        if (mode === 'status5xx') {
          res.writeHead(503).end('{}');
          return;
        }
        const request_id = req.url?.split('/')[2];
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            request_id,
            status: providerStatus,
            ...(withOutput
              ? { video: { url: 'https://fixture.invalid/output' } }
              : {}),
          }),
        );
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Fixture listener failed');
    endpoint = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    held?.destroy();
    if (server) await new Promise<void>((r) => server.close(() => r()));
    if (prisma) {
      await prisma.contentRun.deleteMany({
        where: { organizationId, brandId },
      });
      await prisma.ingredient.deleteMany({
        where: { organizationId, brandId },
      });
      await prisma.brand.deleteMany({ where: { id: brandId, organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
    await second?.$disconnect();
  });
  async function fixture() {
    mode = 'normal';
    providerStatus = 'queued';
    withOutput = false;
    account = 'fixture-key';
    const config = storyboardRunConfigSchema.parse({
      contract: 'storyboard-run',
      version: 1,
      origin: 'native',
      revision: 1,
      clientRequestId: randomUUID(),
      createdByUserId: userId,
      submittedInputHash: 'a'.repeat(64),
      state: 'storyboard',
      sourceSnapshot: {
        selector: { kind: 'uploaded_video', assetId: videoId },
        assetId: videoId,
        capturedAt: '2026-10-01T00:00:00.000Z',
        assetUpdatedAt: '2026-10-01T00:00:00.000Z',
        title: 'Fixture',
        durationSeconds: 8,
        sizeBytes: 1000,
      },
      plan: {
        title: 'Fixture',
        logline: 'Walk',
        format: '9:16',
        runtimeBudgetSeconds: 8,
        styleReferenceAssetIds: [],
        cast: [],
        shots: [
          {
            id: 'shot',
            ordinal: 1,
            action: 'Walk',
            onScreenSpeaker: false,
            durationSeconds: 8,
            stillFreshness: 'missing',
            transition: 'cut',
          },
        ],
      },
    });
    const row = await prisma.contentRun.create({
      data: {
        id: randomUUID(),
        organizationId,
        brandId,
        config: storyboardJson(config),
      },
    });
    return row.id;
  }
  const replace = (c: ReturnType<typeof client>, run: string, prompt = '') =>
    c.service.replace(organizationId, brandId, run, 'shot', {
      imageAssetIds: [imageId],
      prompt,
    });
  async function expire(c: ReturnType<typeof client>, run: string) {
    const { config } = await c.store.read(organizationId, brandId, run);
    await c.store.save(organizationId, brandId, run, config, {
      ...config,
      characterReplacementOperations:
        config.characterReplacementOperations?.map((op) => ({
          ...op,
          leaseUntil: 0,
        })),
    });
  }

  it('two separate queue workers commit one operation and accept one generation', async () => {
    const run = await fixture(),
      a = client(prisma),
      b = client(second),
      before = accepted,
      startPosts = posts;
    const queuePrefix = `${prefix}-${randomUUID()}`;
    const queues = [
      new Queue(`${queuePrefix}-a`, { connection: redisConnection }),
      new Queue(`${queuePrefix}-b`, { connection: redisConnection }),
    ];
    const entered = [false, false];
    const workers = [a, b].map(
      (c, index) =>
        new Worker(
          queues[index].name,
          async () => {
            entered[index] = true;
            try {
              return await replace(c, run);
            } catch (error) {
              if (error instanceof ConflictException) return { conflict: true };
              throw error;
            }
          },
          { connection: redisConnection, concurrency: 2 },
        ),
    );
    try {
      mode = 'hold';
      await queues[0].add('replace', {}, { jobId: 'delivery-one' });
      await vi.waitFor(() => expect(held).toBeDefined());
      await queues[1].add('replace', {}, { jobId: 'delivery-two' });
      await vi.waitFor(async () =>
        expect(await queues[1].getCompletedCount()).toBe(1),
      );
      expect(entered).toEqual([true, true]);
      expect((await queues[1].getJob('delivery-two'))?.returnvalue).toEqual({
        conflict: true,
      });
      held?.end(
        JSON.stringify({
          request_id: held.getHeader('x-fixture-receipt'),
          status: 'queued',
        }),
      );
      held = undefined;
      await vi.waitFor(async () =>
        expect(await queues[0].getCompletedCount()).toBe(1),
      );
      const { config } = await a.store.read(organizationId, brandId, run);
      expect(config.characterReplacementOperations).toHaveLength(1);
      expect(accepted - before).toBe(1);
      expect(posts - startPosts).toBe(1);
    } finally {
      held?.destroy();
      held = undefined;
      for (const worker of workers) await worker.close();
      for (const queue of queues) {
        await queue.obliterate({ force: true });
        await queue.close();
      }
    }
  });
  it('an edit through another DB client survives acceptance and detaches changed shots', async () => {
    const run = await fixture(),
      a = client(prisma),
      b = client(second);
    mode = 'hold';
    const pending = replace(a, run);
    await vi.waitFor(() => expect(held).toBeDefined());
    const { config } = await b.store.read(organizationId, brandId, run);
    if (config.origin !== 'native') throw new Error('Expected native fixture');
    if (!config.plan) throw new Error('Missing plan');
    await b.store.save(organizationId, brandId, run, config, {
      ...config,
      plan: {
        ...config.plan,
        title: 'Edited',
        shots: config.plan.shots.map((shot) => ({
          ...shot,
          action: 'Changed',
        })),
      },
    });
    const receipt = held?.getHeader('x-fixture-receipt');
    held?.end(JSON.stringify({ request_id: receipt, status: 'queued' }));
    held = undefined;
    const result = await pending;
    expect(result.association).toBe('detached');
    const latest = await b.store.read(organizationId, brandId, run);
    expect(latest.config.plan?.title).toBe('Edited');
    expect(
      latest.config.characterReplacementOperations?.[0].receipts[0].requestId,
    ).toBe(receipt);
  });
  it('socket-loss restart recovers exact signed URL bytes, key and handle', async () => {
    const run = await fixture(),
      a = client(prisma),
      before = accepted;
    mode = 'drop';
    await expect(replace(a, run)).rejects.toBeInstanceOf(ConflictException);
    const original = (await a.store.read(organizationId, brandId, run)).config
      .characterReplacementOperations?.[0];
    expect(original).toBeDefined();
    mode = 'normal';
    await expect(replace(client(second), run)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expire(a, run);
    const recovered = await replace(client(second), run);
    expect(accepted - before).toBe(1);
    expect(recovered.requestId).toBeDefined();
    const next = (await a.store.read(organizationId, brandId, run)).config
      .characterReplacementOperations?.[0];
    expect(next?.body).toEqual(original?.body);
    expect(next?.operationId).toBe(original?.operationId);
  });
  it('real accepted acknowledgement CAS exhaustion remains recoverable', async () => {
    const run = await fixture(),
      a = client(prisma),
      before = accepted;
    mode = 'hold';
    const pending = replace(a, run);
    await vi.waitFor(() => expect(held).toBeDefined());
    const originalSave = a.store.save.bind(a.store);
    a.store.save = async () => {
      throw new ConflictException('injected conflict');
    };
    held?.end(
      JSON.stringify({
        request_id: held.getHeader('x-fixture-receipt'),
        status: 'queued',
      }),
    );
    held = undefined;
    await expect(pending).rejects.toMatchObject({
      response: expect.objectContaining({
        requestId: expect.any(String),
        errorCode: 'CHARACTER_REPLACEMENT_RECONCILIATION_REQUIRED',
      }),
    });
    a.store.save = originalSave;
    mode = 'normal';
    await expire(a, run);
    await replace(client(second), run);
    expect(accepted - before).toBe(1);
  });
  it('status uses truthful provider-only output and does not regress terminal evidence', async () => {
    const run = await fixture(),
      a = client(prisma);
    const result = await replace(a, run);
    const id = result.operationId ?? 'missing';
    const initialPosts = posts;
    providerStatus = 'in_progress';
    expect(
      (await a.service.getStatus(organizationId, brandId, run, 'shot', id))
        .status,
    ).toBe('running');
    providerStatus = 'completed';
    expect(
      (await a.service.getStatus(organizationId, brandId, run, 'shot', id))
        .status,
    ).toBe('reconciling');
    withOutput = true;
    expect(
      (await a.service.getStatus(organizationId, brandId, run, 'shot', id))
        .output,
    ).toEqual({
      kind: 'provider_url',
      url: 'https://fixture.invalid/output',
      retained: false,
    });
    providerStatus = 'queued';
    withOutput = false;
    expect(
      (await a.service.getStatus(organizationId, brandId, run, 'shot', id))
        .status,
    ).toBe('ready');
    mode = 'status5xx';
    expect(
      (await a.service.getStatus(organizationId, brandId, run, 'shot', id))
        .status,
    ).toBe('ready');
    expect(posts).toBe(initialPosts);
    const before = gets;
    await expect(
      a.service.getStatus('foreign', brandId, run, 'shot', id),
    ).rejects.toThrow();
    expect(gets).toBe(before);
  });
  it('credential changes and provider rejection never authorize a fresh key', async () => {
    const run = await fixture(),
      a = client(prisma);
    mode = 'drop';
    await expect(replace(a, run)).rejects.toThrow();
    await expire(a, run);
    account = 'changed-key';
    const before = posts;
    await expect(replace(client(second), run)).rejects.toThrow();
    expect(posts).toBe(before);
    account = 'fixture-key';
    mode = 'reject';
    await expect(replace(client(second), run)).rejects.toThrow();
    const op = (await a.store.read(organizationId, brandId, run)).config
      .characterReplacementOperations?.[0];
    expect(op?.operationId).toBeDefined();
    expect(op?.receipts).toEqual([]);
  });
  it('retains more than twelve operations and every violating accepted ID', async () => {
    const run = await fixture(),
      a = client(prisma);
    for (let i = 0; i < 13; i++) await replace(a, run, `intent-${i}`);
    const { config } = await a.store.read(organizationId, brandId, run);
    expect(config.characterReplacementOperations).toHaveLength(13);
    expect(config.characterReplacements?.length).toBeLessThanOrEqual(12);
    const op = config.characterReplacementOperations?.[0];
    if (!op) throw new Error('Missing operation');
    const updated = {
      ...config,
      characterReplacementOperations:
        config.characterReplacementOperations?.map((item) =>
          item.operationId === op.operationId
            ? characterObservation(item, 'violating-id', 'queued')
            : item,
        ),
    };
    await a.store.save(organizationId, brandId, run, config, updated);
    expect(
      (await a.store.read(organizationId, brandId, run)).config
        .characterReplacementOperations?.[0].receipts,
    ).toHaveLength(2);
    expect(JSON.stringify(storyboardPublicConfig(updated))).not.toContain(
      'credentialFingerprint',
    );
    expect(JSON.stringify(storyboardPublicConfig(updated))).not.toContain(
      'signature=',
    );
  });
  it('scoped missing and deleted assets refuse dispatch, and a reference edit detaches history', async () => {
    const run = await fixture(),
      a = client(prisma),
      before = posts;
    await expect(
      a.service.replace('foreign', brandId, run, 'shot', {
        imageAssetIds: [imageId],
      }),
    ).rejects.toThrow();
    await expect(
      a.service.replace(organizationId, brandId, run, 'shot', {
        imageAssetIds: ['missing'],
      }),
    ).rejects.toThrow();
    await prisma.ingredient.update({
      where: { id: imageId },
      data: { isDeleted: true },
    });
    await expect(replace(a, run)).rejects.toThrow();
    await prisma.ingredient.update({
      where: { id: imageId },
      data: { isDeleted: false },
    });
    expect(posts).toBe(before);
    const result = await replace(a, run);
    await prisma.ingredient.update({
      where: { id: imageId },
      data: { updatedAt: new Date(Date.now() + 1000) },
    });
    expect(
      (
        await a.service.getStatus(
          organizationId,
          brandId,
          run,
          'shot',
          result.operationId ?? 'missing',
        )
      ).association,
    ).toBe('detached');
  });
  it('source and shot edits between claim and HTTP block with zero dispatch', async () => {
    for (const edit of ['source', 'shot', 'reference']) {
      const run = await fixture(),
        a = client(prisma),
        b = client(second),
        before = posts;
      const save = a.store.save.bind(a.store);
      let edited = false;
      a.store.save = async (
        ...args: Parameters<StoryboardRunStoreService['save']>
      ) => {
        const result = await save(...args);
        if (
          !edited &&
          args[4].characterReplacementOperations?.[0].state === 'submitting'
        ) {
          edited = true;
          if (edit === 'reference')
            await second.ingredient.update({
              where: { id: imageId },
              data: { updatedAt: new Date(Date.now() + 2000) },
            });
          else {
            const { config } = await b.store.read(organizationId, brandId, run);
            if (config.origin !== 'native')
              throw new Error('Expected native fixture');
            if (!config.plan) throw new Error('Missing plan');
            await b.store.save(
              organizationId,
              brandId,
              run,
              config,
              edit === 'shot'
                ? { ...config, plan: { ...config.plan, shots: [] } }
                : {
                    ...config,
                    sourceSnapshot: {
                      selector: { kind: 'brief', brief: 'Changed' },
                      capturedAt: new Date().toISOString(),
                    },
                  },
            );
          }
        }
        return result;
      };
      await expect(replace(a, run)).rejects.toThrow();
      expect(posts).toBe(before);
    }
  });
  it('capacity refuses a new intent before transport while existing receipts remain readable', async () => {
    const run = await fixture(),
      a = client(prisma);
    const result = await replace(a, run);
    const { config } = await a.store.read(organizationId, brandId, run);
    const seed = config.characterReplacementOperations?.[0];
    if (!seed) throw new Error('Missing op');
    await a.store.save(organizationId, brandId, run, config, {
      ...config,
      characterReplacementOperations: Array.from(
        { length: 128 },
        (_, index) => ({
          ...seed,
          operationId: index === 0 ? seed.operationId : randomUUID(),
          intentHash: index === 0 ? seed.intentHash : `capacity-${index}`,
        }),
      ),
    });
    const before = posts;
    await expect(replace(a, run, 'new intent')).rejects.toThrow(
      'CHARACTER_REPLACEMENT_JOURNAL_FULL',
    );
    expect(posts).toBe(before);
    expect(
      (
        await a.service.getStatus(
          organizationId,
          brandId,
          run,
          'shot',
          result.operationId ?? 'missing',
        )
      ).requestId,
    ).toBe(result.requestId);
  });
  it('legacy binding remains blocked after source changes without provider access', async () => {
    const run = await fixture(),
      a = client(prisma);
    const { config } = await a.store.read(organizationId, brandId, run);
    await a.store.save(organizationId, brandId, run, config, {
      ...config,
      characterReplacements: [
        {
          shotId: 'shot',
          requestId: 'historical',
          modelKey: 'higgsfield/genjutsu/motion-transfer/v1.0',
          imageAssetIds: [imageId],
          videoAssetId: videoId,
          status: 'ready',
          chargedCredits: 0,
          limitations: ['No retention'],
        },
      ],
    });
    const before = posts,
      startGets = gets;
    const receipt = await replace(a, run);
    expect(receipt.requestId).toBe('historical');
    expect(receipt.status).toBe('blocked');
    expect(receipt).not.toHaveProperty('output');
    expect(
      (
        await a.service.getStatus(
          organizationId,
          brandId,
          run,
          'shot',
          receipt.operationId ?? 'missing',
        )
      ).errorCode,
    ).toBe('CHARACTER_REPLACEMENT_LEGACY_BINDING_UNKNOWN');
    expect(posts).toBe(before);
    expect(gets).toBe(startGets);
  });
  it.each([
    ['failed', 'failed'],
    ['nsfw', 'failed'],
    ['canceled', 'cancelled'],
  ])('observes %s as %s without charging', async (status, expected) => {
    const run = await fixture(),
      a = client(prisma),
      receipt = await replace(a, run);
    providerStatus = status;
    const observed = await a.service.getStatus(
      organizationId,
      brandId,
      run,
      'shot',
      receipt.operationId ?? 'missing',
    );
    expect(observed.status).toBe(expected);
    expect(observed.chargedCredits).toBe(0);
    expect(observed).not.toHaveProperty('outputAssetId');
  });
  it('overlapping expired deliveries preserve both violating acknowledgements', async () => {
    const run = await fixture(),
      a = client(prisma),
      b = client(second);
    mode = 'hold';
    const first = replace(a, run);
    await vi.waitFor(() => expect(held).toBeDefined());
    const firstResponse = held;
    held = undefined;
    await expire(b, run);
    mode = 'violate';
    const secondReceipt = await replace(b, run);
    firstResponse?.end(
      JSON.stringify({
        request_id: firstResponse.getHeader('x-fixture-receipt'),
        status: 'queued',
      }),
    );
    await first;
    const { config } = await a.store.read(organizationId, brandId, run);
    const op = config.characterReplacementOperations?.[0];
    expect(op?.receipts).toHaveLength(2);
    expect(op?.receipts.map((item) => item.requestId)).toContain(
      secondReceipt.requestId,
    );
    expect(op?.errorCode).toBe(
      'CHARACTER_REPLACEMENT_PROVIDER_IDEMPOTENCY_VIOLATION',
    );
  });
  it('migrated archive roundtrip keeps the complete internal journal and hides private evidence', async () => {
    const run = await fixture(),
      a = client(prisma);
    await replace(a, run);
    const { config } = await a.store.read(organizationId, brandId, run);
    const original = storyboardLegacyConfigSchema.parse({
      contract: 'brand-remix-run',
      version: 1,
      recipeVersion: 1,
      revision: 1,
      phase: 'prefilled',
      readiness: { state: 'ready', issues: [] },
      draft: {
        fidelityMode: 'guided',
        identity: {},
        intent: { objective: 'Fixture' },
        output: {
          kind: 'video',
          count: 1,
          aspectRatio: '9:16',
          durationSeconds: 8,
        },
        references: [],
        reviewRequired: true,
        target: { kind: 'organic', platform: 'tiktok' },
      },
      sourceSnapshot: {
        capturedAt: '2026-10-01T00:00:00.000Z',
        selector: { kind: 'source_post', sourcePostId: 'fixture-source' },
        sourceId: 'fixture-source',
        title: 'Fixture',
        platform: 'tiktok',
        metrics: {},
        pattern: {},
        evidence: [],
      },
    });
    const migrated = storyboardStoredRunConfigSchema.parse({
      ...config,
      origin: 'migrated',
      migration: {
        version: 1,
        sourceContract: 'brand-remix-run',
        sourceVersion: 1,
        sourceConfigHash: storyboardConfigHash(original),
        migratedAt: new Date().toISOString(),
        converterVersion: 1,
      },
      migrationReview: { status: 'clear', issues: [] },
      importedPresentation: null,
      importedState: { version: 1, originalConfig: original },
    });
    await a.store.save(organizationId, brandId, run, config, migrated);
    const restored = (
      await client(second).store.read(organizationId, brandId, run)
    ).config;
    expect(restored.importedState?.originalConfig).toEqual(original);
    expect(restored.characterReplacementOperations).toEqual(
      config.characterReplacementOperations,
    );
    const publicConfig = storyboardPublicConfig(restored);
    expect(publicConfig).not.toHaveProperty('characterReplacementOperations');
    expect(publicConfig).not.toHaveProperty('importedState');
    await replace(client(second), run);
    expect(
      (await a.store.read(organizationId, brandId, run)).config.importedState
        ?.originalConfig,
    ).toEqual(original);
  });
  it('BullMQ redelivery after process reconstruction uses the durable original key', async () => {
    const run = await fixture(),
      a = client(prisma),
      before = accepted;
    const queueName = `${prefix}-${randomUUID()}`;
    const queue = new Queue(queueName, { connection: redisConnection });
    type ReplacementWorkerResult =
      | Awaited<ReturnType<typeof replace>>
      | {
          ambiguous: boolean;
        };
    let worker = new Worker<Record<string, never>, ReplacementWorkerResult>(
      queueName,
      async () => {
        try {
          return await replace(a, run);
        } catch (error) {
          if (error instanceof ConflictException) return { ambiguous: true };
          throw error;
        }
      },
      { connection: redisConnection, concurrency: 2 },
    );
    try {
      mode = 'drop';
      await queue.add('replace', {}, { jobId: 'original-delivery' });
      await vi.waitFor(async () =>
        expect(await queue.getCompletedCount()).toBe(1),
      );
      await worker.close();
      const original = (await a.store.read(organizationId, brandId, run)).config
        .characterReplacementOperations?.[0];
      await expire(a, run);
      mode = 'normal';
      const restarted = client(second);
      worker = new Worker<Record<string, never>, ReplacementWorkerResult>(
        queueName,
        async () => replace(restarted, run),
        { connection: redisConnection, concurrency: 2 },
      );
      await queue.add('replace', {}, { jobId: 'restart-redelivery' });
      await vi.waitFor(async () =>
        expect(await queue.getCompletedCount()).toBe(2),
      );
      const restored = (await a.store.read(organizationId, brandId, run)).config
        .characterReplacementOperations?.[0];
      expect(restored?.operationId).toBe(original?.operationId);
      expect(restored?.body).toEqual(original?.body);
      expect(restored?.receipts).toHaveLength(1);
      expect(accepted - before).toBe(1);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
  it.each(['missing-status', 'nonstring-status', 'unknown-status'])(
    'restart with %s acceptance keeps real handle and avoids resubmission',
    async (kind) => {
      const run = await fixture(),
        a = client(prisma);
      mode = kind;
      providerStatus = 'undocumented';
      const result = await replace(a, run);
      expect(result.status).toBe('reconciling');
      expect(result.requestId).toBeDefined();
      const op = (await a.store.read(organizationId, brandId, run)).config
        .characterReplacementOperations?.[0];
      expect(op?.receipts[0]).toMatchObject({
        requestId: result.requestId,
        status: 'unknown',
      });
      expect(op?.errorCode).toBe(
        'CHARACTER_REPLACEMENT_PROVIDER_STATUS_UNKNOWN',
      );
      const before = posts;
      mode = 'normal';
      providerStatus = 'queued';
      expect((await replace(client(second), run)).requestId).toBe(
        result.requestId,
      );
      expect(posts).toBe(before);
    },
  );
  it('discovery reconstructs unknown-ID durable intent with zero provider, credential, queue or database writes', async () => {
    const run = await fixture(),
      a = client(prisma);
    mode = 'drop';
    await expect(replace(a, run)).rejects.toThrow();
    const restarted = client(second);
    const before = await second.contentRun.findUniqueOrThrow({
      where: { id: run },
    });
    const startPosts = posts,
      startGets = gets;
    const credential = vi.spyOn(restarted.provider, 'getCredentialFingerprint');
    const bound = vi.spyOn(restarted.provider, 'getBoundRequestStatus');
    const generation = vi.spyOn(restarted.provider, 'generateMotionTransfer');
    const save = vi.spyOn(restarted.store, 'save');
    const update = vi.spyOn(second.contentRun, 'updateMany');
    const add = vi.spyOn(Queue.prototype, 'add');
    try {
      const result = await restarted.service.list(
        organizationId,
        brandId,
        run,
        'shot',
      );
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].requestId).toBeUndefined();
      expect(result.operations[0].acceptedRequestIds).toEqual([]);
      expect(result.operations[0].operationId).toBe(
        (await a.store.read(organizationId, brandId, run)).config
          .characterReplacementOperations?.[0].operationId,
      );
      await restarted.service.getStatus(
        organizationId,
        brandId,
        run,
        'shot',
        result.operations[0].operationId,
      );
      expect(posts).toBe(startPosts);
      expect(gets).toBe(startGets);
      for (const spy of [credential, bound, generation, save, update, add])
        expect(spy).not.toHaveBeenCalled();
      expect(
        (await second.contentRun.findUniqueOrThrow({ where: { id: run } }))
          .config,
      ).toEqual(before.config);
      for (const privateKey of [
        'body',
        'credentialFingerprint',
        'leaseToken',
        'sourceFingerprint',
        'intentHash',
        'signature=',
        'importedState',
      ])
        expect(JSON.stringify(result)).not.toContain(privateKey);
    } finally {
      for (const spy of [credential, bound, generation, save, update, add])
        spy.mockRestore();
    }
  });
  it('discovery returns all 128 durable operations through one bounded asset query and filters every journal identity', async () => {
    const run = await fixture(),
      a = client(prisma);
    await replace(a, run);
    const { config } = await a.store.read(organizationId, brandId, run);
    const seed = config.characterReplacementOperations?.[0];
    if (!seed) throw new Error('Missing operation');
    const journal = Array.from({ length: 124 }, (_, index) => ({
      ...seed,
      operationId: randomUUID(),
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
    }));
    const foreign = ['organizationId', 'brandId', 'runId', 'shotId'].map(
      (key) => ({
        ...seed,
        operationId: randomUUID(),
        [key]: 'foreign-scope',
        receipts: [
          {
            requestId: 'foreign-request',
            status: 'completed' as const,
            outputUrl: 'https://foreign.invalid/output',
          },
        ],
      }),
    );
    await a.store.save(organizationId, brandId, run, config, {
      ...config,
      characterReplacementOperations: [...journal, ...foreign],
    });
    const restarted = client(second),
      startPosts = posts,
      startGets = gets;
    const query = vi.spyOn(second.ingredient, 'findMany');
    try {
      const result = await restarted.service.list(
        organizationId,
        brandId,
        run,
        'shot',
      );
      expect(result.operations).toHaveLength(124);
      expect(result.operations[0].operationId).toBe(journal[123].operationId);
      expect(
        result.operations.every((op) => op.association === 'current'),
      ).toBe(true);
      expect(JSON.stringify(result)).not.toContain('foreign');
      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId,
          brandId,
          isDeleted: false,
          scope: AssetScope.USER,
          id: { in: [videoId, imageId] },
        }),
        select: { id: true, category: true, updatedAt: true },
      });
      query.mockClear();
      const current = (await restarted.store.read(organizationId, brandId, run))
        .config;
      await restarted.store.save(organizationId, brandId, run, current, {
        ...current,
        characterReplacementOperations: Array.from({ length: 128 }, () => ({
          ...seed,
          operationId: randomUUID(),
        })),
      });
      expect(
        (await restarted.service.list(organizationId, brandId, run, 'shot'))
          .operations,
      ).toHaveLength(128);
      expect(query).toHaveBeenCalledTimes(1);
      expect(posts).toBe(startPosts);
      expect(gets).toBe(startGets);
      await expect(
        restarted.service.list('foreign-org', brandId, run, 'shot'),
      ).rejects.toThrow();
      await expect(
        restarted.service.list(organizationId, 'foreign-brand', run, 'shot'),
      ).rejects.toThrow();
      await second.contentRun.update({
        where: { id: run },
        data: { isDeleted: true },
      });
      await expect(
        restarted.service.list(organizationId, brandId, run, 'shot'),
      ).rejects.toThrow();
    } finally {
      query.mockRestore();
    }
  });
  it('discovery detaches version, category, status, ownership and deleted assets mutated through a second database client', async () => {
    const run = await fixture(),
      a = client(prisma);
    await replace(a, run);
    const startPosts = posts,
      startGets = gets;
    const baseline = await second.ingredient.findUniqueOrThrow({
      where: { id: imageId },
    });
    const mutations = [
      { updatedAt: new Date(baseline.updatedAt.getTime() + 1000) },
      { category: IngredientCategory.VIDEO },
      { status: IngredientStatus.DRAFT },
      { brandId: null },
      { organizationId: null },
      { scope: AssetScope.BRAND },
      { isDeleted: true },
    ];
    try {
      for (const data of mutations) {
        await second.ingredient.update({ where: { id: imageId }, data });
        expect(
          (await a.service.list(organizationId, brandId, run, 'shot'))
            .operations[0].association,
        ).toBe('detached');
        await second.ingredient.update({
          where: { id: imageId },
          data: {
            updatedAt: baseline.updatedAt,
            category: baseline.category,
            status: baseline.status,
            brandId: baseline.brandId,
            organizationId: baseline.organizationId,
            scope: baseline.scope,
            isDeleted: baseline.isDeleted,
          },
        });
        expect(
          (await a.service.list(organizationId, brandId, run, 'shot'))
            .operations[0].association,
        ).toBe('current');
      }
      const video = await second.ingredient.findUniqueOrThrow({
        where: { id: videoId },
      });
      await second.ingredient.update({
        where: { id: videoId },
        data: { updatedAt: new Date(video.updatedAt.getTime() + 1000) },
      });
      expect(
        (await a.service.list(organizationId, brandId, run, 'shot'))
          .operations[0].association,
      ).toBe('detached');
      await second.ingredient.update({
        where: { id: videoId },
        data: { updatedAt: video.updatedAt },
      });
      const editor = client(second);
      const { config } = await editor.store.read(organizationId, brandId, run);
      if (config.origin !== 'native' || !config.plan)
        throw new Error('Missing native plan');
      await editor.store.save(organizationId, brandId, run, config, {
        ...config,
        sourceSnapshot: { ...config.sourceSnapshot, title: 'Changed source' },
      });
      expect(
        (await a.service.list(organizationId, brandId, run, 'shot'))
          .operations[0].association,
      ).toBe('detached');
      const changed = (await editor.store.read(organizationId, brandId, run))
        .config;
      await editor.store.save(organizationId, brandId, run, changed, config);
      const restored = (await editor.store.read(organizationId, brandId, run))
        .config;
      await editor.store.save(organizationId, brandId, run, restored, {
        ...config,
        plan: { ...config.plan, shots: [] },
      });
      expect(
        (await a.service.list(organizationId, brandId, run, 'shot'))
          .operations[0].association,
      ).toBe('detached');
      expect(posts).toBe(startPosts);
      expect(gets).toBe(startGets);
    } finally {
      await second.ingredient.update({
        where: { id: imageId },
        data: {
          updatedAt: baseline.updatedAt,
          category: baseline.category,
          status: baseline.status,
          brandId: baseline.brandId,
          organizationId: baseline.organizationId,
          scope: baseline.scope,
          isDeleted: baseline.isDeleted,
        },
      });
    }
  });
  it('discovery preserves detached legacy output and real operation IDs without adoption or status dispatch', async () => {
    const run = await fixture(),
      a = client(prisma);
    const durable = await replace(a, run);
    const { config } = await a.store.read(organizationId, brandId, run);
    const historical = {
      ...durable,
      requestId: 'historical-only',
      operationId: randomUUID(),
      status: 'ready' as const,
      output: {
        kind: 'provider_url' as const,
        url: 'https://fixture.invalid/historical',
        retained: false as const,
      },
    };
    await a.store.save(organizationId, brandId, run, config, {
      ...config,
      characterReplacements: [durable, historical],
    });
    const before = await second.contentRun.findUniqueOrThrow({
      where: { id: run },
    });
    const startPosts = posts,
      startGets = gets;
    const result = await client(second).service.list(
      organizationId,
      brandId,
      run,
      'shot',
    );
    expect(result.legacyReplacements).toEqual([
      { ...historical, association: 'detached' },
    ]);
    expect(result.operations).toHaveLength(1);
    expect(
      (await second.contentRun.findUniqueOrThrow({ where: { id: run } }))
        .config,
    ).toEqual(before.config);
    expect(posts).toBe(startPosts);
    expect(gets).toBe(startGets);
  });
  it('discovery propagates database failure without fabricating empty history or current association', async () => {
    const run = await fixture(),
      a = client(prisma);
    await replace(a, run);
    const query = vi
      .spyOn(second.ingredient, 'findMany')
      .mockRejectedValueOnce(new Error('isolated database failure'));
    const startPosts = posts,
      startGets = gets;
    try {
      await expect(
        client(second).service.list(organizationId, brandId, run, 'shot'),
      ).rejects.toThrow('isolated database failure');
      expect(posts).toBe(startPosts);
      expect(gets).toBe(startGets);
    } finally {
      query.mockRestore();
    }
  });
});
