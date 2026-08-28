import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockFlattenCollection = vi.fn();
const mockFlattenSingle = vi.fn();

vi.mock('../../src/api/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}));

vi.mock('../../src/api/json-api', () => ({
  flattenCollection: (...args: unknown[]) => mockFlattenCollection(...args),
  flattenSingle: (...args: unknown[]) => mockFlattenSingle(...args),
}));

describe('api/credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches credit usage from /credits/usage', async () => {
    const response = { data: { attributes: { currentBalance: 120 }, id: 'usage', type: 'credit' } };
    mockGet.mockResolvedValue(response);
    mockFlattenSingle.mockReturnValue({ currentBalance: 120 });

    const { getCreditUsage } = await import('../../src/api/credits');
    const result = await getCreditUsage();

    expect(mockGet).toHaveBeenCalledWith('/credits/usage');
    expect(mockFlattenSingle).toHaveBeenCalledWith(response);
    expect(result).toEqual({ currentBalance: 120 });
  });

  it('fetches BYOK usage summary from /credits/byok-usage-summary', async () => {
    mockGet.mockResolvedValue({ data: { id: 'summary' } });
    mockFlattenSingle.mockReturnValue({ billableUsage: 5, freeRemaining: 95, totalUsage: 100 });

    const { getCreditSummary } = await import('../../src/api/credits');
    const result = await getCreditSummary();

    expect(mockGet).toHaveBeenCalledWith('/credits/byok-usage-summary');
    expect(result.totalUsage).toBe(100);
  });

  it('fetches the last-purchase baseline from /credits/last-purchase-baseline', async () => {
    mockGet.mockResolvedValue({ data: { id: 'baseline' } });
    mockFlattenSingle.mockReturnValue({
      currentBalance: 400,
      lastPurchaseAt: null,
      lastPurchaseCredits: 500,
      usedPercent: 20,
      usedSinceLastPurchase: 100,
    });

    const { getLastPurchaseBaseline } = await import('../../src/api/credits');
    const result = await getLastPurchaseBaseline();

    expect(mockGet).toHaveBeenCalledWith('/credits/last-purchase-baseline');
    expect(result.usedPercent).toBe(20);
    expect(result.lastPurchaseAt).toBeNull();
  });

  it('creates a server-priced hosted Checkout session', async () => {
    const response = { data: { attributes: { url: 'https://checkout.stripe.test/cs_1' } } };
    mockPost.mockResolvedValue(response);
    mockFlattenSingle.mockReturnValue({ url: 'https://checkout.stripe.test/cs_1' });

    const { createCreditsCheckout } = await import('../../src/api/credits');
    const result = await createCreditsCheckout(5_000);

    expect(mockPost).toHaveBeenCalledWith('/services/stripe/credits/checkout', {
      credits: 5_000,
    });
    expect(result.url).toBe('https://checkout.stripe.test/cs_1');
  });

  it('fetches credit transaction history with a bounded limit', async () => {
    const response = { data: [] };
    mockGet.mockResolvedValue(response);
    mockFlattenCollection.mockReturnValue([]);

    const { listCreditTransactions } = await import('../../src/api/credits');
    const result = await listCreditTransactions(25);

    expect(mockGet).toHaveBeenCalledWith('/credits/transactions?limit=25');
    expect(mockFlattenCollection).toHaveBeenCalledWith(response);
    expect(result).toEqual([]);
  });

  it('falls back to the default transaction limit for non-finite callers', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([]);

    const { listCreditTransactions } = await import('../../src/api/credits');
    await listCreditTransactions(Number.NaN);

    expect(mockGet).toHaveBeenCalledWith('/credits/transactions?limit=50');
  });
});
