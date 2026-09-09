import { ActivityKey, formatActivityMessage } from '@genfeedai/contracts';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useActivitiesMock = vi.fn();

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/brand${path}`,
  }),
}));

vi.mock('@hooks/data/activities/use-activities/use-activities', () => ({
  useActivities: (...args: unknown[]) => useActivitiesMock(...args),
}));

vi.mock('@/hooks/i18n/useActivityMessageFormatter', () => ({
  useActivityMessageFormatter: () => formatActivityMessage,
}));

vi.mock('@genfeedai/contracts/constants', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/contracts/constants')>();

  return {
    ...actual,
    APP_ROUTES: {
      ...actual.APP_ROUTES,
      WORKSPACE: {
        ...actual.APP_ROUTES.WORKSPACE,
        ACTIVITY: '/workspace/activity',
      },
    },
  };
});

import { PageScope } from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import ActivityFeed, {
  ActivityFeedContent,
  TOPBAR_ACTIVITY_LIMIT,
} from './ActivityFeed';

function activityFixture(
  index: number,
  overrides: Partial<{
    isRead: boolean;
    key: string;
    source: string;
    status: string;
    value: string;
  }> = {},
) {
  return {
    createdAt: `2026-08-25T12:0${index}:00.000Z`,
    id: `activity-${index}`,
    isRead: true,
    key: ActivityKey.IMAGE_GENERATED,
    source: 'image-generate',
    status: 'completed',
    value: '',
    ...overrides,
  };
}

describe('ActivityFeed', () => {
  beforeEach(() => {
    useActivitiesMock.mockReturnValue({
      filteredActivities: [
        activityFixture(1, {
          isRead: false,
          key: ActivityKey.CREDITS_REMOVE,
          source: 'prompt-create',
          value: '1',
        }),
        activityFixture(2, {
          key: ActivityKey.IMAGE_FAILED,
          status: 'failed',
        }),
        activityFixture(3),
        activityFixture(4),
        activityFixture(5),
        activityFixture(6),
      ],
      isError: false,
      isLoading: false,
    });
  });

  it('lists the last five activities and links to workspace activity', () => {
    render(<ActivityFeed />);

    expect(useActivitiesMock).toHaveBeenCalledWith({
      limit: TOPBAR_ACTIVITY_LIMIT,
      scope: PageScope.ORGANIZATION,
    });

    const rows = screen.getAllByTestId('topbar-activity-row');
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByText('Prompt creation')).toBeInTheDocument();
    expect(within(rows[0]).getByText('1 credit used')).toBeInTheDocument();
    expect(
      within(rows[0]).getByTestId('activity-unread-dot'),
    ).toBeInTheDocument();
    expect(
      within(rows[1]).getByText('Failed to generate image'),
    ).toBeInTheDocument();
    expect(within(rows[1]).getByText('Image generation')).toBeInTheDocument();
    expect(within(rows[4]).getByText('Generated an image')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Activity' })).toBeNull();

    expect(
      screen.getByRole('link', { name: 'View all activity' }),
    ).toHaveAttribute('href', '/acme/brand/workspace/activity');
  });

  it('keeps every active row ahead of recent history and exposes its result link', () => {
    const rows = [
      activityFixture(1),
      ...Array.from({ length: 7 }, (_, index) =>
        activityFixture(index + 2, { key: ActivityKey.IMAGE_PROCESSING }),
      ),
    ] as IActivity[];
    render(
      <ActivityFeedContent
        filteredActivities={rows}
        isError={false}
        isLoading={false}
        getActivityHref={(item) =>
          `/acme/brand/library/images?asset=${item.id}`
        }
      />,
    );
    expect(screen.getAllByTestId('topbar-activity-row')).toHaveLength(7);
    expect(screen.getAllByRole('link')[0]).toHaveAttribute(
      'href',
      '/acme/brand/library/images?asset=activity-2',
    );
  });

  it('shows an empty state when there is no recent activity', () => {
    useActivitiesMock.mockReturnValue({
      filteredActivities: [],
      isError: false,
      isLoading: false,
    });
    render(<ActivityFeed />);

    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View all activity' }),
    ).toBeInTheDocument();
  });
});
