import { render, screen } from '@testing-library/react';
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
  useActivityMessageFormatter: () => (descriptor: { id: string }) =>
    descriptor.id,
}));

vi.mock('@pages/activities/activities-list.utils', () => ({
  getActivityDescription: (activity: { key: string }) => activity.key,
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

function activityFixture(index: number) {
  return {
    createdAt: `2026-08-25T12:0${index}:00.000Z`,
    id: `activity-${index}`,
    key: `generated-image-${index}`,
  };
}

describe('TopbarActivityMenu', () => {
  beforeEach(() => {
    useActivitiesMock.mockReturnValue({
      filteredActivities: [
        activityFixture(1),
        activityFixture(2),
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

    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getAllByTestId('topbar-activity-row')).toHaveLength(5);
    expect(screen.getByText('generated-image-1')).toBeInTheDocument();
    expect(screen.getByText('generated-image-5')).toBeInTheDocument();
    expect(screen.queryByText('generated-image-6')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Activity' })).toBeNull();

    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/acme/brand/workspace/activity',
    );
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
    expect(screen.getByRole('link', { name: 'View all' })).toBeInTheDocument();
  });
});
