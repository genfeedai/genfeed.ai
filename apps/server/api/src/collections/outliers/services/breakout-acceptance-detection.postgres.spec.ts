import {
  type BreakoutCandidate,
  buildCollectionHarness,
  type CollectionHarness,
  collectPost,
  resolveCollectionAuthorization,
  seedBreakoutCandidate,
  seedScheduledCollectionChain,
} from '@api/collections/outliers/services/breakout-acceptance.collection.fixture';
import {
  type AcceptanceWorld,
  acceptanceDatabaseUrl,
  must,
  openAcceptanceDatabase,
  recordingLogger,
  seedAcceptanceWorld,
  sessionActor,
} from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { breakoutResponseExecutionJobId } from '@api/collections/outliers/services/breakout-response-execution-queue.util';
import { afterAll, describe, expect, it, vi } from 'vitest';

type QueuedExecution = {
  systemRun: {
    input: {
      canonicalId: string;
      inputValues: { request: Record<string, unknown> };
      source: string;
      userId: string;
    };
  };
};

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));
// A throwaway key for the credential token round trip; not a secret.
vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'breakout-acceptance-test-key');

const connectionString = acceptanceDatabaseUrl();

/**
 * Connected acceptance (#6526), stage 1: a real X analytics collection with a bound actor
 * captures an observation, detects a tenfold breakout against five comparable earlier posts
 * and hands the committed detection to the priority execution workflow, all on PostgreSQL.
 * Fake edges: the X API (raw v2 payload through the real mapper), the credential store and
 * the BullMQ transport.
 */
