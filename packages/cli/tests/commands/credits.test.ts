import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateCreditsCheckout,
  mockGetCreditSummary,
  mockGetCreditUsage,
  mockListCreditTransactions,
  mockOpenExternalUrl,
  mockRequireAuth,
} = vi.hoisted(() => ({
  mockCreateCreditsCheckout: vi.fn(),
  mockGetCreditSummary: vi.fn(),
  mockGetCreditUsage: vi.fn(),
  mockListCreditTransactions: vi.fn(),
  mockOpenExternalUrl: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  requireAuth: () => mockRequireAuth(),
}));

vi.mock('@/api/credits', () => ({
  createCreditsCheckout: (credits: number) => mockCreateCreditsCheckout(credits),
  getCreditSummary: () => mockGetCreditSummary(),
  getCreditUsage: () => mockGetCreditUsage(),
  listCreditTransactions: (limit: number) => mockListCreditTransactions(limit),
}));

vi.mock('@/utils/browser', () => ({
  openExternalUrl: (url: string) => mockOpenExternalUrl(url),
}));

vi.mock('@/utils/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/errors')>();
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
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  function readJsonOutput(): unknown {
    return JSON.parse(stdoutSpy.mock.calls.map((call) => String(call[0])).join(''));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockRequireAuth.mockResolvedValue('gf_test_key');
    mockGetCreditUsage.mockResolvedValue({ currentBalance: 4_820 });
    mockGetCreditSummary.mockResolvedValue({
      billableUsage: 750,
      freeRemaining: 250,
      projectedFee: 7.5,
      totalUsage: 1_000,
    });
    mockCreateCreditsCheckout.mockResolvedValue({
      url: 'https://checkout.stripe.test/cs_1',
    });
    mockListCreditTransactions.mockResolvedValue([]);
    mockOpenExternalUrl.mockResolvedValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('prints canonical credit packs as JSON', async () => {
    const { createCreditsCommand } = await import('@/commands/credits');
    const creditsCommand = createCreditsCommand();

    await creditsCommand.parseAsync(['packs', '--json'], { from: 'user' });

    expect(readJsonOutput()).toEqual(
      expect.objectContaining({
        creditsPerUsd: 100,
        maximumCredits: 1_000_000,
        minimumCredits: 1_000,
        packs: expect.arrayContaining([expect.objectContaining({ credits: 5_000, label: '$50' })]),
      })
    );
  });

  it('prints the root balance as JSON', async () => {
    const { createCreditsCommand } = await import('@/commands/credits');
    const creditsCommand = createCreditsCommand();

    await creditsCommand.parseAsync(['--json'], { from: 'user' });

    expect(readJsonOutput()).toEqual({ balance: 4_820, unit: 'credits' });
  });

  it('creates hosted Checkout without opening a browser when requested', async () => {
    const { createCreditsCommand } = await import('@/commands/credits');
    const creditsCommand = createCreditsCommand();

    await creditsCommand.parseAsync(['buy', '5000', '--no-open', '--json'], {
      from: 'user',
    });

    expect(mockCreateCreditsCheckout).toHaveBeenCalledWith(5_000);
    expect(mockOpenExternalUrl).not.toHaveBeenCalled();
    expect(readJsonOutput()).toEqual({
      credits: 5_000,
      opened: false,
      url: 'https://checkout.stripe.test/cs_1',
    });
  });

  it('returns bounded credit history', async () => {
    const { createCreditsCommand } = await import('@/commands/credits');
    const creditsCommand = createCreditsCommand();

    await creditsCommand.parseAsync(['history', '--limit', '25', '--json'], {
      from: 'user',
    });

    expect(mockListCreditTransactions).toHaveBeenCalledWith(25);
    expect(readJsonOutput()).toEqual([]);
  });

  it('prints credit usage as JSON', async () => {
    const { createCreditsCommand } = await import('@/commands/credits');
    const creditsCommand = createCreditsCommand();

    await creditsCommand.parseAsync(['usage', '--json'], { from: 'user' });

    expect(readJsonOutput()).toEqual({ currentBalance: 4_820 });
  });

  it('prints the BYOK summary as JSON', async () => {
    const { createCreditsCommand } = await import('@/commands/credits');
    const creditsCommand = createCreditsCommand();

    await creditsCommand.parseAsync(['summary', '--json'], { from: 'user' });

    expect(readJsonOutput()).toEqual({
      billableUsage: 750,
      freeRemaining: 250,
      projectedFee: 7.5,
      totalUsage: 1_000,
    });
  });
});
