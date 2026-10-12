import { collectPost } from '@api/collections/outliers/services/breakout-acceptance.collection.fixture';
import { runQueuedBreakoutExecution } from '@api/collections/outliers/services/breakout-acceptance.execution.fixture';
import {
  type AcceptanceEnv,
  collectBreakout,
  type DetectOptions,
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
import type { BrandFactCheckOutcome } from '@api/services/brand-validation/brand-fact-check.types';
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

    /** The verdicts of a draft's factual claims (#6717), pinned for a scenario. */
    const factCheckOf = (
      verdicts: Array<'supported' | 'unverified' | 'contradicted'>,
    ): NonNullable<DetectOptions['factCheck']> => ({
      check: async (): Promise<BrandFactCheckOutcome> => ({
        claims: verdicts.map((verdict, index) => ({
          evidence:
            verdict === 'unverified'
              ? []
              : [
                  {
                    evidenceId: 'fact:approved-shipping',
                    origin: 'brand_os' as const,
                    quote: 'Shipping takes: two days',
                    ruleId: 'approved-shipping',
                  },
                ],
          id: `claim-${index + 1}`,
          origin: 'text' as const,
          source: 'Ships in two days',
          text: 'Orders ship in two days',
          verdict,
        })),
        knowledgeVersions: [],
        models: ['fake-judge'],
        status: 'checked',
      }),
    });
    const draftStates = async (organizationId: string) =>
      (
        await db.post.findMany({
          where: scopedWhere(organizationId, {
            breakoutOutputId: { not: null },
          }),
        })
      ).map((post) => post.targetExecutionState);
    const receiptStates = async (organizationId: string) =>
      (
        await db.brandedGenerationReceipt.findMany({
          where: scopedWhere(organizationId, {}),
        })
      ).map((receipt) => [receipt.state, receipt.compliance]);

    it('never auto-publishes a response that waits for a brand review, even with auto-publish on', async () => {
      const { harness, jobId, world } = await detectBreakout(env, {
        world: ONE_OUTPUT,
      });
      const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
      // With no fact check wired factual coverage stays unknown, so the receipt is never `ready`.
      expect(run.result).toMatchObject({
        reason: 'brand_review_required',
        status: 'held',
      });
      expect(await draftStates(world.organizationId)).toEqual([
        TargetExecutionState.DRAFT,
      ]);
    });

    it('auto-publishes only a draft whose every claim is supported (#6717)', async () => {
      const { harness, jobId, world } = await detectBreakout(env, {
        factCheck: factCheckOf(['supported', 'supported']),
        world: ONE_OUTPUT,
      });
      const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
      expect(run.result.status).toBe('completed');
      expect(await receiptStates(world.organizationId)).toContainEqual([
        'ready',
        'passed',
      ]);
      expect(await draftStates(world.organizationId)).toEqual([
        TargetExecutionState.SCHEDULED,
      ]);
    });

    it('holds a draft with an unverified claim for a member review, even with auto-publish on (#6717)', async () => {
      const { harness, jobId, world } = await detectBreakout(env, {
        factCheck: factCheckOf(['supported', 'unverified']),
        world: ONE_OUTPUT,
      });
      const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
      expect(run.result).toMatchObject({
        reason: 'brand_review_required',
        status: 'held',
      });
      expect(await receiptStates(world.organizationId)).toContainEqual([
        'needs_review',
        'unverified',
      ]);
      expect(await draftStates(world.organizationId)).toEqual([
        TargetExecutionState.DRAFT,
      ]);
    });

    it('blocks a draft with a contradicted claim and never publishes it (#6717)', async () => {
      const { harness, jobId, world } = await detectBreakout(env, {
        factCheck: factCheckOf(['supported', 'contradicted']),
        world: ONE_OUTPUT,
      });
      const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
      expect(run.result.status).toBe('held');
      expect(await receiptStates(world.organizationId)).toContainEqual([
        'blocked',
        'failed',
      ]);
      expect(await draftStates(world.organizationId)).not.toContain(
        TargetExecutionState.SCHEDULED,
      );
    });
  },
);
