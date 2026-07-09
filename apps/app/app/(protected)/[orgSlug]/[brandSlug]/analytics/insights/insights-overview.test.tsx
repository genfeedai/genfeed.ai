import { useInsights } from '@hooks/data/analytics/use-insights/use-insights';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InsightsOverview from './insights-overview';
import '@testing-library/jest-dom/vitest';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    selectedBrand: {
      id: 'brand-123',
    },
  })),
}));

vi.mock('@hooks/data/analytics/use-insights/use-insights', () => ({
  useInsights: vi.fn(() => ({
    alerts: [],
    anomalies: [],
    audiences: [],
    contentInsightsStatus: 'empty',
    contentInsightsUnavailableReason: null,
    dismissAlert: vi.fn(),
    isLoading: false,
    isRefreshing: false,
    markAlertRead: vi.fn(),
    refresh: vi.fn(),
    suggestions: [],
    trends: [],
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('InsightsOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<InsightsOverview />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders an unavailable state when predictive analytics fails', () => {
    vi.mocked(useInsights).mockReturnValueOnce({
      alerts: [],
      anomalies: [],
      audiences: [],
      contentInsightsStatus: 'unavailable',
      contentInsightsUnavailableReason: 'Provider unavailable',
      dismissAlert: vi.fn(),
      dismissInsight: vi.fn(),
      error: new Error('Provider unavailable'),
      insights: [],
      isLoading: false,
      isRefreshing: false,
      markAlertRead: vi.fn(),
      markInsightRead: vi.fn(),
      refresh: vi.fn(),
      suggestions: [],
      trends: [],
    });

    render(<InsightsOverview />);

    expect(
      screen.getByText('Analytics insights unavailable'),
    ).toBeInTheDocument();
    expect(screen.getByText('Provider unavailable')).toBeInTheDocument();
  });
});
