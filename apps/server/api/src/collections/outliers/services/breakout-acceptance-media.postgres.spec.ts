import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import {
  type ExecutionHarness,
  runQueuedBreakoutExecution,
  startQueuedBreakoutExecution,
} from '@api/collections/outliers/services/breakout-acceptance.execution.fixture';
import {
  type AcceptanceEnv,
  approveInReviewQueue,
  type DetectedBreakout,
  detectBreakout,
} from '@api/collections/outliers/services/breakout-acceptance.journey.fixture';
import { VISUAL_GENERATION_CREDITS } from '@api/collections/outliers/services/breakout-acceptance.media.fixture';
import {
  buildDeliveryHarness,
  principalOf,
  scheduleDraft as scheduleDirectly,
} from '@api/collections/outliers/services/breakout-acceptance.publication.fixture';
import {
  type AcceptanceWorld,
  acceptanceDatabaseUrl,
  must,
  openAcceptanceDatabase,
  recordingLogger,
  type SourceMediaFormat,
  type WorldOptions,
} from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { Platform, TargetExecutionState } from '@genfeedai/contracts';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
  // The visual judge samples video frames through cloud storage.
  isSelfHostedDeployment: () => false,
}));
// A throwaway key for the credential and prompt round trips; not a secret.
vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'breakout-acceptance-test-key');
vi.setConfig({ testTimeout: 180_000 });

const connectionString = acceptanceDatabaseUrl();
/** The X quote and one visual follow-up. */
const TWO_OUTPUTS: WorldOptions = {
  config: { postsPerWeek: 1, publishingCeilingPerWeek: 2 },
};
/** The X quote and two visual follow-ups. */
const THREE_OUTPUTS: WorldOptions = {
  config: { postsPerWeek: 1, publishingCeilingPerWeek: 3 },
};

/**
 * Connected acceptance (#6526), media formats. A source post of a visual format is answered
 * by the X quote plus follow-ups of the same format: caption, visuals, composition and quality
 * run through the same admission, reservation and recovery as text. The only fakes are the
 * providers (text, image, video, the visual judge and the files probe).
 */
