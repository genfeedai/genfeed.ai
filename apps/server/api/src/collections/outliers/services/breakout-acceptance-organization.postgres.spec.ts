import { collectPost } from '@api/collections/outliers/services/breakout-acceptance.collection.fixture';
import { runQueuedBreakoutExecution } from '@api/collections/outliers/services/breakout-acceptance.execution.fixture';
import {
  type AcceptanceEnv,
  collectBreakout,
  detectBreakout,
} from '@api/collections/outliers/services/breakout-acceptance.journey.fixture';
import {
  buildDeliveryHarness,
  principalOf,
  scheduleDraft,
} from '@api/collections/outliers/services/breakout-acceptance.publication.fixture';
import {
  acceptanceDatabaseUrl,
  must,
  openAcceptanceDatabase,
  recordingLogger,
  seedAcceptanceWorld,
} from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { TargetExecutionState } from '@genfeedai/contracts';
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

/**
 * Connected acceptance (#6526): the organization's own opt-ins gate the response. An
 * organization that has breakout responses off keeps its detection and spends nothing; turning
 * the setting off mid-flight holds the execution and the publication.
 */
describe.skipIf(!connectionString)(
  'breakout acceptance: organization opt-ins (PostgreSQL)',
  () => {
    const database = openAcceptanceDatabase(connectionString ?? '');
    const { db, prisma } = database;
    const { logger } = recordingLogger();
    const env: AcceptanceEnv = { db, logger, prisma };

    afterAll(async () => {
      await database.close();
    });

    const setOrganization = (
      organizationId: string,
      data: {
        isBreakoutAutoPublishEnabled?: boolean;
        isBreakoutResponsesEnabled?: boolean;
      },
    ) =>
      db.organizationSetting.update({
        data,
        where: { organizationId },
      });

    it('is off for a freshly created settings row', async () => {
      const world = await seedAcceptanceWorld(db);
      await db.organizationSetting.delete({
        where: { organizationId: world.organizationId },
      });
      const created = await db.organizationSetting.create({
        data: { organizationId: world.organizationId },
      });
      expect(created).toMatchObject({
        isBrandVisionChecksEnabled: false,
        isBreakoutAutoPublishEnabled: false,
        isBreakoutResponsesEnabled: false,
      });
    });

    it('keeps the detection but enqueues and spends nothing while breakout responses are off', async () => {
      const detected = await collectBreakout(env, {
        world: { isBreakoutResponsesEnabled: false },
      });
      const { candidate, harness, response, world } = detected;
      expect(response.state).toBe('detected');
      expect(detected.jobId).toBeUndefined();
      expect(harness.interactive.adds).toHaveLength(0);
      expect(harness.interactive.jobs.size).toBe(0);
      // The observation and its comparison receipt are kept: detection data stays useful.
      expect(
        await db.postExposureObservation.count({
          where: { externalId: candidate.target.externalId },
        }),
      ).toBe(2);
      expect(
        await db.breakoutBaselineReceipt.count({
          where: { id: response.triggerReceiptId },
        }),
      ).toBe(1);
      expect(
        await db.creditReservation.count({
          where: scopedWhere(world.organizationId, {}),
        }),
      ).toBe(0);
      expect(harness.openRouter.calls).toHaveLength(0);
      expect(harness.replicate.calls).toHaveLength(0);
    });

    it('queues the still detected response on the next collection once the organization turns responses on', async () => {
      const detected = await collectBreakout(env, {
        world: { isBreakoutResponsesEnabled: false },
      });
      const { authorization, candidate, harness, world } = detected;
      expect(harness.interactive.adds).toHaveLength(0);
      await setOrganization(world.organizationId, {
        isBreakoutResponsesEnabled: true,
      });
      await collectPost(harness, world, candidate.target, authorization);
      expect(harness.interactive.adds).toHaveLength(1);
      expect(
        await db.breakoutResponse.count({
          where: scopedWhere(world.organizationId, {}),
        }),
      ).toBe(1);
    });

    it('holds an execution already queued, with org_breakout_disabled, when the setting is turned off', async () => {
      const { harness, jobId, response, world } = await detectBreakout(env);
      await setOrganization(world.organizationId, {
        isBreakoutResponsesEnabled: false,
      });
      const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
      expect(run.result).toMatchObject({
        outputIds: [],
        reason: 'org_breakout_disabled',
        status: 'held',
      });
      expect(harness.openRouter.calls).toHaveLength(0);
      expect(harness.replicate.calls).toHaveLength(0);
      expect(
        await db.creditReservation.count({
          where: scopedWhere(world.organizationId, {}),
        }),
      ).toBe(0);
      expect(
        await db.breakoutResponseOutput.count({
          where: scopedWhere(world.organizationId, { responseId: response.id }),
        }),
      ).toBe(0);
    });

    it('holds the publication of a draft when the setting is turned off after it was generated', async () => {
      const detected = await detectBreakout(env, { world: ONE_OUTPUT });
      const { harness, jobId, world } = detected;
      const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
      expect(run.result).toMatchObject({
        reason: 'brand_review_required',
        status: 'held',
      });
      const outputId = must(run.result.outputIds[0], 'the quote output');
      const post = must(
        await db.post.findFirst({
          where: scopedWhere(world.organizationId, {
            breakoutOutputId: outputId,
          }),
        }),
        'the quote draft',
      );
      const delivery = buildDeliveryHarness(db, prisma, logger, world);
      await setOrganization(world.organizationId, {
        isBreakoutResponsesEnabled: false,
      });
      await expect(
        scheduleDraft(harness, world, post.id, principalOf(world, world.owner)),
      ).rejects.toThrow('org_breakout_disabled');
      const after = must(
        await db.post.findFirst({
          where: scopedWhere(world.organizationId, { id: post.id }),
        }),
        'the draft',
      );
      expect(after.targetExecutionState).toBe(TargetExecutionState.DRAFT);
      expect(delivery.published).toHaveLength(0);
    });

    it('never auto-publishes a response that waits for a brand review, even with auto-publish on', async () => {
      const { harness, jobId, world } = await detectBreakout(env, {
        world: ONE_OUTPUT,
      });
      const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
      // Factual coverage is still unverified (#6717), so the receipt is never `ready`.
      expect(run.result).toMatchObject({
        reason: 'brand_review_required',
        status: 'held',
      });
      const posts = await db.post.findMany({
        where: scopedWhere(world.organizationId, {
          breakoutOutputId: { not: null },
        }),
      });
      expect(posts).toHaveLength(1);
      expect(posts.map((post) => post.targetExecutionState)).toEqual([
        TargetExecutionState.DRAFT,
      ]);
    });
  },
);
