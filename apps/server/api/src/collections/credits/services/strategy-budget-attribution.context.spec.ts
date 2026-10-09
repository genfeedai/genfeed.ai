import {
  admitStrategyBudgetReservation,
  runWithStrategyBudgetAttribution,
  type StrategyBudgetAttribution,
  strategyBudgetMetadata,
} from '@api/collections/credits/services/strategy-budget-attribution.context';
import { Platform } from '@genfeedai/contracts';
import type { IReserveCreditsInput } from '@genfeedai/contracts/interfaces/billing';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const scope: StrategyBudgetAttribution = {
  version: 1,
  organizationId: 'org-a',
  brandId: 'brand-a',
  strategyId: 'strategy-a',
  platform: Platform.TWITTER,
  format: 'text',
};
function fixture() {
  const findFirst = vi.fn(async () => ({
    id: scope.strategyId,
    platforms: [scope.platform],
  }));
  const tx = { agentStrategy: { findFirst } } as unknown as Pick<
    Prisma.TransactionClient,
    'agentStrategy'
  >;
  return { tx, findFirst };
}
describe('server strategy credit attribution', () => {
  it('carries only the internal admission closure to nested normal credit producers', async () => {
    const h = fixture();
    const credits: IReserveCreditsInput = {
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      actorUserId: 'user-a',
      amount: 5,
      idempotencyKey: 'key-a',
    };
    const tx = h.tx as unknown as Prisma.TransactionClient;
    const admission = vi.fn(
      async (
        _tx: Prisma.TransactionClient,
        _input: Readonly<IReserveCreditsInput>,
      ) => undefined,
    );
    await runWithStrategyBudgetAttribution(
      h.tx,
      scope,
      async () => {
        await Promise.resolve();
        await admitStrategyBudgetReservation(tx, credits);
        expect(admission).toHaveBeenCalledWith(tx, credits);
        await expect(
          admitStrategyBudgetReservation(tx, {
            ...credits,
            organizationId: 'foreign',
          }),
        ).rejects.toThrow('scope changed');
        await expect(
          admitStrategyBudgetReservation(tx, {
            ...credits,
            brandId: 'foreign',
          }),
        ).rejects.toThrow('scope changed');
        expect(admission).toHaveBeenCalledTimes(1);
      },
      admission,
    );
    await admitStrategyBudgetReservation(tx, credits);
    expect(admission).toHaveBeenCalledTimes(1);
  });
  it('strips caller-supplied allocation while preserving unrelated ledger metadata', () => {
    expect(
      strategyBudgetMetadata(scope.organizationId, {
        assetId: 'asset-a',
        strategyBudgetAttribution: scope,
      }),
    ).toEqual({ assetId: 'asset-a' });
  });
  it('retains validated server attribution across awaits and never across tenant/context replacement', async () => {
    const h = fixture();
    await runWithStrategyBudgetAttribution(h.tx, scope, async () => {
      await Promise.resolve();
      expect(
        strategyBudgetMetadata(scope.organizationId, {
          strategyBudgetAttribution: { ...scope, strategyId: 'forged' },
        }),
      ).toEqual({ strategyBudgetAttribution: scope });
      expect(strategyBudgetMetadata('foreign', {})).toEqual({});
    });
    expect(strategyBudgetMetadata(scope.organizationId, {})).toEqual({});
    expect(h.findFirst).toHaveBeenCalledWith({
      where: {
        id: scope.strategyId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isActive: true,
        isDeleted: false,
      },
      select: { id: true, platforms: true },
    });
  });
  it('preserves the original hold allocation when a different current strategy tries to overwrite it', async () => {
    const h = fixture();
    const original = {
      ...scope,
      strategyId: 'original-strategy',
      format: 'image' as const,
    };
    await runWithStrategyBudgetAttribution(h.tx, scope, async () => {
      expect(
        strategyBudgetMetadata(
          scope.organizationId,
          { strategyBudgetAttribution: scope, assetId: 'output-a' },
          {
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            metadata: { strategyBudgetAttribution: original },
          },
        ),
      ).toEqual({ assetId: 'output-a', strategyBudgetAttribution: original });
      expect(
        strategyBudgetMetadata(
          scope.organizationId,
          { strategyBudgetAttribution: scope },
          {
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            metadata: {},
          },
        ),
      ).toEqual({});
    });
  });
  it('holds a missing or foreign-platform strategy before invoking a producer', async () => {
    const h = fixture();
    h.findFirst.mockResolvedValue({ id: scope.strategyId, platforms: [] });
    const produce = vi.fn(async () => undefined);
    await expect(
      runWithStrategyBudgetAttribution(h.tx, scope, produce),
    ).rejects.toThrow('outside the execution scope');
    expect(produce).not.toHaveBeenCalled();
  });
});
