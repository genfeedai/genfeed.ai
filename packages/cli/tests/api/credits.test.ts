import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockFlattenSingle = vi.fn();

vi.mock('../../src/api/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}));

vi.mock('../../src/api/json-api', () => ({
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
});
