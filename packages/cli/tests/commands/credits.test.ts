import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateCreditsCheckout,
  mockGetCreditUsage,
  mockListCreditTransactions,
  mockOpenExternalUrl,
  mockPrintJson,
  mockRequireAuth,
} = vi.hoisted(() => ({
  mockCreateCreditsCheckout: vi.fn(),
  mockGetCreditUsage: vi.fn(),
  mockListCreditTransactions: vi.fn(),
  mockOpenExternalUrl: vi.fn(),
  mockPrintJson: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock('../../src/api/client', () => ({
  requireAuth: () => mockRequireAuth(),
}));

vi.mock('../../src/api/credits', () => ({
  createCreditsCheckout: (credits: number) => mockCreateCreditsCheckout(credits),
  getCreditSummary: vi.fn(),
  getCreditUsage: () => mockGetCreditUsage(),
  listCreditTransactions: (limit: number) => mockListCreditTransactions(limit),
}));

vi.mock('../../src/utils/browser', () => ({
  openExternalUrl: (url: string) => mockOpenExternalUrl(url),
}));

vi.mock('../../src/ui/theme', () => ({
  formatHeader: (value: string) => value,
  formatLabel: (label: string, value: string) => `${label}: ${value}`,
  print: vi.fn(),
  printJson: (value: unknown) => mockPrintJson(value),
}));

vi.mock('../../src/utils/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/errors')>();
  return {
    ...actual,
    handleError: (error: unknown) => {
      throw error;
    },
  };
});

vi.mock('ora', () => {
  const spinner = {
    fail: vi.fn(() => spinner),
    start: () => spinner,
    stop: vi.fn(() => spinner),
    succeed: vi.fn(() => spinner),
  };
  return { default: () => spinner };
});

describe('credits command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue('gf_test_key');
    mockGetCreditUsage.mockResolvedValue({ currentBalance: 4_820 });
    mockCreateCreditsCheckout.mockResolvedValue({
      url: 'https://checkout.stripe.test/cs_1',
    });
    mockListCreditTransactions.mockResolvedValue([]);
    mockOpenExternalUrl.mockResolvedValue(true);
  });

  it('prints canonical credit packs as JSON', async () => {
    const { creditsCommand } = await import('../../src/commands/credits');

    await creditsCommand.parseAsync(['packs', '--json'], { from: 'user' });

    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        creditsPerUsd: 100,
        maximumCredits: 1_000_000,
        minimumCredits: 1_000,
        packs: expect.arrayContaining([expect.objectContaining({ credits: 5_000, label: '$50' })]),
      })
    );
  });

  it('creates hosted Checkout without opening a browser when requested', async () => {
    const { creditsCommand } = await import('../../src/commands/credits');

    await creditsCommand.parseAsync(['buy', '5000', '--no-open', '--json'], {
      from: 'user',
    });

    expect(mockCreateCreditsCheckout).toHaveBeenCalledWith(5_000);
    expect(mockOpenExternalUrl).not.toHaveBeenCalled();
    expect(mockPrintJson).toHaveBeenCalledWith({
      credits: 5_000,
      opened: false,
      url: 'https://checkout.stripe.test/cs_1',
    });
  });

  it('returns bounded credit history', async () => {
    const { creditsCommand } = await import('../../src/commands/credits');

    await creditsCommand.parseAsync(['history', '--limit', '25', '--json'], {
      from: 'user',
    });

    expect(mockListCreditTransactions).toHaveBeenCalledWith(25);
    expect(mockPrintJson).toHaveBeenCalledWith([]);
  });
});
