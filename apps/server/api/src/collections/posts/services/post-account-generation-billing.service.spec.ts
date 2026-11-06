import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { PostAccountGenerationBillingService } from '@api/collections/posts/services/post-account-generation-billing.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface Hold {
  amount: number;
  id: string;
  idempotencyKey?: string;
  parentId?: string;
  status: 'RELEASED' | 'RESERVED' | 'SETTLED';
  workloadId: string;
  workloadType: string;
}

interface Settlement {
  amount: number;
  key: string;
  reservationId: string;
}

const scope = {
  actorUserId: 'user-1',
  brandId: 'brand-1',
  organizationId: 'org-1',
};
const MODEL = 'openai/gpt-5-mini';
const run = (dispatchCount: number, model = MODEL) => ({
  dispatchCount,
  model,
  runId: 'run-1',
  scope,
});
const funding = {
  apiKey: undefined,
  creditsPerDispatch: 2,
  poolReservationId: 'pool-1',
};

describe('PostAccountGenerationBillingService', () => {
  // The organization wallet: a balance, the holds on it and its settlements.
  let balance: number;
  let holds: Hold[];
  let settlements: Settlement[];
  let warnings: string[];
  let byokKey: string | undefined;
  let modelCost: number | undefined;
  let isWalletRaced: boolean;
  let isLedgerDown: boolean;
  let service: PostAccountGenerationBillingService;

  const held = () =>
    holds
      .filter(({ parentId, status }) => !parentId && status === 'RESERVED')
      .reduce((sum, { amount }) => sum + amount, 0);
  const hold = (id: string) => holds.find((candidate) => candidate.id === id);
  const seedPool = () => {
    holds.push({
      amount: 10,
      id: 'pool-1',
      status: 'RESERVED',
      workloadId: 'run-1',
      workloadType: 'generation',
    });
  };

  beforeEach(() => {
    balance = 3;
    holds = [];
    settlements = [];
    warnings = [];
    byokKey = undefined;
    modelCost = 2;
    isWalletRaced = false;
    isLedgerDown = false;

    const credits = {
      bindReservationOutput: async (input: {
        amount: number;
        reservationId: string;
        workloadId: string;
        workloadType: string;
      }) => {
        const child: Hold = {
          amount: input.amount,
          id: `hold-${holds.length}`,
          parentId: input.reservationId,
          status: 'RESERVED',
          workloadId: input.workloadId,
          workloadType: input.workloadType,
        };
        holds.push(child);
        return child;
      },
      checkOrganizationCreditsAvailable: async (_org: string, amount: number) =>
        balance - held() >= amount,
      getOrganizationCreditsBalance: async () => balance,
      releaseReservation: async ({
        reservationId,
      }: {
        reservationId: string;
      }) => {
        if (isLedgerDown) throw new Error('db down');
        Object.assign(hold(reservationId) ?? {}, { status: 'RELEASED' });
      },
      reserveCredits: async (input: {
        amount: number;
        idempotencyKey: string;
        workloadId: string;
        workloadType: string;
      }) => {
        if (isLedgerDown) throw new Error('db down');
        if (isWalletRaced) {
          throw new BusinessLogicException('short', {}, 'INSUFFICIENT_CREDITS');
        }
        const pool: Hold = {
          amount: input.amount,
          id: `pool-${holds.length + 1}`,
          idempotencyKey: input.idempotencyKey,
          status: 'RESERVED',
          workloadId: input.workloadId,
          workloadType: input.workloadType,
        };
        holds.push(pool);
        return pool;
      },
      settleReservation: async (input: {
        actualAmount: number;
        reservationId: string;
        settlementIdempotencyKey: string;
      }) => {
        settlements.push({
          amount: input.actualAmount,
          key: input.settlementIdempotencyKey,
          reservationId: input.reservationId,
        });
        Object.assign(hold(input.reservationId) ?? {}, { status: 'SETTLED' });
      },
    };
    const models = {
      findOne: async ({ key }: { key: string }) =>
        key === MODEL && modelCost !== undefined
          ? { cost: modelCost, pricingType: 'flat' }
          : null,
    };
    const textCredits = {
      resolveDispatch: async () =>
        byokKey ? { keys: { openrouter: byokKey } } : undefined,
    };

    service = new PostAccountGenerationBillingService(
      credits as unknown as CreditsUtilsService,
      models as unknown as ModelsService,
      textCredits as unknown as TextGenerationCreditsService,
      {
        warn: (message: string) => {
          warnings.push(message);
        },
      } as unknown as LoggerService,
    );
  });

  describe('reserveRun', () => {
    it('holds the whole run once, before any dispatch', async () => {
      balance = 100;

      await expect(service.reserveRun(run(5))).resolves.toEqual({
        apiKey: undefined,
        creditsPerDispatch: 2,
        poolReservationId: 'pool-1',
      });
      expect(holds).toEqual([
        {
          amount: 10,
          id: 'pool-1',
          idempotencyKey: 'generation:account-text:run-1',
          status: 'RESERVED',
          workloadId: 'run-1',
          workloadType: 'generation',
        },
      ]);
    });

    it('keeps credit-funded batches above 50 wallet-capped', async () => {
      balance = 1_000;

      await service.reserveRun(run(51));

      expect(holds.map(({ amount }) => amount)).toEqual([102]);
    });

    it('refuses with a 402 when the balance cannot cover every dispatch', async () => {
      await expect(service.reserveRun(run(5))).rejects.toMatchObject({
        response: { detail: 'Insufficient credits: 10 required, 3 available' },
        status: 402,
      });
      expect(holds).toEqual([]);
    });

    it('maps a lost race on the wallet to the same 402', async () => {
      balance = 100;
      isWalletRaced = true;

      await expect(service.reserveRun(run(5))).rejects.toMatchObject({
        status: 402,
      });
      expect(holds).toEqual([]);
    });

    it('lets other reservation failures through unchanged', async () => {
      isLedgerDown = true;

      await expect(service.reserveRun(run(1))).rejects.toThrow('db down');
    });

    it.each([
      ['the org brings its own key', 'byok-key', 2, 'byok-key'],
      ['the model is free', undefined, 0, undefined],
    ])('takes no hold when %s', async (_case, key, cost, apiKey) => {
      byokKey = key;
      modelCost = cost;

      await expect(service.reserveRun(run(5))).resolves.toEqual({
        apiKey,
        creditsPerDispatch: 0,
        poolReservationId: null,
      });
      expect(holds).toEqual([]);
    });

    it.each([
      ['BYOK', 'byok-key', 2],
      ['free model', undefined, 0],
    ])(
      'rejects more than 50 dispatches for an unfunded %s run',
      async (_kind, key, cost) => {
        byokKey = key;
        modelCost = cost;

        await expect(service.reserveRun(run(51))).rejects.toMatchObject({
          response: { code: 'account_generation_batch_limit' },
          status: 400,
        });
        expect(holds).toEqual([]);
      },
    );

    it('refuses missing model pricing rather than treating it as free', async () => {
      modelCost = undefined;

      await expect(service.reserveRun(run(2))).rejects.toMatchObject({
        status: 503,
      });
      expect(holds).toEqual([]);
    });
  });

  describe('queued funding', () => {
    it('never switches a funded platform run to a new BYOK key', async () => {
      byokKey = 'new-key';

      await expect(
        service.queuedApiKey(MODEL, scope, false),
      ).resolves.toBeUndefined();
    });

    it('rechecks paid BYOK access at worker dispatch and refuses missing keys', async () => {
      await expect(
        service.queuedApiKey(MODEL, scope, true),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('uses the current organization key without reserving credits for BYOK', async () => {
      byokKey = 'current-key';

      await expect(service.queuedApiKey(MODEL, scope, true)).resolves.toBe(
        'current-key',
      );
      expect(holds).toEqual([]);
    });
  });

  describe('per dispatch', () => {
    beforeEach(() => {
      seedPool();
    });

    it('carves the dispatch share out of the pool under the text workload type', async () => {
      const holdId = await service.bindDispatch(funding, scope, 'run-1:0');

      expect(hold(holdId ?? '')).toEqual({
        amount: 2,
        id: holdId,
        parentId: 'pool-1',
        status: 'RESERVED',
        workloadId: 'run-1:0',
        workloadType: 'text-generation',
      });
    });

    it('binds nothing when the run holds nothing', async () => {
      await expect(
        service.bindDispatch(
          { ...funding, poolReservationId: null },
          scope,
          'run-1:0',
        ),
      ).resolves.toBeNull();
      expect(holds).toHaveLength(1);
    });

    it('settles the dispatch hold at its known price, idempotently per dispatch', async () => {
      const holdId =
        (await service.bindDispatch(funding, scope, 'run-1:0')) ?? '';

      await service.settleDispatch(funding, scope, holdId, 'run-1:0');

      expect(settlements).toEqual([
        {
          amount: 2,
          key: 'text-generation:run-1:0:settled',
          reservationId: holdId,
        },
      ]);
      expect(hold(holdId)?.status).toBe('SETTLED');
    });

    it('returns an unused dispatch hold and the unclaimed remainder', async () => {
      const holdId =
        (await service.bindDispatch(funding, scope, 'run-1:0')) ?? '';

      await service.releaseDispatch(scope, holdId);
      await service.releaseRun(funding, scope);

      expect(holds.map(({ status }) => status)).toEqual([
        'RELEASED',
        'RELEASED',
      ]);
    });

    it('never fails the run when a release fails; expiry returns the hold', async () => {
      isLedgerDown = true;

      await expect(service.releaseRun(funding, scope)).resolves.toBeUndefined();
      expect(hold('pool-1')?.status).toBe('RESERVED');
      expect(warnings).toEqual([
        'PostAccountGenerationBillingService release failed',
      ]);
    });

    it('has nothing to release for a hold-free run', async () => {
      await service.releaseRun({ ...funding, poolReservationId: null }, scope);

      expect(hold('pool-1')?.status).toBe('RESERVED');
    });
  });
});
