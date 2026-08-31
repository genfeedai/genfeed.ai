import { ActivityKey, formatActivityMessage } from '@genfeedai/enums';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

vi.mock('@genfeedai/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/constants')>();

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

import { PageScope } from '@genfeedai/enums';
import TopbarActivityMenu, {
  TOPBAR_ACTIVITY_LIMIT,
} from './TopbarActivityMenu';

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

describe('TopbarActivityMenu', () => {
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

  it('opens a popover of the last five activities and links to workspace activity', async () => {
    const user = userEvent.setup();

    render(<TopbarActivityMenu />);

    expect(useActivitiesMock).toHaveBeenCalledWith({
      limit: TOPBAR_ACTIVITY_LIMIT,
      scope: PageScope.ORGANIZATION,
    });

    await user.click(screen.getByRole('button', { name: 'Open activity' }));

    expect(screen.getByText('Recent activity')).toBeInTheDocument();
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

  it('shows an empty state when there is no recent activity', async () => {
    useActivitiesMock.mockReturnValue({
      filteredActivities: [],
      isError: false,
      isLoading: false,
    });
    const user = userEvent.setup();

    render(<TopbarActivityMenu />);
    await user.click(screen.getByRole('button', { name: 'Open activity' }));

    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View all activity' }),
    ).toBeInTheDocument();
  });
});
