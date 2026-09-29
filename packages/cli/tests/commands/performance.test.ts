import { beforeEach, describe, expect, it, vi } from 'vitest';
import { performanceCommand } from '../../src/commands/performance';
import { NoBrandError } from '../../src/utils/errors';

const {
  mockGetActiveBrand,
  mockGetPromptPerformance,
  mockGetTopPerformers,
  mockGetWeeklySummary,
  mockHandleError,
  mockPrintJson,
  mockRequireAuth,
} = vi.hoisted(() => ({
  mockGetActiveBrand: vi.fn(),
  mockGetPromptPerformance: vi.fn(),
  mockGetTopPerformers: vi.fn(),
  mockGetWeeklySummary: vi.fn(),
  mockHandleError: vi.fn((error: unknown) => {
    throw error;
  }),
  mockPrintJson: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock('ora', () => {
  const spinner = {
    fail: vi.fn(),
    start: () => spinner,
    stop: vi.fn(),
  };
  return { default: () => spinner };
});

vi.mock('../../src/api/performance', () => ({
  getPromptPerformance: (params: unknown) => mockGetPromptPerformance(params),
  getTopPerformers: (params: unknown) => mockGetTopPerformers(params),
  getWeeklySummary: (params: unknown) => mockGetWeeklySummary(params),
}));

vi.mock('../../src/api/client', () => ({
  requireAuth: () => mockRequireAuth(),
}));

vi.mock('../../src/config/store', () => ({
  getActiveBrand: () => mockGetActiveBrand(),
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
    handleError: (error: unknown) => mockHandleError(error),
  };
});

const weeklySummary = {
  avgEngagementByContentType: [],
  avgEngagementByPlatform: [],
  bestPostingTimes: [],
  topHooks: [],
  topPerformers: [],
  weekOverWeekTrend: {
    currentEngagement: 3.6,
    direction: 'up' as const,
    percentageChange: 12.5,
    previousEngagement: 3.2,
  },
  worstPerformers: [],
};

describe('performance command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue('api-key');
    mockGetActiveBrand.mockResolvedValue('brand-active');
    mockGetWeeklySummary.mockResolvedValue(weeklySummary);
    mockGetTopPerformers.mockResolvedValue([]);
    mockGetPromptPerformance.mockResolvedValue([]);
  });

  describe('weekly', () => {
    it('prefers the --brand flag over the active brand', async () => {
      await performanceCommand.parseAsync(['weekly', '--brand', 'brand-flag', '--json'], {
        from: 'user',
      });

      expect(mockGetWeeklySummary).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: 'brand-flag' })
      );
    });

    it('fails with NoBrandError before requesting when no brand is resolvable', async () => {
      mockGetActiveBrand.mockResolvedValue(undefined);

      await expect(
        performanceCommand.parseAsync(['weekly', '--json'], { from: 'user' })
      ).rejects.toBeInstanceOf(NoBrandError);

      expect(mockGetWeeklySummary).not.toHaveBeenCalled();
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('top', () => {
    it('prints the array payload as JSON', async () => {
      const items = [
        {
          comments: 0,
          description: '',
          engagementRate: 4.2,
          likes: 34,
          platform: 'twitter',
          postId: 'post-1',
          saves: 0,
          shares: 5,
          title: 'Post one',
          views: 1200,
        },
      ];
      mockGetTopPerformers.mockResolvedValue(items);

      await performanceCommand.parseAsync(['top', '--json'], { from: 'user' });

      expect(mockPrintJson).toHaveBeenCalledWith(items);
    });

    it('fails with NoBrandError before requesting when no brand is resolvable', async () => {
      mockGetActiveBrand.mockResolvedValue(undefined);

      await expect(
        performanceCommand.parseAsync(['top', '--json'], { from: 'user' })
      ).rejects.toBeInstanceOf(NoBrandError);

      expect(mockGetTopPerformers).not.toHaveBeenCalled();
    });
  });

  describe('prompts', () => {
    it('prints the array payload as JSON', async () => {
      const prompts = [
        {
          avgEngagementRate: 5.5,
          promptSnippet: 'Behind the scenes of',
          totalPosts: 4,
          totalViews: 900,
        },
      ];
      mockGetPromptPerformance.mockResolvedValue(prompts);

      await performanceCommand.parseAsync(['prompts', '--json'], { from: 'user' });

      expect(mockPrintJson).toHaveBeenCalledWith(prompts);
    });

    it('fails with NoBrandError before requesting when no brand is resolvable', async () => {
      mockGetActiveBrand.mockResolvedValue(undefined);

      await expect(
        performanceCommand.parseAsync(['prompts', '--json'], { from: 'user' })
      ).rejects.toBeInstanceOf(NoBrandError);

      expect(mockGetPromptPerformance).not.toHaveBeenCalled();
    });
  });
});
