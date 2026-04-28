import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsProgressPage from './settings-progress-page';

const { mockCurrentUserState, mockMutateUser, mockPatchSettings } = vi.hoisted(
  () => ({
    mockCurrentUserState: {
      currentUser: {
        id: 'user-123',
        settings: {
          isSidebarProgressVisible: false,
        } as Record<string, unknown>,
      },
    },
    mockMutateUser: vi.fn((next: unknown) => {
      mockCurrentUserState.currentUser =
        next as typeof mockCurrentUserState.currentUser;
    }),
    mockPatchSettings: vi.fn().mockResolvedValue({}),
  }),
);

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: mockCurrentUserState.currentUser,
    mutateUser: mockMutateUser,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) => `/acme/~${path}`,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    patchSettings: mockPatchSettings,
  }),
}));

vi.mock('@hooks/utils/use-setup-card/use-setup-card', () => ({
  useSetupCard: () => ({
    completedCount: 1,
    isVisible: true,
    steps: [
      {
        description: 'Choose what you want to create',
        href: '/settings/brands',
        isCompleted: false,
        key: 'preferences',
        label: 'Content types',
      },
      {
        description: 'Connect Instagram, TikTok, etc.',
        href: '/settings/api-keys',
        isCompleted: true,
        key: 'platforms',
        label: 'Social accounts',
      },
    ],
    totalCount: 2,
  }),
}));

vi.mock('@hooks/data/streaks/use-streak/use-streak', () => ({
  useStreak: () => ({
    calendar: {
      '2026-03-10': { count: 2, types: ['image'] },
      '2026-03-11': { count: 1, types: ['post'] },
    },
    isLoading: false,
    isVisible: true,
    refetch: vi.fn(),
    streak: {
      badgeMilestones: [30],
      currentStreak: 6,
      id: 'streak-1',
      longestStreak: 14,
      milestoneHistory: [],
      milestoneStates: [
        {
          achievedAt: null,
          days: 7,
          isAchieved: false,
          isNext: true,
          rewardCredits: 0,
          rewardLabel: 'Freeze unlocked',
        },
      ],
      milestones: [],
      nextMilestone: {
        days: 7,
        remaining: 1,
        rewardCredits: 0,
      },
      status: 'active',
      streakFreezes: 2,
      totalContentDays: 8,
    },
  }),
}));

vi.mock('@models/auth/user.model', () => ({
  User: class MockUser {
    constructor(partial: Record<string, unknown>) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('SettingsProgressPage', () => {
  beforeEach(() => {
    mockCurrentUserState.currentUser = {
      id: 'user-123',
      settings: {
        isSidebarProgressVisible: false,
      },
    };
    mockMutateUser.mockClear();
    mockPatchSettings.mockClear();
  });

  it('renders the combined setup and streak review sections', () => {
    render(<SettingsProgressPage />);

    expect(screen.getByText('Review setup and streaks')).toBeInTheDocument();
    expect(screen.getByText('Setup checklist')).toBeInTheDocument();
    expect(screen.getByText('Creation heatmap')).toBeInTheDocument();
    expect(screen.getByText('Earned streak rewards')).toBeInTheDocument();
    expect(
      screen.queryByText('Keep setup lean. Keep streaks optional.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /finish content types/i }),
    ).toHaveAttribute('href', '/acme/~/settings/brands');
  });

  it('re-enables the sidebar module through the account-level toggle', async () => {
    render(<SettingsProgressPage />);

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => {
      expect(mockPatchSettings).toHaveBeenCalledWith('user-123', {
        isSidebarProgressVisible: true,
      });
    });

    expect(mockMutateUser).toHaveBeenCalled();
  });
});
