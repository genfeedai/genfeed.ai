import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  releaseTextCredits,
  reserveTextCredits,
  settleTextCredits,
} from '@api/helpers/utils/credits/text-credit-hold.util';
import { ActivitySource } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

/** A wallet whose hold, settle and release follow the ledger's rules. */
function makeLedger(startingBalance: number) {
  const wallet = { balance: startingBalance, held: 0 };
  const holds = new Map<string, number>();
  const client = {
    deductCreditsFromOrganization: async (
      _organizationId: string,
      _userId: string,
      amount: number,
      _description: string,
      _source: ActivitySource,
      options?: { maxOverdraftCredits?: number },
    ) => {
      if (
        wallet.balance - wallet.held - amount <
        -(options?.maxOverdraftCredits ?? 0)
      )
        throw new BusinessLogicException(
          'Insufficient organization credits',
          {},
          'INSUFFICIENT_CREDITS',
        );
      wallet.balance -= amount;
    },
    releaseReservation: async ({
      reservationId,
    }: {
      reservationId: string;
    }) => {
      wallet.held -= holds.get(reservationId) ?? 0;
      holds.delete(reservationId);
    },
    reserveCredits: async ({
      amount,
      idempotencyKey,
    }: {
      amount: number;
      idempotencyKey: string;
    }) => {
      if (wallet.balance - wallet.held < amount)
        throw new BusinessLogicException(
          'Insufficient organization credits',
          {},
          'INSUFFICIENT_CREDITS',
        );
      wallet.held += amount;
      holds.set(idempotencyKey, amount);
      return { amount, id: idempotencyKey };
    },
    settleReservation: async ({
      actualAmount,
      reservationId,
    }: {
      actualAmount: number;
      reservationId: string;
    }) => {
      wallet.held -= holds.get(reservationId) ?? 0;
      holds.delete(reservationId);
      wallet.balance -= actualAmount;
    },
  } as unknown as CreditsUtilsService;
  return { client, wallet };
}

const scope = {
  organizationId: 'org-1',
  source: ActivitySource.SCRIPT,
  userId: 'user-1',
};
const hold = (credits: CreditsUtilsService, holdCredits = 1) =>
  reserveTextCredits(credits, {
    ...scope,
    description: 'Text call',
    holdCredits,
    workloadType: 'text-generation',
  });

describe('text credit hold', () => {
  let ledger: ReturnType<typeof makeLedger>;

  beforeEach(() => {
    ledger = makeLedger(1);
  });

  it('lets one of five concurrent calls start when the balance pays for one', async () => {
    let providerCalls = 0;
    const call = async () => {
      const taken = await hold(ledger.client);
      providerCalls += 1;
      await settleTextCredits(ledger.client, taken, {
        ...scope,
        actualCredits: 1,
        description: 'Text call',
      });
    };

    const outcomes = await Promise.allSettled(Array.from({ length: 5 }, call));

    expect(providerCalls).toBe(1);
    expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(4);
    expect(ledger.wallet).toEqual({ balance: 0, held: 0 });
  });

  it('refuses a call below one credit before anything runs', async () => {
    ledger = makeLedger(0.5);

    await expect(hold(ledger.client)).rejects.toMatchObject({
      errorCode: 'INSUFFICIENT_CREDITS',
    });
    expect(ledger.wallet).toEqual({ balance: 0.5, held: 0 });
  });

  it('bills only the actual price and frees the rest of the hold', async () => {
    ledger = makeLedger(10);
    const taken = await hold(ledger.client, 2);

    await settleTextCredits(ledger.client, taken, {
      ...scope,
      actualCredits: 0.4,
      description: 'Text call',
    });

    expect(ledger.wallet).toEqual({ balance: 9.6, held: 0 });
  });

  it('bills a call that outgrew its hold, never more than one call over', async () => {
    const taken = await hold(ledger.client, 1);

    await settleTextCredits(ledger.client, taken, {
      ...scope,
      actualCredits: 1.5,
      description: 'Text call',
    });

    expect(ledger.wallet.balance).toBeCloseTo(-0.5);
    expect(ledger.wallet.held).toBe(0);
  });

  it('releases the hold of a call that failed, or cost nothing', async () => {
    const failed = await hold(ledger.client);
    await releaseTextCredits(ledger.client, failed, 'org-1');
    expect(ledger.wallet).toEqual({ balance: 1, held: 0 });

    const free = await hold(ledger.client);
    await settleTextCredits(ledger.client, free, {
      ...scope,
      actualCredits: 0,
      description: 'Text call',
    });
    expect(ledger.wallet).toEqual({ balance: 1, held: 0 });
  });

  it('releasing without a hold is a no-op', async () => {
    await expect(
      releaseTextCredits(ledger.client, undefined, 'org-1'),
    ).resolves.toBeUndefined();
  });
});
