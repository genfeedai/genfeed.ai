import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetActiveBrand,
  mockGetBrand,
  mockGetForecast,
  mockListMyOrganizations,
  mockReadAssets,
  mockRequireAuth,
} = vi.hoisted(() => ({
  mockGetActiveBrand: vi.fn(),
  mockGetBrand: vi.fn(),
  mockGetForecast: vi.fn(),
  mockListMyOrganizations: vi.fn(),
  mockReadAssets: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  requireAuth: () => mockRequireAuth(),
}));

vi.mock('@/operations/assets', () => ({
  readAsset: vi.fn(),
  readAssets: (options: unknown) => mockReadAssets(options),
}));

vi.mock('@/api/brands', () => ({
  getBrand: (id: string) => mockGetBrand(id),
}));

vi.mock('@/config/store', () => ({
  getActiveBrand: () => mockGetActiveBrand(),
  getAppUrl: vi.fn(),
  setActiveBrand: vi.fn(),
  setOrganizationId: vi.fn(),
}));

vi.mock('@/operations/brands', () => ({
  activateBrand: vi.fn(),
  readBrands: vi.fn(),
}));

vi.mock('@/api/insights', () => ({
  getContentGaps: vi.fn(),
  getForecast: (topic: string, platform?: string) => mockGetForecast(topic, platform),
  getGrowthPrediction: vi.fn(),
  getInsights: vi.fn(),
  getPostingTimes: vi.fn(),
  getViralAnalysis: vi.fn(),
}));

vi.mock('@/api/organizations', () => ({
  listMyOrganizations: () => mockListMyOrganizations(),
  switchOrganization: vi.fn(),
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
  };
  return { default: () => spinner };
});

describe('shared parent and subcommand options', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  function readJsonOutput(): unknown {
    return JSON.parse(stdoutSpy.mock.calls.map((call) => String(call[0])).join(''));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockRequireAuth.mockResolvedValue('gf_test_key');
    mockGetActiveBrand.mockResolvedValue('brand_1');
    mockGetBrand.mockResolvedValue({
      createdAt: '2026-08-28T00:00:00.000Z',
      id: 'brand_1',
      label: 'Genfeed',
      updatedAt: '2026-08-28T00:00:00.000Z',
    });
    mockGetForecast.mockResolvedValue({ prediction: 'Strong', topic: 'AI workflows' });
    mockListMyOrganizations.mockResolvedValue([
      {
        brand: { id: 'brand_1', label: 'Genfeed' },
        id: 'org_1',
        isActive: true,
        label: 'Genfeed AI',
      },
    ]);
    mockReadAssets.mockResolvedValue([]);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('honors asset list filters, limits, and JSON output', async () => {
    const { libraryCommand } = await import('@/commands/library');

    await libraryCommand.parseAsync(['list', '--type', 'video', '--limit', '100', '--json'], {
      from: 'user',
    });

    expect(mockReadAssets).toHaveBeenCalledWith({ category: 'video', limit: 100 });
    expect(readJsonOutput()).toEqual([]);
  });

  it('honors JSON output on a brand subcommand', async () => {
    const { brandsCommand } = await import('@/commands/brands');

    await brandsCommand.parseAsync(['current', '--json'], { from: 'user' });

    expect(readJsonOutput()).toEqual({
      activeBrand: expect.objectContaining({ id: 'brand_1', label: 'Genfeed' }),
    });
  });

  it('honors JSON output on an insights subcommand', async () => {
    const { insightsCommand } = await import('@/commands/insights');

    await insightsCommand.parseAsync(['forecast', '--topic', 'AI workflows', '--json'], {
      from: 'user',
    });

    expect(mockGetForecast).toHaveBeenCalledWith('AI workflows', undefined);
    expect(readJsonOutput()).toEqual({ prediction: 'Strong', topic: 'AI workflows' });
  });

  it('honors JSON output on an organization subcommand', async () => {
    const { organizationsCommand } = await import('@/commands/organizations');

    await organizationsCommand.parseAsync(['current', '--json'], { from: 'user' });

    expect(readJsonOutput()).toEqual({
      activeOrganization: expect.objectContaining({ id: 'org_1', label: 'Genfeed AI' }),
    });
  });
});
