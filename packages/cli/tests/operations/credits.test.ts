import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCheckout, mockHistory, mockUsage } = vi.hoisted(() => ({
  mockCheckout: vi.fn(),
  mockHistory: vi.fn(),
  mockUsage: vi.fn(),
}));

vi.mock('@/api/credits', () => ({
  createCreditsCheckout: (...args: unknown[]) => mockCheckout(...args),
  getCreditUsage: () => mockUsage(),
  listCreditTransactions: (limit: number) => mockHistory(limit),
}));

describe('credit operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckout.mockResolvedValue({ url: 'https://checkout.test' });
    mockHistory.mockResolvedValue([{ id: 'tx-1' }]);
  });

  it.each([
    [{ currentBalance: 250 }, 250],
    [{}, 0],
  ])('reads the available balance from canonical response %o', async (usage, expected) => {
    mockUsage.mockResolvedValue(usage);
    const { readCreditBalance } = await import('@/operations/credits');
    await expect(readCreditBalance()).resolves.toEqual({ balance: expected, unit: 'credits' });
  });

  it.each([999, 1_000_001, 1_000.5, Number.NaN])(
    'rejects invalid quantity %s before Checkout',
    async (credits) => {
      const { parseCreditQuantity } = await import('@/operations/credits');
      expect(() => parseCreditQuantity(credits)).toThrow('whole number');
    }
  );

  it('creates Checkout and reads history', async () => {
    const { readCreditHistory, startCreditsCheckout } = await import('@/operations/credits');
    await expect(startCreditsCheckout(5_000)).resolves.toEqual({ url: 'https://checkout.test' });
    await expect(readCreditHistory(20)).resolves.toEqual([{ id: 'tx-1' }]);
  });

  it('forwards cancellation to Checkout creation', async () => {
    const controller = new AbortController();
    const { startCreditsCheckout } = await import('@/operations/credits');

    await startCreditsCheckout(5_000, controller.signal);

    expect(mockCheckout).toHaveBeenCalledWith(5_000, controller.signal);
  });
});
