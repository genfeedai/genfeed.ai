import { useStreak } from '@hooks/data/streaks/use-streak/use-streak';
import StreaksPage from '@pages/streaks/streaks-page';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const mockSetToolbarNode = vi.hoisted(() => vi.fn());

vi.mock('@hooks/data/streaks/use-streak/use-streak', () => ({
  useStreak: vi.fn(),
}));

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({ setToolbarNode: mockSetToolbarNode }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand-x${path}` }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const mockUseStreak = vi.mocked(useStreak);

function mockStreak(overrides: Partial<ReturnType<typeof useStreak>> = {}) {
  mockUseStreak.mockReturnValue({
    calendar: {},
    isLoading: true,
    isVisible: true,
    refetch: vi.fn(),
    streak: null,
    ...overrides,
  } as unknown as ReturnType<typeof useStreak>);
}

describe('StreaksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page chrome while the streak is still loading', () => {
    mockStreak({ isLoading: true, streak: null });

    render(<StreaksPage />);

    const toolbar = mockSetToolbarNode.mock.calls.at(-1)?.[0];
    expect(toolbar).toBeTruthy();
    render(toolbar);
    expect(
      screen.getByRole('link', { name: 'Create content now' }),
    ).toHaveAttribute('href', '/acme/brand-x/agent/new');
    expect(screen.getByText('Current streak')).toBeInTheDocument();
    expect(screen.getByText('Longest streak')).toBeInTheDocument();
    expect(screen.getByText('Freezes')).toBeInTheDocument();
    expect(screen.getByText('Next milestone')).toBeInTheDocument();
    expect(screen.queryByText('Creation heatmap')).not.toBeInTheDocument();
    expect(screen.queryByText('Earned streak rewards')).not.toBeInTheDocument();
    expect(screen.getByTestId('streaks-heatmap-skeleton')).toBeInTheDocument();
    expect(
      screen.getByTestId('streaks-milestones-skeleton'),
    ).toBeInTheDocument();
  });

  it('renders the loaded streak counts and milestone list', () => {
    mockStreak({
      calendar: {},
      isLoading: false,
      streak: {
        badgeMilestones: [30],
        currentStreak: 5,
        longestStreak: 12,
        milestoneStates: [
          {
            days: 7,
            isAchieved: false,
            isNext: true,
            rewardCredits: 0,
          },
        ],
        nextMilestone: { days: 7, remaining: 2 },
        streakFreezes: 1,
      } as unknown as ReturnType<typeof useStreak>['streak'],
    });

    render(<StreaksPage />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('30-day badge')).toBeInTheDocument();
    expect(
      screen.queryByTestId('streaks-heatmap-skeleton'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('streaks-milestones-skeleton'),
    ).not.toBeInTheDocument();
  });

  it('draws every one of the last 90 days, including empty ones, with a legend', () => {
    const today = new Date().toISOString().slice(0, 10);
    mockStreak({
      calendar: { [today]: { count: 5 } },
      isLoading: false,
    } as Partial<ReturnType<typeof useStreak>>);

    const { container } = render(<StreaksPage />);

    expect(
      container.querySelectorAll('[title$=" items"], [title$=" item"]'),
    ).toHaveLength(90);
    expect(container.querySelector(`[title="${today}: 5 items"]`)).toHaveClass(
      'bg-foreground/80',
    );
    expect(screen.getByText('Less')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });
});
