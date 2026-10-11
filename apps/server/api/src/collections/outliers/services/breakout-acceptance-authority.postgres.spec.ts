import { collectPost } from '@api/collections/outliers/services/breakout-acceptance.collection.fixture';
import { startQueuedBreakoutExecution } from '@api/collections/outliers/services/breakout-acceptance.execution.fixture';
import {
  type AcceptanceEnv,
  type DetectedBreakout,
  detectBreakout,
  reconcileAcceptedAttempt,
} from '@api/collections/outliers/services/breakout-acceptance.journey.fixture';
import {
  type AcceptanceWorld,
  acceptanceDatabaseUrl,
  must,
  openAcceptanceDatabase,
  recordingLogger,
  removeBrandAccess,
  restoreMembership,
  revokeApiKey,
  revokeMembership,
  seedApiKey,
} from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { Platform } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));
// A throwaway key for the credential and prompt round trips; not a secret.
vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'breakout-acceptance-test-key');
vi.setConfig({ testTimeout: 180_000 });

const connectionString = acceptanceDatabaseUrl();
const TWO_OUTPUTS = {
  config: { postsPerWeek: 1, publishingCeilingPerWeek: 2 },
};

type Kind = 'membership' | 'brand access' | 'API key';
type Point = 'before pickup' | 'during planning' | 'during the provider call';
/** Provider requests that may already have been made when authority goes at that point. */
const PROVIDER_CALLS: Record<Point, number> = {
  'before pickup': 0,
  'during planning': 0,
  'during the provider call': 1,
};

/**
 * Connected acceptance (#6526): the actor bound at collection is re-read live at every step
 * of execution, and an ambiguous provider attempt blocks its siblings until reconciled.
 */
