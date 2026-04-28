import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import ProgressSidebarCard from '@ui/cards/progress-sidebar-card/ProgressSidebarCard';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCurrentUserState,
  mockMutateUser,
  mockPatchSettings,
  mockRouteParams,
} = vi.hoisted(() => ({
  mockCurrentUserState: {
    currentUser: {
      id: 'user-123',
      settings: {} as Record<string, unknown>,
    },
  },
  mockMutateUser: vi.fn((next: unknown) => {
    mockCurrentUserState.currentUser =
      next as typeof mockCurrentUserState.currentUser;
  }),
  mockPatchSettings: vi.fn().mockResolvedValue({}),
  mockRouteParams: {
    brandSlug: 'moonrise-studio',
    orgSlug: 'acme',
  } as Record<string, string | undefined>,
}));

const SCROLL_FOCUS_OUTER_SHADOW_CLASS =
  'shadow-[0_-18px_30px_-18px_rgba(0,0,0,0.88),0_18px_32px_-24px_rgba(0,0,0,0.6)]';

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: mockCurrentUserState.currentUser,
    mutateUser: mockMutateUser,
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    patchSettings: mockPatchSettings,
  }),
}));

vi.mock('@genfeedai/hooks/utils/use-setup-card/use-setup-card', () => ({
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

vi.mock('@genfeedai/hooks/data/streaks/use-streak/use-streak', () => ({
  useStreak: () => ({
    calendar: {},
    isLoading: false,
    isVisible: true,
    refetch: vi.fn(),
    streak: {
      badgeMilestones: [],
      currentStreak: 4,
      id: 'streak-1',
      longestStreak: 8,
      milestoneHistory: [],
      milestoneStates: [],
      milestones: [],
      nextMilestone: {
        days: 7,
        remaining: 3,
        rewardCredits: 0,
      },
      status: 'active',
      streakFreezes: 1,
      totalContentDays: 4,
    },
  }),
}));

vi.mock('@genfeedai/models/auth/user.model', () => ({
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

vi.mock('next/navigation', () => ({
  useParams: () => mockRouteParams,
}));

describe('ProgressSidebarCard', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => {
          storage.delete(key);
        },
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });

    mockCurrentUserState.currentUser = {
      id: 'user-123',
      settings: {},
    };
    mockMutateUser.mockClear();
    mockPatchSettings.mockClear();
    mockRouteParams.brandSlug = 'moonrise-studio';
    mockRouteParams.orgSlug = 'acme';
  });

  const getCard = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-card-index="0"]');

  it('renders expanded by default when no collapse preference is stored', () => {
    const { container } = render(<ProgressSidebarCard />);

    const card = getCard(container);
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }
    const [toggleButton] = within(card).getAllByRole('button');

    expect(
      screen.getByText(
        (_, element) => element?.textContent === '1/2 setup·4d streak',
      ),
    ).toBeInTheDocument();
    expect(card.className).toContain(SCROLL_FOCUS_OUTER_SHADOW_CLASS);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Complete setup')).toBeInTheDocument();
    expect(screen.getByText('freeze')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders collapsed when the saved account preference is true', () => {
    mockCurrentUserState.currentUser = {
      id: 'user-123',
      settings: {
        isSidebarProgressCollapsed: true,
      },
    };

    const { container } = render(<ProgressSidebarCard />);

    const card = getCard(container);
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }
    const [toggleButton] = within(card).getAllByRole('button');

    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('persists collapsed state through user settings when toggled', async () => {
    const { container } = render(<ProgressSidebarCard />);

    const card = getCard(container);
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }
    const [toggleButton] = within(card).getAllByRole('button');

    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(mockPatchSettings).toHaveBeenCalledWith('user-123', {
        isSidebarProgressCollapsed: true,
      });
    });

    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(mockMutateUser).toHaveBeenCalled();
  });

  it('falls back to personal settings when org slug is not resolved', () => {
    mockRouteParams.brandSlug = undefined;
    mockRouteParams.orgSlug = undefined;

    render(<ProgressSidebarCard />);

    expect(screen.getByRole('link', { name: /finish setup/i })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('migrates legacy localStorage preference when db value is missing', async () => {
    globalThis.localStorage.setItem(
      'genfeed:sidebar:progress-collapsed',
      'true',
    );

    const { container } = render(<ProgressSidebarCard />);

    await waitFor(() => {
      expect(mockPatchSettings).toHaveBeenCalledWith('user-123', {
        isSidebarProgressCollapsed: true,
      });
    });

    const card = getCard(container);
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }
    const [toggleButton] = within(card).getAllByRole('button');

    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('dismisses the module and persists the hidden account preference', async () => {
    const { rerender } = render(<ProgressSidebarCard />);

    fireEvent.click(screen.getByRole('button', { name: /hide progress/i }));

    await waitFor(() => {
      expect(mockPatchSettings).toHaveBeenCalledWith('user-123', {
        isSidebarProgressVisible: false,
      });
    });

    rerender(<ProgressSidebarCard />);

    expect(
      document.querySelector('[data-card-index="0"]'),
    ).not.toBeInTheDocument();
    expect(mockMutateUser).toHaveBeenCalled();
  });

  it('reappears when the saved visibility preference is enabled again', async () => {
    mockCurrentUserState.currentUser = {
      id: 'user-123',
      settings: {
        isSidebarProgressVisible: false,
      },
    };

    const { rerender } = render(<ProgressSidebarCard />);

    expect(
      document.querySelector('[data-card-index="0"]'),
    ).not.toBeInTheDocument();

    mockCurrentUserState.currentUser = {
      id: 'user-123',
      settings: {
        isSidebarProgressVisible: true,
      },
    };

    rerender(<ProgressSidebarCard />);

    await waitFor(() => {
      expect(
        document.querySelector('[data-card-index="0"]'),
      ).toBeInTheDocument();
    });
  });
});
