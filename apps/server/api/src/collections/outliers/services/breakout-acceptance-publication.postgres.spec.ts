import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import type { WorkflowInitiatingActor } from '@api/authorization/brand-access/workflow-actor.util';
import { collectPost } from '@api/collections/outliers/services/breakout-acceptance.collection.fixture';
import { runQueuedBreakoutExecution } from '@api/collections/outliers/services/breakout-acceptance.execution.fixture';
import {
  type AcceptanceEnv,
  approveInReviewQueue,
  type DetectedBreakout,
  detectBreakout,
} from '@api/collections/outliers/services/breakout-acceptance.journey.fixture';
import {
  buildDeliveryHarness,
  type DeliveryHarness,
  principalOf,
  scheduleDraft as scheduleDirectly,
} from '@api/collections/outliers/services/breakout-acceptance.publication.fixture';
import {
  acceptanceDatabaseUrl,
  must,
  openAcceptanceDatabase,
  recordingLogger,
  removeBrandAccess,
  revokeApiKey,
  revokeMembership,
  seedApiKey,
} from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { Platform, TargetExecutionState } from '@genfeedai/contracts';
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
/** One publishing slot a week: the plan is exactly the X quote. */
const ONE_OUTPUT = {
  config: { postsPerWeek: 1, publishingCeilingPerWeek: 1 },
};
const REVIEW_ONLY = ['posts:draft', 'analytics:read'];
const PUBLISH_CAPABLE = [
  'posts:draft',
  'posts:schedule',
  'posts:publish',
  'analytics:read',
];

type Generator = 'owner session' | 'review-only key' | 'publishing key';

/**
 * Connected acceptance (#6526), stage 3: publication through the #6690 gate at schedule time
 * and at dispatch, through the worker's ScheduledPostDeliveryService with a fake X publisher.
 */
