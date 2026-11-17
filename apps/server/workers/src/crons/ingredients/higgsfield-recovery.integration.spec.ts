import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import type { VideoGenerationContext } from '@api/collections/videos/services/video-generation.types';
import { VideoGenerationExecutionService } from '@api/collections/videos/services/video-generation-execution.service';
import type { AggregatePaginateResult } from '@api/helpers/types/aggregate-paginate-result';
import { HiggsFieldPollQueueService } from '@api/queues/higgsfield-poll/higgsfield-poll-queue.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { HiggsFieldPollJobData } from '@genfeedai/contracts/queue';
import type { Prisma } from '@genfeedai/prisma';
import { CronIngredientsService } from '@workers/crons/ingredients/cron.ingredients.service';
import { HiggsFieldPollProcessor } from '@workers/processors/api/queues/higgsfield-poll/higgsfield-poll.processor';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
if (!['127.0.0.1', 'localhost', '::1'].includes(redisUrl.hostname)) {
  throw new Error('This disposable queue test requires loopback Redis');
}
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
};
const isRedisAvailable = await new Promise<boolean>((resolve) => {
  const socket = net.connect({ ...connection, timeout: 500 });
  function finish(isAvailable: boolean) {
    socket.destroy();
    resolve(isAvailable);
  }
  socket.once('connect', () => finish(true));
  socket.once('error', () => finish(false));
  socket.once('timeout', () => finish(false));
});
if (!isRedisAvailable && process.env.CI)
  throw new Error('Redis is required in CI');

const logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

const persistedIngredientSchema = z.object({
  id: z.string(),
  category: z.literal(IngredientCategory.VIDEO),
  organizationId: z.string(),
  status: z.string(),
  isDeleted: z.boolean(),
  metadata: z.object({
    externalProvider: z.string().optional(),
    externalId: z.string().optional(),
  }),
  videoUrl: z.string().nullable(),
});
const directories: string[] = [];

