import '@testing-library/jest-dom/vitest';
import TrendDetail from '@pages/analytics/trends/trend-detail/trend-detail';
import type { TrendDetailData } from '@props/trends/trends-page.props';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const pushMock = vi.fn();
const backMock = vi.fn();
const getTrendByIdMock = vi.fn();

const trendDetailFixture = {
  analysis: {
    recommendation: 'Post within the next 24 hours.',
    summary: 'Rising interest in agent tooling.',
  },
  relatedTrends: [],
  trend: {
    growthRate: 25,
    id: 'trend-1',
    label: 'AI agents',
    mentions: 12500,
    metadata: {
      engagementRate: 3.75,
      hashtags: ['aiagents', '#tooling'],
      impressions: 98000,
      reach: 45000,
      sampleContent: 'Everyone is shipping agents this week.',
    },
    platform: 'twitter',
    viralityScore: 88,
  },
} as unknown as TrendDetailData;

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ back: backMock, push: pushMock }),
}));

// Identity-stable: both are dependencies of the fetch effect.
const getTrendsServiceMock = async () => ({
  getTrendById: getTrendByIdMock,
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getTrendsServiceMock,
}));

// `vi.hoisted` so the singleton exists before `error-handler.util`'s static
// initializer pulls `NotificationsService.getInstance()` at import time.
const notificationsServiceMock = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => notificationsServiceMock,
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('TrendDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTrendByIdMock.mockResolvedValue(trendDetailFixture);
  });

  it('renders the trend metrics once loaded', async () => {
    render(<TrendDetail trendId="trend-1" />);

    await waitFor(() => {
      expect(screen.getByText('Trend Metrics')).toBeInTheDocument();
    });
    expect(screen.getByText('Mentions')).toBeInTheDocument();
    expect(screen.getByText('Virality Score')).toBeInTheDocument();
    expect(screen.getByText('88/100')).toBeInTheDocument();
  });

  it('prefixes a positive growth rate', async () => {
    render(<TrendDetail trendId="trend-1" />);

    await waitFor(() => {
      expect(screen.getByText('+25%')).toBeInTheDocument();
    });
  });

  it('renders N/A for metadata the trend does not carry', async () => {
    getTrendByIdMock.mockResolvedValue({
      ...trendDetailFixture,
      trend: { ...trendDetailFixture.trend, metadata: undefined },
    });

    render(<TrendDetail trendId="trend-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(3);
    });
  });

  it('normalises hashtags to a single leading hash', async () => {
    render(<TrendDetail trendId="trend-1" />);

    await waitFor(() => {
      expect(screen.getByText('#aiagents')).toBeInTheDocument();
    });
    expect(screen.getByText('#tooling')).toBeInTheDocument();
  });

  it('renders the sample content when present', async () => {
    render(<TrendDetail trendId="trend-1" />);

    await waitFor(() => {
      expect(
        screen.getByText('Everyone is shipping agents this week.'),
      ).toBeInTheDocument();
    });
  });

  it('shows the shell chrome before the request resolves', () => {
    getTrendByIdMock.mockReturnValue(new Promise(() => undefined));

    render(<TrendDetail trendId="trend-1" />);

    expect(screen.getByText('Loading trend…')).toBeInTheDocument();
    expect(screen.getByText('Trend Metrics')).toBeInTheDocument();
    expect(screen.getByText('Mentions')).toBeInTheDocument();
    expect(
      screen.getByTestId('trend-detail-body-skeleton'),
    ).toBeInTheDocument();
  });

  it('surfaces a failure and notifies the user', async () => {
    getTrendByIdMock.mockRejectedValue(new Error('nope'));

    render(<TrendDetail trendId="trend-1" />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load trend details')).toBeVisible();
    });
    expect(notificationsServiceMock.error).toHaveBeenCalledWith(
      'Failed to load trend details',
    );
  });

  it('navigates back from the error state', async () => {
    getTrendByIdMock.mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();

    render(<TrendDetail trendId="trend-1" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /go back/i })).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: /go back/i }));

    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it('routes the remix action into the agent', async () => {
    const user = userEvent.setup();
    render(<TrendDetail trendId="trend-1" />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /remix in agent/i }),
      ).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: /remix in agent/i }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(String(pushMock.mock.calls[0]?.[0])).toContain('/agent');
  });
});
