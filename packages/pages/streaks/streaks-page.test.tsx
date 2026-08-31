import { useStreak } from '@hooks/data/streaks/use-streak/use-streak';
import StreaksPage from '@pages/streaks/streaks-page';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('@hooks/data/streaks/use-streak/use-streak', () => ({
  useStreak: vi.fn(),
}));

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

    expect(screen.getByText('Create content now')).toBeInTheDocument();
    expect(screen.getByText('Current streak')).toBeInTheDocument();
    expect(screen.getByText('Longest streak')).toBeInTheDocument();
    expect(screen.getByText('Freezes')).toBeInTheDocument();
    expect(screen.getByText('Next milestone')).toBeInTheDocument();
    expect(screen.getByText('Creation heatmap')).toBeInTheDocument();
    expect(screen.getByText('Earned streak rewards')).toBeInTheDocument();
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
});
