import { runQueuedBreakoutExecution } from '@api/collections/outliers/services/breakout-acceptance.execution.fixture';
import {
  type AcceptanceEnv,
  detectBreakout,
} from '@api/collections/outliers/services/breakout-acceptance.journey.fixture';
import {
  acceptanceDatabaseUrl,
  must,
  openAcceptanceDatabase,
  recordingLogger,
} from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { readBreakoutLiveCapacity } from '@api/collections/outliers/services/breakout-live-capacity.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { Platform } from '@genfeedai/contracts';
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

/** Every generated text output costs 2 generation + 1 quality credits in these fixtures. */
const OUTPUT_COST = 3;

function budget(
  overrides: {
    monthly?: number;
    perFormat?: number;
    perPlatform?: number;
  } = {},
) {
  return {
    policies: {
      budgetPolicy: {
        monthlyCreditBudget: overrides.monthly ?? 5000,
        perFormatCaps:
          overrides.perFormat === undefined
            ? []
            : [{ creditBudget: overrides.perFormat, key: 'text' }],
        perPlatformCaps:
          overrides.perPlatform === undefined
            ? []
            : [{ creditBudget: overrides.perPlatform, key: Platform.TWITTER }],
      },
    },
  };
}

/**
 * Connected acceptance (#6526): the monthly budget and the platform and format sub-budgets
 * hold the response before any spend, and what is spent is counted exactly once.
 */
describe.skipIf(!connectionString)(
  'breakout acceptance: budgets (PostgreSQL)',
  () => {
    const database = openAcceptanceDatabase(connectionString ?? '');
    const { db, prisma } = database;
    const { logger } = recordingLogger();
    const env: AcceptanceEnv = { db, logger, prisma };

    afterAll(async () => {
      await database.close();
    });

    it.each([
      ['monthly budget', { world: budget({ monthly: 1 }) }],
      ['platform sub-budget', { world: budget({ perPlatform: 1 }) }],
      ['format sub-budget', { world: budget({ perFormat: 1 }) }],
      ['daily budget', { world: { config: { dailyCreditBudget: 1 } } }],
      ['wallet balance', { world: { balance: 1 } }],
    ])(
      'holds the response with no spend when the %s cannot fund one output',
      async (_name, options) => {
        const { harness, jobId, response, world } = await detectBreakout(
          env,
          options,
        );
        const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
        expect(run.result.status).toBe('held');
        expect(run.result.reason).toBeTruthy();
        expect(run.result.outputIds).toHaveLength(0);
        expect(harness.openRouter.calls).toHaveLength(0);
        expect(harness.replicate.calls).toHaveLength(0);
        expect(
          await db.creditReservation.count({
            where: scopedWhere(world.organizationId, {}),
          }),
        ).toBe(0);
        expect(
          await db.post.count({
            where: scopedWhere(world.organizationId, {
              breakoutOutputId: { not: null },
            }),
          }),
        ).toBe(0);
        expect(
          await db.breakoutResponseOutput.count({
            where: scopedWhere(world.organizationId, {
              responseId: response.id,
            }),
          }),
        ).toBe(0);
      },
    );

    it('shrinks the plan to what the budgets fund and counts each credit once afterwards', async () => {
      const { harness, jobId, response, world } = await detectBreakout(env, {
        // The sub-budgets bind; the monthly budget is large so spend pacing stays out of it.
        world: budget({ perFormat: 10, perPlatform: 10 }),
      });
      const run = await runQueuedBreakoutExecution(harness, prisma, jobId);
      // 10 credits fund three outputs at 3 credits each, with the quote first.
      // Every approved-brand draft waits in the review inbox, so the response reports the hold.
      expect(run.result).toMatchObject({
        reason: 'brand_review_required',
        status: 'held',
      });
      expect(run.result.outputIds).toHaveLength(3);
      const outputs = await db.breakoutResponseOutput.findMany({
        orderBy: { ordinal: 'asc' },
        where: scopedWhere(world.organizationId, { responseId: response.id }),
      });
      expect(outputs.map((output) => output.kind)).toEqual([
        'quote',
        'follow_up',
        'follow_up',
      ]);

      const holds = await db.creditReservation.findMany({
        where: scopedWhere(world.organizationId, {}),
      });
      expect(holds).toHaveLength(6);
      expect(new Set(holds.map((hold) => hold.idempotencyKey)).size).toBe(6);
      const spent = holds.reduce(
        (sum, hold) => sum + (hold.settledAmount ?? 0),
        0,
      );
      expect(spent).toBe(3 * OUTPUT_COST);

      // Settled holds and the ledger describe the same spend: neither is added twice.
      const capacity = await readBreakoutLiveCapacity(prisma, {
        brandId: world.brandId,
        credentialId: world.credentialId,
        nowMs: Date.now(),
        organizationId: world.organizationId,
        platform: Platform.TWITTER,
        strategyId: world.strategyId,
      });
      expect(capacity.status).toBe('available');
      if (capacity.status !== 'available') return;
      expect(capacity.budget.remainingMonthlyCredits).toBe(5000 - spent);
      expect(capacity.budget.remainingPlatformCredits).toBe(10 - spent);
      expect(capacity.budget.remainingFormatCredits.text).toBe(10 - spent);
      const wallet = must(
        await db.creditBalance.findFirst({
          where: { billingAccountId: world.billingAccountId },
        }),
        'the wallet',
      );
      expect(wallet.balance).toBe(1000 - spent);
      expect(wallet.heldAmount).toBe(0);
    });
  },
);
