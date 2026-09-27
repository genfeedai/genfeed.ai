import { InsightCategory, InsightImpact } from '@genfeedai/contracts';
import type { Insight } from '@genfeedai/props/analytics/insights.props';
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
    dismissInsight: vi.fn(),
    error: null,
    insights: [],
    isLoading: false,
    isRefreshing: false,
    markInsightRead: vi.fn(),
    refresh: vi.fn(),
    status: 'empty',
    unavailableReason: null,
  })),
}));

vi.mock('./social-intelligence-inbox', () => ({
  default: ({
    brandId,
    organizationId,
  }: {
    brandId?: string;
    organizationId: string;
  }) => (
    <div>
      Social intelligence scope {organizationId}/{brandId ?? 'none'}
    </div>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

describe('InsightsOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<InsightsOverview />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('mounts the social intelligence inbox inside the analytics scope', () => {
    render(<InsightsOverview brandId="brand-123" />);

    expect(screen.getByText(/Social intelligence scope/)).toBeInTheDocument();
  });

  it('renders the insight list when insights are available', () => {
    const insights: Insight[] = [
      {
        actionableSteps: ['Post more reels'],
        category: InsightCategory.OPPORTUNITY,
        confidence: 82,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        description: 'Reels are outperforming other formats this week.',
        id: 'insight-1',
        impact: InsightImpact.HIGH,
        isRead: false,
        relatedMetrics: [],
        title: 'Reels are trending',
      },
    ];

    vi.mocked(useInsights).mockReturnValueOnce({
      dismissInsight: vi.fn(),
      error: null,
      insights,
      isLoading: false,
      isRefreshing: false,
      markInsightRead: vi.fn(),
      refresh: vi.fn(),
      status: 'available',
      unavailableReason: null,
    });

    render(<InsightsOverview />);

    expect(screen.getByText('Reels are trending')).toBeInTheDocument();
  });

  it('renders an unavailable state when insights fail to load', () => {
    vi.mocked(useInsights).mockReturnValueOnce({
      dismissInsight: vi.fn(),
      error: new Error('Provider unavailable'),
      insights: [],
      isLoading: false,
      isRefreshing: false,
      markInsightRead: vi.fn(),
      refresh: vi.fn(),
      status: 'unavailable',
      unavailableReason: 'Provider unavailable',
    });

    render(<InsightsOverview />);

    expect(
      screen.getByText('Analytics insights unavailable'),
    ).toBeInTheDocument();
    expect(screen.getByText('Provider unavailable')).toBeInTheDocument();
  });
});
