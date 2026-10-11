import { collectPost } from '@api/collections/outliers/services/breakout-acceptance.collection.fixture';
import {
  runQueuedBreakoutExecution,
  startQueuedBreakoutExecution,
} from '@api/collections/outliers/services/breakout-acceptance.execution.fixture';
import {
  type AcceptanceEnv,
  detectBreakout,
} from '@api/collections/outliers/services/breakout-acceptance.journey.fixture';
import {
  acceptanceDatabaseUrl,
  DAY_MS,
  MINUTE_MS,
  must,
  openAcceptanceDatabase,
  recordingLogger,
} from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { scopedWhere } from '@api/tenancy/scoped-where';
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
/** Two total outputs (the quote and one follow-up) keeps the scenarios that are not about volume quick. */
const TWO_OUTPUTS = {
  config: { postsPerWeek: 1, publishingCeilingPerWeek: 2 },
};

/**
 * Connected acceptance (#6526), stage 2: from a detected breakout, the queued
 * `breakout.response.execute` system action runs plan, reservation, generation, quality and
 * the output post. Only providers and catalogs are fake.
 */
describe.skipIf(!connectionString)(
  'breakout acceptance: priority execution (PostgreSQL)',
  () => {
    const database = openAcceptanceDatabase(connectionString ?? '');
    const { db, prisma } = database;
    const { logger } = recordingLogger();
    const env: AcceptanceEnv = { db, logger, prisma };

    afterAll(async () => {
      await database.close();
    });

    async function outputsOf(organizationId: string, responseId: string) {
      return db.breakoutResponseOutput.findMany({
        orderBy: { ordinal: 'asc' },
        where: scopedWhere(organizationId, { responseId }),
      });
    }

    async function reservationsOf(organizationId: string) {
      return db.creditReservation.findMany({
        orderBy: { createdAt: 'asc' },
        where: scopedWhere(organizationId, {}),
      });
    }

    it('runs plan, reservation, generation, quality and the output posts for five outputs counting the quote', async () => {
      const { candidate, harness, jobId, response, world } =
        await detectBreakout(env);
      const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
      expect(run.result).toMatchObject({
        reason: null,
        responseId: response.id,
        status: 'completed',
      });
      expect(run.result.outputIds).toHaveLength(5);

      const outputs = await outputsOf(world.organizationId, response.id);
      expect(outputs.map((output) => output.ordinal)).toEqual([1, 2, 3, 4, 5]);
      expect(outputs.map((output) => output.kind)).toEqual([
        'quote',
        'follow_up',
        'follow_up',
        'follow_up',
        'follow_up',
      ]);
      for (const output of outputs)
        expect(output.workflowExecutionId).toBe(run.executionId);

      const posts = await db.post.findMany({
        where: scopedWhere(world.organizationId, {
          breakoutOutputId: { in: outputs.map((output) => output.id) },
        }),
      });
      expect(posts).toHaveLength(5);
      const quote = must(
        posts.find((post) => post.breakoutOutputId === outputs[0]?.id),
        'the quote post',
      );
      expect(quote.quoteTweetId).toBe(candidate.target.externalId);
      expect(
        posts.filter((post) => post.id !== quote.id).map((p) => p.quoteTweetId),
      ).toEqual([null, null, null, null]);
      for (const post of posts) {
        expect(post.targetExecutionState).toBe('draft');
        expect(post.credentialId).toBe(world.credentialId);
        expect(post.agentStrategyId).toBe(world.strategyId);
      }
      expect(harness.openRouter.calls).toHaveLength(5);
      expect(harness.replicate.calls).toHaveLength(5);
      // The quote prompt asks for commentary on the source; follow-ups ask for a new angle.
      expect(harness.openRouter.calls[0]?.prompt).toContain('quote');

      // One generation hold and one quality hold per output, each settled exactly once.
      const holds = await reservationsOf(world.organizationId);
      expect(holds).toHaveLength(10);
      expect(new Set(holds.map((hold) => hold.idempotencyKey)).size).toBe(10);
      for (const hold of holds) expect(hold.status).toBe('SETTLED');
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

    it('never plans a sixth output', async () => {
      const { response, world } = await detectBreakout(env);
      await db.breakoutResponseOutput.create({
        data: {
          brandId: world.brandId,
          credentialId: world.credentialId,
          format: 'text',
          generationKey: 'sha256:v1:sixth-slot',
          kind: 'follow_up',
          ordinal: 5,
          organizationId: world.organizationId,
          responseId: response.id,
        },
      });
      await expect(
        db.breakoutResponseOutput.create({
          data: {
            brandId: world.brandId,
            credentialId: world.credentialId,
            format: 'text',
            generationKey: 'sha256:v1:six',
            kind: 'follow_up',
            ordinal: 6,
            organizationId: world.organizationId,
            responseId: response.id,
          },
        }),
      ).rejects.toThrow();
    });

    it('is idempotent: a worker retry of the same execution makes no second paid request', async () => {
      const { harness, jobId, response, world } = await detectBreakout(env, {
        world: TWO_OUTPUTS,
      });
      const started = await startQueuedBreakoutExecution(
        harness,
        prisma,
        jobId,
      );
      const first = await started.run();
      expect(first.status).toBe('completed');
      const callsAfterFirst = harness.openRouter.calls.length;
      const holdsAfterFirst = (await reservationsOf(world.organizationId))
        .length;

      const retried = await (
        await startQueuedBreakoutExecution(harness, prisma, jobId, {
          executionId: started.executionId,
        })
      ).run();
      expect(retried).toMatchObject({
        outputIds: first.outputIds,
        responseId: response.id,
        status: 'completed',
      });
      expect(harness.openRouter.calls).toHaveLength(callsAfterFirst);
      expect(harness.replicate.calls).toHaveLength(callsAfterFirst);
      expect(await reservationsOf(world.organizationId)).toHaveLength(
        holdsAfterFirst,
      );
      expect(await outputsOf(world.organizationId, response.id)).toHaveLength(
        first.outputIds.length,
      );
    });

    it('refuses a second execution for a response whose outputs another execution owns', async () => {
      const { harness, jobId, world } = await detectBreakout(env, {
        world: TWO_OUTPUTS,
      });
      await runQueuedBreakoutExecution(harness, prisma, jobId);
      const calls = harness.openRouter.calls.length;
      const holds = (await reservationsOf(world.organizationId)).length;

      await expect(
        runQueuedBreakoutExecution(harness, prisma, jobId),
      ).rejects.toThrow('breakout_execution_binding_conflict');
      expect(harness.openRouter.calls).toHaveLength(calls);
      expect(await reservationsOf(world.organizationId)).toHaveLength(holds);
    });

    describe('growth', () => {
      it('holds the response, with no spend, when growth has faded by execution time', async () => {
        const { authorization, candidate, harness, jobId, world } =
          await detectBreakout(env, { world: TWO_OUTPUTS });
        // The next measurement shows no further exposure: attention is no longer growing.
        await collectPost(harness, world, candidate.target, authorization);
        const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
        expect(run.result).toMatchObject({
          reason: 'growth_faded',
          status: 'held',
        });
        expect(harness.openRouter.calls).toHaveLength(0);
        expect(await reservationsOf(world.organizationId)).toHaveLength(0);
      });

      it('stops the response mid-flight when growth fades after the first outputs', async () => {
        const { authorization, candidate, harness, jobId, world } =
          await detectBreakout(env);
        harness.openRouter.onCall = async (index) => {
          if (index !== 1) return;
          await collectPost(harness, world, candidate.target, authorization);
        };
        await expect(
          runQueuedBreakoutExecution(harness, prisma, jobId),
        ).rejects.toThrow('growth_faded');
        // Output 1 completed, output 2 was in flight when attention faded; nothing further ran.
        expect(harness.openRouter.calls).toHaveLength(2);
        const outputs = await db.breakoutResponseOutput.findMany({
          where: scopedWhere(world.organizationId, {
            workflowExecutionId: { not: null },
          }),
        });
        expect(outputs.length).toBeLessThanOrEqual(2);
      });

      it('responds to an older post whose growth resumes, with no fixed 24 hour expiry', async () => {
        const threeDays = 3 * DAY_MS;
        const { candidate, harness, jobId, response, world } =
          await detectBreakout(env, {
            candidate: {
              // Compared at three days old, after a flat interval with no growth.
              earlier: [
                { ageMs: threeDays - 90 * MINUTE_MS, impressions: 400 },
                { ageMs: threeDays - 45 * MINUTE_MS, impressions: 400 },
              ],
              targetAgeMs: threeDays,
            },
            world: TWO_OUTPUTS,
          });
        expect(
          Date.now() - candidate.target.publishedAt.getTime(),
        ).toBeGreaterThan(24 * 60 * MINUTE_MS);
        expect(response.state).toBe('detected');
        const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
        expect(run.result).toMatchObject({
          reason: null,
          status: 'completed',
        });
        expect(run.result.outputIds).toHaveLength(2);
        expect(harness.openRouter.calls).toHaveLength(2);
        expect(world.strategyId).toBeTruthy();
      });
    });

    describe('known defects, pinned until fixed (TODO(#6526))', () => {
      // Lane K fix: fix/6526-breakout-attribution-scope. Flip to `it` and drop the
      // fixture's attribution shim when it merges.
      it.fails('executes with the production generation admission scope (strict budget attribution rejects credentialId)', async () => {
        const { harness, jobId } = await detectBreakout(env, {
          harness: { shimAttributionScope: false },
          world: TWO_OUTPUTS,
        });
        const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
        expect(run.result.status).toBe('completed');
      });

      // Approved-brand text always carries a hard `unknown` factual coverage check, so its
      // receipt is `needs_review` and the quality step throws after paid generation.
      it.fails('completes an approved-brand text output through quality with the production validator', async () => {
        const { harness, jobId } = await detectBreakout(env, {
          harness: { shimFactualCoverage: false },
          world: TWO_OUTPUTS,
        });
        const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
        expect(run.result.status).toBe('completed');
      });

      // Decided (coordinator, #6717 follows): a paid draft that needs brand review becomes a
      // held `awaiting_review` output instead of throwing; nothing auto-publishes, and a
      // member who can publish schedules it through the #6705 path. Enable with
      // fix/6526-breakout-brand-review-hold.
      it.todo(
        'holds a brand-review draft as awaiting_review (execute returns held brand_review_required), then a human schedules it and it publishes',
      );
    });
  },
);