describe.skipIf(!connectionString)(
  'breakout acceptance: media formats (PostgreSQL)',
  () => {
    const database = openAcceptanceDatabase(connectionString ?? '');
    const { db, prisma } = database;
    const { logger } = recordingLogger();
    const env: AcceptanceEnv = { db, logger, prisma };

    afterAll(async () => {
      await database.close();
    });

    type Scene = DetectedBreakout & {
      executionId: string;
      outputIds: string[];
      result: Awaited<ReturnType<typeof runQueuedBreakoutExecution>>['result'];
    };

    async function generate(
      media: SourceMediaFormat,
      world: WorldOptions = TWO_OUTPUTS,
    ): Promise<Scene> {
      const detected = await detectBreakout(env, {
        candidate: { media },
        world,
      });
      const run = await runQueuedBreakoutExecution(
        detected.harness,
        prisma,
        detected.jobId,
      );
      return {
        ...detected,
        executionId: run.executionId,
        outputIds: run.result.outputIds,
        result: run.result,
      };
    }

    const outputsOf = (scene: Pick<Scene, 'response' | 'world'>) =>
      db.breakoutResponseOutput.findMany({
        orderBy: { ordinal: 'asc' },
        where: scopedWhere(scene.world.organizationId, {
          responseId: scene.response.id,
        }),
      });

    async function postOf(world: AcceptanceWorld, outputId: string) {
      return must(
        await db.post.findFirst({
          include: { ingredients: { orderBy: { groupIndex: 'asc' } } },
          where: scopedWhere(world.organizationId, {
            breakoutOutputId: outputId,
          }),
        }),
        'the output post',
      );
    }

    const recoveryOf = (
      scene: Pick<Scene, 'response' | 'world'>,
      outputId: string,
    ) =>
      readBreakoutOutputRecovery(prisma, {
        brandId: scene.world.brandId,
        credentialId: scene.world.credentialId,
        organizationId: scene.world.organizationId,
        outputId,
        platform: Platform.TWITTER,
        responseId: scene.response.id,
      });

    /** A member approves the queued draft in the inbox (the exact version), then schedules it. */
    async function approveAndSchedule(
      harness: ExecutionHarness,
      world: AcceptanceWorld,
      postId: string,
      principal: BrandAccessActor,
    ): Promise<void> {
      await approveInReviewQueue(
        harness,
        db,
        world,
        postId,
        principalOf(world, world.owner),
      );
      await scheduleDirectly(harness, world, postId, principal);
    }

    const holdsOf = (world: AcceptanceWorld) =>
      db.creditReservation.findMany({
        orderBy: { createdAt: 'asc' },
        where: scopedWhere(world.organizationId, {}),
      });

    it('generates, quality-gates and holds an image follow-up for review, then publishes it as the scheduling member', async () => {
      const scene = await generate('image');
      const { harness, world } = scene;
      expect(scene.result).toMatchObject({
        reason: 'brand_review_required',
        status: 'held',
      });
      const outputs = await outputsOf(scene);
      expect(outputs.map((output) => [output.kind, output.format])).toEqual([
        ['quote', 'text'],
        ['follow_up', 'image'],
      ]);

      // One image through the product's generation path, judged once, captioned once.
      expect(harness.mediaGateway.calls).toHaveLength(1);
      expect(harness.mediaGateway.calls[0]?.kind).toBe('image');
      expect(harness.visualJudge.calls).toHaveLength(1);
      expect(harness.openRouter.calls).toHaveLength(2);
      // The caption score and the quote score; the visual is judged separately.
      expect(harness.replicate.calls).toHaveLength(2);

      const imageOutput = must(outputs[1], 'the image output');
      const post = await postOf(world, imageOutput.id);
      expect(post.targetExecutionState).toBe(TargetExecutionState.DRAFT);
      expect(post.ingredients).toHaveLength(1);
      expect(post.ingredients[0]).toMatchObject({
        category: 'IMAGE',
        groupId: imageOutput.generationKey,
        status: 'GENERATED',
      });
      expect(await recoveryOf(scene, imageOutput.id)).toMatchObject({
        reason: 'brand_review_required',
        state: 'awaiting_review',
      });

      // Held for a member: scheduling it directly is refused until that review clears.
      await expect(
        scheduleDirectly(
          harness,
          world,
          post.id,
          principalOf(world, world.owner),
        ),
      ).rejects.toThrow('brand_review_required');

      const delivery = buildDeliveryHarness(db, prisma, logger, world);
      await approveAndSchedule(
        harness,
        world,
        post.id,
        principalOf(world, world.owner),
      );
      const output = must(
        await db.breakoutResponseOutput.findFirst({
          where: scopedWhere(world.organizationId, { id: imageOutput.id }),
        }),
        'the output',
      );
      expect(output.publicationActor).toMatchObject({ userId: world.owner.id });
      const { result } = await delivery.deliver(post.id);
      expect(result.success).toBe(true);
      expect(delivery.published).toHaveLength(1);
      expect(delivery.published[0]?.post?.id).toBe(post.id);
      const published = must(
        await db.post.findFirst({
          where: scopedWhere(world.organizationId, { id: post.id }),
        }),
        'the published post',
      );
      expect(published.targetExecutionState).toBe(
        TargetExecutionState.PUBLISHED,
      );
    });

    it('generates a carousel follow-up whose ordered ingredients survive the review pin and the dispatch fence', async () => {
      const scene = await generate('carousel');
      const { harness, world } = scene;
      const outputs = await outputsOf(scene);
      const carousel = must(outputs[1], 'the carousel output');
      expect(carousel.format).toBe('carousel');
      expect(harness.mediaGateway.calls).toHaveLength(3);
      expect(harness.visualJudge.calls).toHaveLength(3);

      const post = await postOf(world, carousel.id);
      expect(post.ingredients.map((item) => item.groupIndex)).toEqual([
        0, 1, 2,
      ]);
      expect(post.ingredients.map((item) => item.sourceActionId)).toEqual([
        `${carousel.generationKey}:media:1`,
        `${carousel.generationKey}:media:2`,
        `${carousel.generationKey}:media:3`,
      ]);

      const delivery = buildDeliveryHarness(db, prisma, logger, world);
      await approveAndSchedule(
        harness,
        world,
        post.id,
        principalOf(world, world.owner),
      );
      const { result } = await delivery.deliver(post.id);
      expect(result.success).toBe(true);
      const sent = delivery.published[0]?.post;
      expect(
        (sent?.ingredients ?? []).map((item: { id: string }) => item.id),
      ).toEqual(post.ingredients.map((item) => item.id));
    });

    it('generates a video follow-up, judges it from its frames and publishes it once the media gate passes', async () => {
      const scene = await generate('video');
      const { harness, world } = scene;
      const video = must((await outputsOf(scene))[1], 'the video output');
      expect(video.format).toBe('video');
      expect(harness.mediaGateway.calls[0]?.kind).toBe('video');
      expect(harness.visualJudge.calls[0]?.kind).toBe('video');
      const post = await postOf(world, video.id);
      expect(post.ingredients).toHaveLength(1);
      expect(post.ingredients[0]?.category).toBe('VIDEO');

      const delivery = buildDeliveryHarness(db, prisma, logger, world);
      await approveAndSchedule(
        harness,
        world,
        post.id,
        principalOf(world, world.owner),
      );
      const { result } = await delivery.deliver(post.id);
      expect(result.success).toBe(true);
      expect(delivery.published).toHaveLength(1);
    });

    it('holds a video behind the media readiness gate while its asset does not meet the channel limits, and never republishes the failed output', async () => {
      const scene = await generate('video');
      const { harness, world } = scene;
      const video = must((await outputsOf(scene))[1], 'the video output');
      const post = await postOf(world, video.id);

      const delivery = buildDeliveryHarness(db, prisma, logger, world);
      const conforming = delivery.files.probe;
      // The stored asset does not meet X's video limits (an unconverted master file).
      delivery.files.probe = async (url, kind) => ({
        ...(await conforming(url, kind)),
        audioCodec: 'opus',
        container: 'mov',
        height: 2160,
        videoCodec: 'hevc',
        width: 3840,
      });
      await approveAndSchedule(
        harness,
        world,
        post.id,
        principalOf(world, world.owner),
      );
      const held = await delivery.deliver(post.id);
      expect(held.result.success).toBe(false);
      expect(delivery.published).toHaveLength(0);
      expect(
        must(
          await db.post.findFirst({
            where: scopedWhere(world.organizationId, { id: post.id }),
          }),
          'the post',
        ).targetExecutionState,
      ).toBe(TargetExecutionState.FAILED);

      // A failed breakout publication is never repeated by scheduling the same output again.
      delivery.files.probe = conforming;
      await expect(
        scheduleDirectly(
          harness,
          world,
          post.id,
          principalOf(world, world.owner),
        ),
      ).rejects.toThrow('publication_failed');
      expect(delivery.published).toHaveLength(0);
    });

    it('keeps a short source a short and holds it where the channel publishes no shorts, spending nothing on it', async () => {
      const scene = await generate('short');
      const { harness } = scene;
      const outputs = await outputsOf(scene);
      // X publishes no short-form video: the answer is the text quote only, never a mislabeled
      // video, and no visual provider, judge or caption call is made for the short.
      expect(outputs.map((output) => output.format)).toEqual(['text']);
      expect(harness.mediaGateway.calls).toHaveLength(0);
      expect(harness.visualJudge.calls).toHaveLength(0);
      expect(harness.openRouter.calls).toHaveLength(1);
      expect(scene.result.outputIds).toHaveLength(1);
    });

    it('holds every visual follow-up while the shipped brand validator has no qualified media evidence, spending nothing on it', async () => {
      const detected = await detectBreakout(env, {
        candidate: { media: 'image' },
        harness: { isShippedMediaValidator: true },
        world: TWO_OUTPUTS,
      });
      const run = await runQueuedBreakoutExecution(
        detected.harness,
        prisma,
        detected.jobId,
      );
      // The validator blocks image and video admission, so X keeps only its text quote.
      expect(run.result.outputIds).toHaveLength(1);
      expect(
        (await outputsOf(detected)).map((output) => output.format),
      ).toEqual(['text']);
      expect(detected.harness.mediaGateway.calls).toHaveLength(0);
      expect(detected.harness.visualJudge.calls).toHaveLength(0);
    });

    it('counts a media output and the X quote inside the same five-output ceiling and budgets', async () => {
      const scene = await generate('image', {
        config: { postsPerWeek: 1, publishingCeilingPerWeek: 7 },
      });
      const { harness, world } = scene;
      const outputs = await outputsOf(scene);
      expect(outputs).toHaveLength(5);
      expect(outputs.map((output) => output.format)).toEqual([
        'text',
        'image',
        'image',
        'image',
        'image',
      ]);
      expect(harness.mediaGateway.calls).toHaveLength(4);
      expect(harness.visualJudge.calls).toHaveLength(4);

      // Quote: generation and quality. Each image: caption, visual, caption quality, visual
      // quality. Every hold is settled exactly once and attributed to its own format.
      const holds = await holdsOf(world);
      expect(holds).toHaveLength(2 + 4 * 4);
      expect(new Set(holds.map((hold) => hold.idempotencyKey)).size).toBe(
        holds.length,
      );
      for (const hold of holds) expect(hold.status).toBe('SETTLED');
      const formatOf = (hold: (typeof holds)[number]) =>
        (
          hold.metadata as {
            strategyBudgetAttribution?: { format?: string };
          } | null
        )?.strategyBudgetAttribution?.format;
      expect(holds.filter((hold) => formatOf(hold) === 'text')).toHaveLength(2);
      expect(holds.filter((hold) => formatOf(hold) === 'image')).toHaveLength(
        16,
      );
      const visualHolds = holds.filter((hold) =>
        hold.workloadId?.includes(':media:'),
      );
      expect(visualHolds).toHaveLength(4);
      for (const hold of visualHolds)
        expect(hold.settledAmount).toBe(VISUAL_GENERATION_CREDITS);
      const wallet = must(
        await db.creditBalance.findFirst({
          where: { billingAccountId: world.billingAccountId },
        }),
        'the wallet',
      );
      expect(wallet.heldAmount).toBe(0);
      expect(wallet.balance).toBe(
        1000 - holds.reduce((sum, hold) => sum + (hold.settledAmount ?? 0), 0),
      );
    });

    it('treats an ambiguous media provider attempt like a text one: siblings blocked until reconciled, no second paid request', async () => {
      const detected = await detectBreakout(env, {
        candidate: { media: 'image' },
        world: THREE_OUTPUTS,
      });
      const { harness, world } = detected;
      // The provider placed its hold and the wait ended without an asset.
      harness.mediaGateway.isSilent = true;
      const started = await startQueuedBreakoutExecution(
        harness,
        prisma,
        detected.jobId,
      );
      const first = await started.run();
      expect(first).toMatchObject({
        reason: 'provider_outcome_pending',
        status: 'processing',
      });
      const outputs = await outputsOf(detected);
      // The quote finished; the first image follow-up is ambiguous; the last never started.
      expect(first.outputIds).toHaveLength(2);
      expect(outputs[2]?.workflowExecutionId).toBeNull();
      expect(harness.mediaGateway.calls).toHaveLength(1);
      const callsBefore = {
        judge: harness.visualJudge.calls.length,
        openRouter: harness.openRouter.calls.length,
      };
      expect(await recoveryOf(detected, must(outputs[1]).id)).toMatchObject({
        mayRepeatPaidRequest: false,
        state: 'generation_in_flight',
      });

      // A worker retry of the same execution does not pay again.
      const retry = await startQueuedBreakoutExecution(
        harness,
        prisma,
        detected.jobId,
        { executionId: started.executionId },
      );
      expect(await retry.run()).toMatchObject({
        reason: 'provider_outcome_pending',
        status: 'processing',
      });
      expect(harness.mediaGateway.calls).toHaveLength(1);
      expect(harness.visualJudge.calls).toHaveLength(callsBefore.judge);
      expect(harness.openRouter.calls).toHaveLength(callsBefore.openRouter);
      expect((await outputsOf(detected))[2]?.workflowExecutionId).toBeNull();
      // The unreleased hold stays reserved: the money is not freed on an unknown outcome.
      const retained = (await holdsOf(world)).filter((hold) =>
        hold.workloadId?.includes(':media:'),
      );
      expect(retained.map((hold) => hold.status)).toEqual(['RESERVED']);
    });
  },
);