describe.skipIf(!connectionString)(
  'breakout acceptance: authority and recovery between steps (PostgreSQL)',
  () => {
    const database = openAcceptanceDatabase(connectionString ?? '');
    const { db, prisma } = database;
    const { logger } = recordingLogger();
    const env: AcceptanceEnv = { db, logger, prisma };

    afterAll(async () => {
      await database.close();
    });

    /** A detected breakout whose bound actor is a session user or an API key. */
    async function detectedAs(kind: Kind): Promise<
      DetectedBreakout & {
        revoke: (world: AcceptanceWorld) => Promise<void>;
      }
    > {
      let keyId = '';
      const detected = await detectBreakout(env, {
        actor: async (world) => {
          if (kind !== 'API key')
            return {
              isApiKey: false,
              organizationId: world.organizationId,
              scopes: [],
              // Owners and admins see every brand, so only a creator can lose one.
              userId:
                kind === 'brand access' ? world.creator.id : world.owner.id,
            };
          const key = await seedApiKey(db, world, world.owner, [
            'posts:draft',
            'analytics:read',
          ]);
          keyId = key.id;
          return key.actor;
        },
        world: TWO_OUTPUTS,
      });
      const revoke = async (world: AcceptanceWorld) => {
        if (kind === 'membership')
          await revokeMembership(db, world, world.owner);
        else if (kind === 'brand access')
          await removeBrandAccess(db, world, world.creator);
        else await revokeApiKey(db, keyId);
      };
      return { ...detected, revoke };
    }

    async function breakoutPosts(organizationId: string) {
      return db.post.count({
        where: scopedWhere(organizationId, { breakoutOutputId: { not: null } }),
      });
    }

    async function collectionStopsWhenRevoked(kind: Kind) {
      const { authorization, candidate, harness, revoke, world } =
        await detectedAs(kind);
      const before = await db.postExposureObservation.count({
        where: { externalId: candidate.target.externalId },
      });
      await revoke(world);
      await expect(
        collectPost(harness, world, candidate.target, authorization),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        await db.postExposureObservation.count({
          where: { externalId: candidate.target.externalId },
        }),
      ).toBe(before);
    }

    it.each(['membership', 'API key'] as const)(
      'stops collection when the %s is revoked before the measurement is stored',
      collectionStopsWhenRevoked,
    );

    // TODO(#6526): the collection authorization's `admit` re-reads membership and the API key
    // but never asserts access to the brand being collected
    // (analytics-collection-actor.ts `authorize`: refreshWorkflowActor only calls
    // policy.resolve, not policy.assert(brandId)). A creator removed from the brand keeps
    // capturing its analytics and detecting breakouts; only execution later re-checks.
    it.fails('stops collection when brand access is removed before the measurement is stored', () =>
      collectionStopsWhenRevoked('brand access'));

    describe.each(['membership', 'brand access', 'API key'] as const)(
      'when the %s is revoked',
      (kind) => {
        it.each([
          'before pickup',
          'during planning',
          'during the provider call',
        ] as const)('holds the response %s', async (point: Point) => {
          const { harness, jobId, revoke, world } = await detectedAs(kind);
          const started = await startQueuedBreakoutExecution(
            harness,
            prisma,
            jobId,
          );
          if (point === 'before pickup') await revoke(world);
          else if (point === 'during planning')
            harness.hooks.duringPlanning = () => revoke(world);
          else harness.openRouter.onCall = () => revoke(world);

          await expect(started.run()).rejects.toBeInstanceOf(
            ForbiddenException,
          );
          expect(harness.openRouter.calls).toHaveLength(PROVIDER_CALLS[point]);
          // No output is ever drafted or bound once authority is gone.
          expect(await breakoutPosts(world.organizationId)).toBe(0);
          expect(harness.replicate.calls).toHaveLength(0);
        });
      },
    );

    it('blocks siblings behind an ambiguous provider attempt until it is reconciled, then completes without a second paid request', async () => {
      const { harness, jobId, response, world } =
        await detectedAs('membership');
      const started = await startQueuedBreakoutExecution(
        harness,
        prisma,
        jobId,
      );
      // The provider answers (and bills) while the actor's session ends: the caller never
      // records the answer, so the attempt is ambiguous.
      harness.openRouter.onCall = () =>
        revokeMembership(db, world, world.owner);
      await expect(started.run()).rejects.toBeInstanceOf(ForbiddenException);
      harness.openRouter.onCall = undefined;
      expect(harness.openRouter.calls).toHaveLength(1);
      const held = await db.creditReservation.findMany({
        where: scopedWhere(world.organizationId, {}),
      });
      expect(held).toHaveLength(1);
      expect(held[0]?.status).toBe('RESERVED');

      // Retried with authority restored, the retained attempt blocks the response.
      await restoreMembership(db, world, world.owner);
      const retry = await (
        await startQueuedBreakoutExecution(harness, prisma, jobId, {
          executionId: started.executionId,
        })
      ).run();
      expect(retry).toMatchObject({
        reason: 'provider_outcome_pending',
        status: 'processing',
      });
      expect(harness.openRouter.calls).toHaveLength(1);
      expect(
        await db.creditReservation.count({
          where: scopedWhere(world.organizationId, {}),
        }),
      ).toBe(1);
      const outputs = await db.breakoutResponseOutput.findMany({
        orderBy: { ordinal: 'asc' },
        where: scopedWhere(world.organizationId, { responseId: response.id }),
      });
      expect(outputs).toHaveLength(2);
      const [first, sibling] = [
        must(outputs[0], 'the quote output'),
        must(outputs[1], 'the sibling output'),
      ];
      // The sibling was never bound, generated or funded.
      expect(sibling.workflowExecutionId).toBeNull();
      expect(sibling.state).toBe('reserved');
      const recovery = await readBreakoutOutputRecovery(prisma, {
        brandId: world.brandId,
        credentialId: world.credentialId,
        organizationId: world.organizationId,
        outputId: first.id,
        platform: Platform.TWITTER,
        responseId: response.id,
      });
      expect(recovery).toMatchObject({ mayRepeatPaidRequest: false });

      // Reconciliation records the provider's answer; the same execution then completes.
      await reconcileAcceptedAttempt(harness, db, world, {
        executionId: started.executionId,
        issued: must(harness.openRouter.issued[0], 'the provider answer'),
        outputId: first.id,
      });
      const completed = await (
        await startQueuedBreakoutExecution(harness, prisma, jobId, {
          executionId: started.executionId,
        })
      ).run();
      expect(completed).toMatchObject({
        reason: 'brand_review_required',
        status: 'held',
      });
      // Only the sibling needed a new provider request.
      expect(harness.openRouter.calls).toHaveLength(2);
      const holds = await db.creditReservation.findMany({
        where: scopedWhere(world.organizationId, {}),
      });
      expect(holds).toHaveLength(4);
      for (const hold of holds) expect(hold.status).toBe('SETTLED');
      expect(await breakoutPosts(world.organizationId)).toBe(2);
    });
  },
);
