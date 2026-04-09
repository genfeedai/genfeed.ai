import { render, screen } from '@testing-library/react';
import ContentTeamPage from './ContentTeamPage';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseAgentStrategies = vi.fn();
const mockUseAgentCampaigns = vi.fn();
const mockUseOverviewBootstrap = vi.fn();
const mockUseResource = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    brands: [{ id: 'brand-1', label: 'Acme Creator' }],
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: (...args: unknown[]) => mockUseAgentStrategies(...args),
}));

vi.mock('@hooks/data/agent-campaigns/use-agent-campaigns', () => ({
  useAgentCampaigns: (...args: unknown[]) => mockUseAgentCampaigns(...args),
}));

vi.mock('@hooks/data/overview/use-overview-bootstrap', () => ({
  useOverviewBootstrap: (...args: unknown[]) =>
    mockUseOverviewBootstrap(...args),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('ContentTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAgentStrategies.mockReturnValue({
      isLoading: false,
      refresh: vi.fn(),
      strategies: [
        {
          agentType: 'x_content',
          autonomyMode: 'supervised',
          creditsUsedToday: 24,
          dailyCreditBudget: 80,
          displayRole: 'X/Twitter Writer',
          id: 'strategy-1',
          isActive: true,
          label: 'Daily X Writer',
          platforms: ['twitter'],
          postsPerWeek: 7,
          reportsToLabel: 'Main Orchestrator',
          teamGroup: 'Distribution',
        },
        {
          agentType: 'video_creator',
          autonomyMode: 'supervised',
          creditsUsedToday: 60,
          dailyCreditBudget: 180,
          displayRole: 'Instagram Short Creator',
          id: 'strategy-2',
          isActive: true,
          label: 'Shorts Engine',
          platforms: ['instagram', 'tiktok'],
          postsPerWeek: 14,
          reportsToLabel: 'Main Orchestrator',
          teamGroup: 'Production',
        },
      ],
    });

    mockUseAgentCampaigns.mockReturnValue({
      campaigns: [
        {
          agents: ['strategy-1', 'strategy-2'],
          campaignLeadStrategyId: 'strategy-2',
          contentQuota: { images: 4, posts: 10, videos: 6 },
          id: 'campaign-1',
          label: 'Launch Sprint',
          status: 'active',
        },
      ],
      isLoading: false,
    });

    mockUseOverviewBootstrap.mockReturnValue({
      activeRuns: [{ id: 'run-1' }],
      reviewInbox: {
        approvedCount: 0,
        changesRequestedCount: 0,
        pendingCount: 2,
        readyCount: 3,
        recentItems: [],
        rejectedCount: 0,
      },
      stats: {
        completedToday: 4,
        failedToday: 1,
        totalRuns: 8,
      },
    });

    mockUseResource
      .mockReturnValueOnce({
        data: [
          {
            currentValue: 120000,
            id: 'goal-1',
            isActive: true,
            label: 'April Views Goal',
            metric: 'views',
            targetValue: 250000,
          },
        ],
      })
      .mockReturnValueOnce({
        data: [{ id: 'workflow-1' }, { id: 'workflow-2' }],
      });
  });

  it('renders the content team sections and aggregated metrics', () => {
    render(<ContentTeamPage />);

    expect(screen.getByRole('heading', { name: 'HQ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Campaigns' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Automations' }),
    ).toBeInTheDocument();

    expect(screen.getByText('April Views Goal')).toBeInTheDocument();
    expect(screen.getByText('Launch Sprint')).toBeInTheDocument();
    expect(screen.getAllByText('Shorts Engine').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
  });
});
