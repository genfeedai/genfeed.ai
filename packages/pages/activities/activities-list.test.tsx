import { ActivityKey, PageScope } from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import ActivitiesList from '@pages/activities/activities-list';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRefresh = vi.fn(() => Promise.resolve());
const mockMarkActivitiesAsRead = vi.fn(() => Promise.resolve());
const mockToggleActivityRead = vi.fn(() => Promise.resolve());
const mockOpenIngredientOverlay = vi.fn();
const mockRouterPush = vi.fn();

let mockActivities: IActivity[] = [];
let isLoading = false;

vi.mock('@hooks/data/activities/use-activities/use-activities', () => ({
  useActivities: () => ({
    activities: mockActivities,
    activityStats: { statusCounts: {}, todayCount: 0, total: 0 },
    clearCompletedActivities: vi.fn(() => Promise.resolve()),
    error: null,
    filter: '',
    filteredActivities: mockActivities,
    isError: false,
    isLoading,
    isRefreshing: false,
    markActivitiesAsRead: mockMarkActivitiesAsRead,
    refresh: mockRefresh,
    setFilter: vi.fn(),
    toggleActivityRead: mockToggleActivityRead,
  }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useIngredientOverlay: () => ({
    openIngredientOverlay: mockOpenIngredientOverlay,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/activities',
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(''),
}));

function buildActivity(overrides: Partial<IActivity> = {}): IActivity {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'activity-1',
    isDeleted: false,
    isRead: false,
    key: ActivityKey.POST_PUBLISHED,
    source: 'system',
    updatedAt: '2026-01-01T00:00:00.000Z',
    value: 'Published to instagram',
    ...overrides,
  } as unknown as IActivity;
}

describe('ActivitiesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isLoading = false;
    mockActivities = [
      buildActivity({ id: 'activity-1', isRead: false }),
      buildActivity({
        id: 'activity-2',
        isRead: true,
        value: 'A plain detail line',
      }),
    ];
  });

  it('renders the activities container', () => {
    const { container } = render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders a row for every activity returned by the hook', () => {
    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    expect(screen.getByText('A plain detail line')).toBeInTheDocument();
  });

  it('dims rows that have already been read', () => {
    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    const readRow = screen.getByText('A plain detail line').closest('tr');
    expect(readRow).toHaveClass('opacity-50');
  });

  it('offers a bulk mark-all-read action while unread activities exist', async () => {
    const user = userEvent.setup();
    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    const bulkButton = screen.getByRole('button', { name: /mark all read/i });
    expect(bulkButton).toBeEnabled();

    await user.click(bulkButton);

    await waitFor(() => {
      expect(mockMarkActivitiesAsRead).toHaveBeenCalledWith();
    });
  });

  it('disables the bulk action when every activity is already read', () => {
    mockActivities = [buildActivity({ id: 'activity-2', isRead: true })];

    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    expect(
      screen.getByRole('button', { name: /mark all read/i }),
    ).toBeDisabled();
  });

  it('shows the empty state when there is no activity', () => {
    mockActivities = [];

    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });
});