/** Disk-backed storage survives disposal of every service and request context. */
async function recoveryHarness(
  pollQueue: HiggsFieldPollQueueService,
  hasLostResponse = false,
) {
  const directory = await mkdtemp(join(tmpdir(), 'higgsfield-recovery-'));
  directories.push(directory);
  const receiptPath = join(directory, 'ingredient.json');
  await writeFile(
    receiptPath,
    JSON.stringify({
      id: 'fixture-video',
      category: IngredientCategory.VIDEO,
      organizationId: 'fixture-org',
      status: IngredientStatus.PROCESSING,
      isDeleted: false,
      metadata: {},
      videoUrl: null,
    }),
  );
  async function readIngredient() {
    return persistedIngredientSchema.parse(
      JSON.parse(await readFile(receiptPath, 'utf8')),
    );
  }
  const released: string[] = [];
  const providerSubmissions: string[] = [];
  const metadataService = {
    patch: async (
      _id: string,
      data: { externalId?: string; externalProvider?: string },
    ) => {
      const ingredient = await readIngredient();
      ingredient.metadata = { ...ingredient.metadata, ...data };
      await writeFile(receiptPath, JSON.stringify(ingredient));
    },
  };
  const ingredients = {
    findAll: vi.fn(async (query: Prisma.IngredientFindManyArgs) => {
      const ingredient = await readIngredient();
      const where = query?.where;
      const isHiggsfield =
        ingredient.metadata.externalProvider === 'higgsfield';
      // Fixture storage implements only the filter boundaries used by this sweep.
      const isExcluded = isHiggsfield && where?.NOT !== undefined;
      const metadata = where?.metadata;
      const provider =
        metadata && 'is' in metadata
          ? metadata.is?.externalProvider
          : undefined;
      const isMatchingProvider =
        provider === undefined ||
        provider === ingredient.metadata.externalProvider;
      const docs =
        !isExcluded && isMatchingProvider && where?.status === ingredient.status
          ? [ingredient]
          : [];
      return { docs } as unknown as AggregatePaginateResult<IngredientEntity>;
    }),
    patchAll: async () => {
      const ingredient = await readIngredient();
      ingredient.status = IngredientStatus.FAILED;
      await writeFile(receiptPath, JSON.stringify(ingredient));
      return { modifiedCount: 1 };
    },
  };
  function freshProcess() {
    return new CronIngredientsService(
      {} as never,
      {} as never,
      ingredients as never,
      {} as never,
      {} as never,
      {} as never,
      {
        acquireLock: async () => true,
        releaseLock: async () => undefined,
      } as never,
      logger as never,
      { schedule: async () => undefined } as never,
      pollQueue,
    );
  }
  async function submit() {
    const execution = new VideoGenerationExecutionService(
      { record: async () => ({ id: 'fixture-activity' }) } as never,
      { handleFailedVideoGeneration: ingredients.patchAll } as never,
      {
        releaseOutput: async (id: string) => {
          released.push(id);
        },
      } as never,
      logger as never,
      metadataService as never,
      {
        providerFor: () => 'higgsfield',
        dispatch: async (params: {
          onProviderSubmissionStarted: () => void;
        }) => {
          params.onProviderSubmissionStarted();
          providerSubmissions.push('fixture-request');
          if (hasLostResponse) throw new Error('injected response loss');
          return {
            completion: 'polling',
            provider: 'higgsfield',
            externalId: 'fixture-request',
          };
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { publishBackgroundTaskUpdate: async () => undefined } as never,
      {} as never,
      {
        open: async () => undefined,
        recordAccepted: async () => undefined,
      } as never,
      pollQueue,
    );
    await execution.execute({
      brand: { id: 'fixture-brand', organizationId: 'fixture-org' },
      createVideoDto: { outputs: 1 },
      ingredientData: { id: 'fixture-video' },
      metadataData: { id: 'fixture-metadata' },
      model: 'higgsfield/cinema-studio/4.0',
      referenceImageUrls: [],
      referenceIds: [],
      pendingIngredientIds: ['fixture-video'],
      promptData: { original: 'fixture' },
      promptInput: { prompt: 'fixture' },
      promptParams: {},
      user: {
        id: 'fixture-user',
        userId: 'fixture-user',
        organizationId: 'fixture-org',
      },
    } as unknown as VideoGenerationContext);
  }
  async function complete(url: string) {
    const ingredient = await readIngredient();
    ingredient.status = IngredientStatus.GENERATED;
    ingredient.videoUrl = url;
    await writeFile(receiptPath, JSON.stringify(ingredient));
  }
  return {
    readIngredient,
    ingredients,
    freshProcess,
    submit,
    providerSubmissions,
    released,
    complete,
  };
}

describe.skipIf(!isRedisAvailable)(
  'Higgsfield persisted first-poll handoff (disposable BullMQ queue)',
  () => {
    const queues: Queue<HiggsFieldPollJobData>[] = [];
    const workers: Worker[] = [];
    const events: QueueEvents[] = [];
    afterEach(async () => {
      await Promise.all(
        directories
          .splice(0)
          .map((directory) => rm(directory, { recursive: true, force: true })),
      );
      await Promise.all(workers.splice(0).map((worker) => worker.close()));
      await Promise.all(events.splice(0).map((event) => event.close()));
      await Promise.all(
        queues.splice(0).map(async (queue) => {
          await queue.obliterate({ force: true });
          await queue.close();
        }),
      );
    });

    it('recovers the saved request after enqueue fails and completes one asset on repeated sweeps', async () => {
      const queue = new Queue<HiggsFieldPollJobData>(
        `higgsfield-recovery-test-${randomUUID()}`,
        { connection },
      );
      queues.push(queue);
      const pollQueue = new HiggsFieldPollQueueService(queue, logger as never);
      const state = await recoveryHarness(pollQueue);
      const add = vi
        .spyOn(queue, 'add')
        .mockRejectedValueOnce(new Error('injected first enqueue outage'));
      await expect(state.submit()).rejects.toThrow(
        'injected first enqueue outage',
      );
      expect(await state.readIngredient()).toMatchObject({
        status: IngredientStatus.PROCESSING,
        metadata: {
          externalId: 'fixture-request',
          externalProvider: 'higgsfield',
        },
      });
      add.mockRestore();
      await state.freshProcess().checkStuckProcessingIngredients();
      await state.freshProcess().checkStuckProcessingIngredients();
      expect(await queue.getDelayedCount()).toBe(1);
      expect(await queue.getWaitingCount()).toBe(0);
      const job = await queue.getJob('higgsfield-poll-fixture-video-1');
      expect(job?.data.externalId).toBe('fixture-request');
      await job?.promote();
      const queueEvents = new QueueEvents(queue.name, { connection });
      events.push(queueEvents);
      await queueEvents.waitUntilReady();
      const terminalAssets: string[] = [];
      const processor = new HiggsFieldPollProcessor(
        {
          readVideoRequest: async () => ({
            state: 'completed',
            videoUrl: 'https://fixture.invalid/video.mp4',
          }),
        } as never,
        { findOneSelect: state.readIngredient } as never,
        logger as never,
        pollQueue,
        {
          processMediaForIngredient: async (
            _id: string,
            _category: string,
            url: string,
          ) => {
            await state.complete(url);
            terminalAssets.push(url);
          },
        } as never,
      );
      const worker = new Worker<HiggsFieldPollJobData>(
        queue.name,
        (activeJob) => processor.process(activeJob),
        { connection },
      );
      workers.push(worker);
      await job?.waitUntilFinished(queueEvents, 5000);
      await state.freshProcess().checkStuckProcessingIngredients();
      expect(terminalAssets).toEqual(['https://fixture.invalid/video.mp4']);
      expect(await state.readIngredient()).toMatchObject({
        status: IngredientStatus.GENERATED,
      });
      expect(state.providerSubmissions).toEqual(['fixture-request']);
      expect(state.released).toEqual([]);
    });

    it('keeps an uncertain submission visible across fresh timeout sweeps without resubmitting', async () => {
      const queue = new Queue<HiggsFieldPollJobData>(
        `higgsfield-uncertain-test-${randomUUID()}`,
        { connection },
      );
      queues.push(queue);
      const state = await recoveryHarness(
        new HiggsFieldPollQueueService(queue, logger as never),
        true,
      );
      await expect(state.submit()).rejects.toThrow('injected response loss');
      await state.freshProcess().checkStuckProcessingIngredients();
      await state.freshProcess().checkStuckProcessingIngredients();
      await state.freshProcess().triggerTimeoutCheck();
      expect(await state.readIngredient()).toMatchObject({
        status: IngredientStatus.PROCESSING,
        metadata: { externalProvider: 'higgsfield' },
      });
      expect(state.providerSubmissions).toEqual(['fixture-request']);
      expect(state.released).toEqual([]);
      expect(
        await queue.getJobCounts('waiting', 'delayed', 'completed', 'failed'),
      ).toMatchObject({ waiting: 0, delayed: 0, completed: 0, failed: 0 });
    });
  },
);