describe.skipIf(!connectionString)(
  'breakout acceptance: scheduled publication (PostgreSQL)',
  () => {
    const database = openAcceptanceDatabase(connectionString ?? '');
    const { db, prisma } = database;
    const { logger } = recordingLogger();
    const env: AcceptanceEnv = { db, logger, prisma };

    afterAll(async () => {
      await database.close();
    });

    type Scene = DetectedBreakout & {
      delivery: DeliveryHarness;
      generatorKey: { actor: WorkflowInitiatingActor; id: string } | null;
      outputId: string;
      postId: string;
    };

    /** A detected breakout executed by `generator`, leaving one reviewed-ready quote draft. */
    async function draftedBy(
      generator: Generator,
      options: { qualityScore?: number } = {},
    ): Promise<Scene> {
      let generatorKey: Scene['generatorKey'] = null;
      const detected = await detectBreakout(env, {
        actor: async (world) => {
          if (generator === 'owner session')
            return principalOf(world, world.owner);
          generatorKey = await seedApiKey(
            db,
            world,
            world.owner,
            generator === 'review-only key' ? REVIEW_ONLY : PUBLISH_CAPABLE,
          );
          return generatorKey.actor;
        },
        world: ONE_OUTPUT,
      });
      if (options.qualityScore !== undefined)
        detected.harness.replicate.score = options.qualityScore;
      const run = await runQueuedBreakoutExecution(
        detected.harness,
        prisma,
        detected.jobId,
      );
      expect(run.result).toMatchObject({
        reason: 'brand_review_required',
        status: 'held',
      });
      const outputId = must(run.result.outputIds[0], 'the quote output');
      const post = must(
        await db.post.findFirst({
          where: scopedWhere(detected.world.organizationId, {
            breakoutOutputId: outputId,
          }),
        }),
        'the quote draft',
      );
      return {
        ...detected,
        delivery: buildDeliveryHarness(db, prisma, logger, detected.world),
        generatorKey,
        outputId,
        postId: post.id,
      };
    }

    /**
     * A delivery that is held never reaches the provider: the worker either records a failed
     * target or the action throws before the provider call. Neither publishes.
     */
    async function deliverHeld(scene: Scene): Promise<void> {
      const outcome = await scene.delivery.deliver(scene.postId).then(
        (delivered) => delivered.result.success,
        () => 'threw' as const,
      );
      expect(outcome).not.toBe(true);
      expect(scene.delivery.published).toHaveLength(0);
      expect((await stateOf(scene)).targetExecutionState).not.toBe(
        TargetExecutionState.PUBLISHED,
      );
    }

    /**
     * A member approves the queued draft in the publishing inbox (the exact version), then the
     * principal schedules it. With no principal (a worker, a system path) only the raw
     * scheduling write exists.
     */
    async function scheduleDraft(
      harness: Scene['harness'],
      world: Scene['world'],
      postId: string,
      principal: BrandAccessActor | undefined,
    ): Promise<void> {
      const post = must(
        await db.post.findFirst({
          where: scopedWhere(world.organizationId, { id: postId }),
        }),
        'the draft',
      );
      if (post.reviewDecision !== 'APPROVED')
        await approveInReviewQueue(
          harness,
          db,
          world,
          postId,
          principalOf(world, world.owner),
        );
      await scheduleDirectly(harness, world, postId, principal);
    }

    const stateOf = async (scene: Scene) =>
      must(
        await db.post.findFirst({
          where: scopedWhere(scene.world.organizationId, { id: scene.postId }),
        }),
        'the post',
      );

    it('publishes the X quote linked to its source: schedule gate, dispatch gate, provider', async () => {
      const scene = await draftedBy('owner session');
      const { candidate, delivery, harness, world } = scene;
      // Generation held the paid draft for a member's brand review; nothing is scheduled yet.
      expect((await stateOf(scene)).targetExecutionState).toBe(
        TargetExecutionState.DRAFT,
      );
      const awaiting = await readBreakoutOutputRecovery(prisma, {
        brandId: world.brandId,
        credentialId: world.credentialId,
        organizationId: world.organizationId,
        outputId: scene.outputId,
        platform: Platform.TWITTER,
        responseId: scene.response.id,
      });
      expect(awaiting).toMatchObject({
        reason: 'brand_review_required',
        state: 'awaiting_review',
      });
      await expect(
        scheduleDirectly(
          harness,
          world,
          scene.postId,
          principalOf(world, world.owner),
        ),
      ).rejects.toThrow('brand_review_required');
      // A member approves it in the inbox, then schedules it: the gate admits that member.
      await scheduleDraft(
        harness,
        world,
        scene.postId,
        principalOf(world, world.owner),
      );
      expect((await stateOf(scene)).targetExecutionState).toBe(
        TargetExecutionState.SCHEDULED,
      );
      expect((await stateOf(scene)).quoteTweetId).toBe(
        candidate.target.externalId,
      );
      // The scheduler is remembered, so a worker with no request re-checks that person.
      const output = must(
        await db.breakoutResponseOutput.findFirst({
          where: scopedWhere(world.organizationId, { id: scene.outputId }),
        }),
        'the output',
      );
      expect(output.publicationActor).toMatchObject({ userId: world.owner.id });

      const { result } = await delivery.deliver(scene.postId);
      expect(result.success).toBe(true);
      expect(delivery.published).toHaveLength(1);
      expect(delivery.published[0]?.post?.quoteTweetId).toBe(
        candidate.target.externalId,
      );
      const published = await stateOf(scene);
      expect(published.targetExecutionState).toBe(
        TargetExecutionState.PUBLISHED,
      );
      expect(published.externalId).toBe(result.externalId);
      const recovery = await readBreakoutOutputRecovery(prisma, {
        brandId: world.brandId,
        credentialId: world.credentialId,
        organizationId: world.organizationId,
        outputId: scene.outputId,
        platform: Platform.TWITTER,
        responseId: scene.response.id,
      });
      expect(recovery).toMatchObject({
        reason: 'confirmed_publication',
        state: 'published',
      });
    });

    describe('quote linkage', () => {
      it('holds a quote whose link was tampered with before it is scheduled', async () => {
        const scene = await draftedBy('owner session');
        await db.post.updateMany({
          data: { quoteTweetId: 'someone-elses-post' },
          where: scopedWhere(scene.world.organizationId, {
            id: scene.postId,
          }),
        });
        await expect(
          scheduleDraft(
            scene.harness,
            scene.world,
            scene.postId,
            principalOf(scene.world, scene.world.owner),
          ),
        ).rejects.toThrow(
          /Breakout publication held: (artifact_binding_missing|quote_binding_changed)/,
        );
        expect((await stateOf(scene)).targetExecutionState).toBe(
          TargetExecutionState.DRAFT,
        );
      });

      it('holds a quote tampered with after scheduling before the provider is called', async () => {
        const scene = await draftedBy('owner session');
        await scheduleDraft(
          scene.harness,
          scene.world,
          scene.postId,
          principalOf(scene.world, scene.world.owner),
        );
        await db.post.updateMany({
          data: { quoteTweetId: 'someone-elses-post' },
          where: scopedWhere(scene.world.organizationId, {
            id: scene.postId,
          }),
        });
        // The approval's version pin covers the quote link, so the claim itself refuses.
        await expect(scene.delivery.deliver(scene.postId)).rejects.toThrow();
        expect(scene.delivery.published).toHaveLength(0);
      });
    });

    describe('publishing authority', () => {
      it('never lets a review-only key publish its own draft, or a worker with no human', async () => {
        const scene = await draftedBy('review-only key');
        const key = must(scene.generatorKey, 'the generating key');
        await expect(
          scheduleDraft(scene.harness, scene.world, scene.postId, key.actor),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          scheduleDraft(scene.harness, scene.world, scene.postId, undefined),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect((await stateOf(scene)).targetExecutionState).toBe(
          TargetExecutionState.DRAFT,
        );
        expect(scene.delivery.published).toHaveLength(0);
      });

      it('lets a human who can access the brand schedule what a review-only key drafted (#6705), and re-checks that human at dispatch', async () => {
        const scene = await draftedBy('review-only key');
        const { world } = scene;
        await scheduleDraft(
          scene.harness,
          world,
          scene.postId,
          principalOf(world, world.creator),
        );
        const output = must(
          await db.breakoutResponseOutput.findFirst({
            where: scopedWhere(world.organizationId, { id: scene.outputId }),
          }),
          'the output',
        );
        expect(output.publicationActor).toMatchObject({
          userId: world.creator.id,
        });
        const { result } = await scene.delivery.deliver(scene.postId);
        expect(result.success).toBe(true);
        expect(scene.delivery.published).toHaveLength(1);
      });

      it('refuses a member without access to the brand', async () => {
        const scene = await draftedBy('review-only key');
        await expect(
          scheduleDraft(
            scene.harness,
            scene.world,
            scene.postId,
            principalOf(scene.world, scene.world.outsider),
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('publishes a draft a publishing key generated once a member approved it, and dispatch needs no request', async () => {
        const scene = await draftedBy('publishing key');
        await scheduleDraft(
          scene.harness,
          scene.world,
          scene.postId,
          principalOf(scene.world, scene.world.owner),
        );
        const { result } = await scene.delivery.deliver(scene.postId);
        expect(result.success).toBe(true);
        expect(scene.delivery.published).toHaveLength(1);
      });
    });

    describe('authority revoked between scheduling and dispatch', () => {
      it.each(['membership', 'brand access', 'API key'] as const)(
        "holds the dispatch when the scheduler's %s is revoked",
        async (kind) => {
          const scene = await draftedBy('review-only key');
          const { world } = scene;
          let principal: BrandAccessActor;
          let revoke: () => Promise<void>;
          if (kind === 'API key') {
            const key = await seedApiKey(
              db,
              world,
              world.creator,
              PUBLISH_CAPABLE,
            );
            principal = key.actor;
            revoke = () => revokeApiKey(db, key.id);
          } else {
            principal = principalOf(world, world.creator);
            revoke =
              kind === 'membership'
                ? () => revokeMembership(db, world, world.creator)
                : () => removeBrandAccess(db, world, world.creator);
          }
          await scheduleDraft(scene.harness, world, scene.postId, principal);
          await revoke();

          await deliverHeld(scene);
        },
      );
    });

    describe('growth and cadence at publication', () => {
      it('holds scheduling when attention has faded', async () => {
        const scene = await draftedBy('owner session');
        const { authorization, candidate, harness, world } = scene;
        await collectPost(harness, world, candidate.target, authorization);
        await expect(
          scheduleDraft(
            harness,
            world,
            scene.postId,
            principalOf(world, world.owner),
          ),
        ).rejects.toThrow('growth_faded');
      });

      it('holds the dispatch when attention fades after scheduling', async () => {
        const scene = await draftedBy('owner session');
        const { authorization, candidate, harness, world } = scene;
        await scheduleDraft(
          harness,
          world,
          scene.postId,
          principalOf(world, world.owner),
        );
        await collectPost(harness, world, candidate.target, authorization);
        await deliverHeld(scene);
      });

      it('holds scheduling of a draft the platform quality gate blocked', async () => {
        const scene = await draftedBy('owner session', { qualityScore: 40 });
        const output = must(
          await db.breakoutResponseOutput.findFirst({
            where: scopedWhere(scene.world.organizationId, {
              id: scene.outputId,
            }),
          }),
          'the output',
        );
        expect(output).toMatchObject({
          heldReason: 'platform_quality_blocked',
          state: 'awaiting_review',
        });
        await expect(
          scheduleDraft(
            scene.harness,
            scene.world,
            scene.postId,
            principalOf(scene.world, scene.world.owner),
          ),
        ).rejects.toThrow('Breakout publication held');
        expect((await stateOf(scene)).targetExecutionState).toBe(
          TargetExecutionState.DRAFT,
        );
      });

      it('holds scheduling when the strategy policy now demands a higher quality score', async () => {
        const scene = await draftedBy('owner session');
        await db.agentStrategy.updateMany({
          data: { policies: { publishPolicy: { minPostScore: 99 } } },
          where: scopedWhere(scene.world.organizationId, {
            id: scene.world.strategyId,
          }),
        });
        await expect(
          scheduleDraft(
            scene.harness,
            scene.world,
            scene.postId,
            principalOf(scene.world, scene.world.owner),
          ),
        ).rejects.toThrow('Breakout publication held');
      });

      it('holds scheduling when the strategy was deactivated', async () => {
        const scene = await draftedBy('owner session');
        await db.agentStrategy.updateMany({
          data: { isActive: false },
          where: scopedWhere(scene.world.organizationId, {
            id: scene.world.strategyId,
          }),
        });
        await expect(
          scheduleDraft(
            scene.harness,
            scene.world,
            scene.postId,
            principalOf(scene.world, scene.world.owner),
          ),
        ).rejects.toThrow();
      });

      it('holds scheduling when the weekly publishing ceiling is already used', async () => {
        const scene = await draftedBy('owner session');
        const { world } = scene;
        await db.post.create({
          data: {
            agentStrategyId: world.strategyId,
            brandId: world.brandId,
            credentialId: world.credentialId,
            description: 'Another scheduled post using the only slot',
            organizationId: world.organizationId,
            platform: Platform.TWITTER,
            scheduledDate: new Date(Date.now() + 60 * 60_000),
            targetExecutionState: TargetExecutionState.SCHEDULED,
            userId: world.owner.id,
          },
        });
        await expect(
          scheduleDraft(
            scene.harness,
            world,
            scene.postId,
            principalOf(world, world.owner),
          ),
        ).rejects.toThrow();
        expect((await stateOf(scene)).targetExecutionState).toBe(
          TargetExecutionState.DRAFT,
        );
      });
    });

    it('still passes the dispatch gate on a worker retry after the delivery execution was restamped', async () => {
      const scene = await draftedBy('owner session');
      const { world } = scene;
      await scheduleDraft(
        scene.harness,
        world,
        scene.postId,
        principalOf(world, world.owner),
      );
      // The first delivery attempt fails transiently, so the target goes back to scheduled.
      scene.delivery.publisher.answer = async () => {
        throw Object.assign(new Error('Rate limit exceeded'), {
          code: 'rate_limit',
          isRetryable: true,
        });
      };
      const first = await scene.delivery.deliver(scene.postId);
      expect(first.result.success).toBe(false);
      expect((await stateOf(scene)).targetExecutionState).toBe(
        TargetExecutionState.SCHEDULED,
      );

      scene.delivery.publisher.answer = async () => ({
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'x-after-retry',
        platform: Platform.TWITTER,
        success: true,
        url: 'https://x.example/status',
      });
      const second = await scene.delivery.deliver(scene.postId);
      expect(second.executionId).not.toBe(first.executionId);
      expect(second.result.success).toBe(true);
      const published = await stateOf(scene);
      expect(published.targetExecutionState).toBe(
        TargetExecutionState.PUBLISHED,
      );
      expect(published.workflowExecutionId).toBe(second.executionId);
      expect(published.externalId).toBe('x-after-retry');
    });
  },
);