describe.skipIf(!connectionString)(
  'breakout acceptance: collection, detection and enqueue (PostgreSQL)',
  () => {
    const database = openAcceptanceDatabase(connectionString ?? '');
    const { db, prisma } = database;
    const { logger, warnings } = recordingLogger();

    afterAll(async () => {
      await database.close();
    });

    async function scene() {
      const world = await seedAcceptanceWorld(db);
      const candidate = await seedBreakoutCandidate(db, world);
      const harness = buildCollectionHarness(prisma, logger, world);
      harness.tweets.set(candidate.target.externalId, { impressions: 1500 });
      const chain = await seedScheduledCollectionChain(db, prisma, world, {
        actor: sessionActor(world, world.owner),
      });
      const authorization = await resolveCollectionAuthorization(prisma, chain);
      return { authorization, candidate, chain, harness, world };
    }

    async function responsesOf(world: AcceptanceWorld) {
      return db.breakoutResponse.findMany({
        where: {
          brandId: world.brandId,
          isDeleted: false,
          organizationId: world.organizationId,
        },
      });
    }

    it('resolves the collection actor from the scheduler-written binding', async () => {
      const { authorization, world } = await scene();
      expect(authorization?.initiatingActor).toEqual(
        sessionActor(world, world.owner),
      );
    });

    it('captures, detects a tenfold breakout and enqueues the execution with its deterministic job id', async () => {
      const { authorization, candidate, harness, world } = await scene();
      await collectPost(harness, world, candidate.target, authorization);

      const observations = await db.postExposureObservation.findMany({
        orderBy: { receivedAt: 'asc' },
        where: { externalId: candidate.target.externalId },
      });
      expect(observations).toHaveLength(2);
      const latest = must(observations[1], 'the collected observation');
      expect(latest.exposures).toMatchObject({
        impressions: {
          availability: 'observed',
          scope: 'organic',
          value: 1500,
        },
      });

      const receipts = await db.breakoutBaselineReceipt.findMany({
        where: { targetObservationId: latest.id },
      });
      expect(receipts).toHaveLength(1);
      const receipt = must(receipts[0], 'the comparison receipt');
      expect(receipt).toMatchObject({ metric: 'impressions' });
      expect(receipt.evaluation).toMatchObject({
        sampleSize: 5,
        status: 'breakout',
      });
      const evaluation = receipt.evaluation as { ratio: number };
      expect(Number(evaluation.ratio)).toBeGreaterThanOrEqual(10);

      const found = await responsesOf(world);
      expect(found).toHaveLength(1);
      const response = must(found[0], 'the detected response');
      expect(response).toMatchObject({
        credentialId: world.credentialId,
        externalId: candidate.target.externalId,
        state: 'detected',
        triggerReceiptId: receipt.id,
      });

      const expectedJobId = breakoutResponseExecutionJobId(response.id);
      expect([...harness.interactive.jobs.keys()]).toEqual([expectedJobId]);
      const job = must(harness.interactive.jobs.get(expectedJobId), 'the job');
      expect(job.opts).toMatchObject({ attempts: 1, jobId: expectedJobId });
      const { input } = (job.data as QueuedExecution).systemRun;
      expect(input).toMatchObject({
        canonicalId: 'breakout.response.execute',
        source: 'breakout-response',
        userId: world.owner.id,
      });
      expect(input.inputValues.request).toMatchObject({
        brandId: world.brandId,
        credentialId: world.credentialId,
        initiatingActor: sessionActor(world, world.owner),
        organizationId: world.organizationId,
        responseId: response.id,
        strategyId: world.strategyId,
      });
    });

    it('gives one response and one job when the same collection is replayed or collected again', async () => {
      const { authorization, candidate, harness, world } = await scene();
      await collectPost(harness, world, candidate.target, authorization);
      // The next collection of the same post re-offers the still `detected` response.
      await collectPost(harness, world, candidate.target, authorization);

      expect(await responsesOf(world)).toHaveLength(1);
      expect(harness.interactive.adds).toHaveLength(1);
      expect(harness.interactive.jobs.size).toBe(1);
      // A second enqueue of the same detection is a no-op on the transport.
      const response = must((await responsesOf(world))[0], 'the response');
      expect(harness.interactive.adds[0]).toBe(
        breakoutResponseExecutionJobId(response.id),
      );
    });

    it('does not detect a post that is not roughly tenfold the comparable baseline', async () => {
      const { authorization, candidate, harness, world } = await scene();
      harness.tweets.set(candidate.target.externalId, { impressions: 700 });
      await collectPost(harness, world, candidate.target, authorization);

      expect(await responsesOf(world)).toHaveLength(0);
      expect(harness.interactive.adds).toHaveLength(0);
    });

    it('records nothing and enqueues nothing without a bound actor', async () => {
      const world = await seedAcceptanceWorld(db);
      const candidate: BreakoutCandidate = await seedBreakoutCandidate(
        db,
        world,
      );
      const harness: CollectionHarness = buildCollectionHarness(
        prisma,
        logger,
        world,
      );
      harness.tweets.set(candidate.target.externalId, { impressions: 1500 });
      await collectPost(harness, world, candidate.target, undefined);

      // Only the seeded early observation exists: ordinary collection captures no evidence.
      expect(
        await db.postExposureObservation.count({
          where: { externalId: candidate.target.externalId },
        }),
      ).toBe(1);
      expect(await responsesOf(world)).toHaveLength(0);
      expect(harness.interactive.adds).toHaveLength(0);
    });

    it('never gives a seeded platform workflow an actor, so its collection captures nothing', async () => {
      const world = await seedAcceptanceWorld(db);
      const candidate = await seedBreakoutCandidate(db, world);
      const harness = buildCollectionHarness(prisma, logger, world);
      harness.tweets.set(candidate.target.externalId, { impressions: 1500 });
      // The platform seeder marks its workflow and may even leave a stale actor binding.
      const chain = await seedScheduledCollectionChain(db, prisma, world, {
        actor: sessionActor(world, world.owner),
        platformSeedKey: `seeded-${world.suffix}`,
      });
      const authorization = await resolveCollectionAuthorization(prisma, chain);
      expect(authorization).toBeUndefined();

      await collectPost(harness, world, candidate.target, authorization);
      expect(await responsesOf(world)).toHaveLength(0);
      expect(harness.interactive.adds).toHaveLength(0);
    });

    it('does not enqueue when the brand has no single governing strategy', async () => {
      const { authorization, candidate, harness, world } = await scene();
      await db.agentStrategy.create({
        data: {
          brandId: world.brandId,
          config: {},
          isActive: true,
          organizationId: world.organizationId,
          platforms: ['twitter'],
          policies: {},
          userId: world.owner.id,
        },
      });
      warnings.length = 0;
      await collectPost(harness, world, candidate.target, authorization);

      expect(await responsesOf(world)).toHaveLength(1);
      expect(harness.interactive.adds).toHaveLength(0);
      expect(warnings.map((entry) => entry.message)).toContain(
        'Breakout response has no single governing strategy',
      );
    });
  },
);
