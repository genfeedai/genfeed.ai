import '@testing-library/jest-dom/vitest';
import { queryClientWrapper } from '@app-tests/query-client.harness';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UserSidebarActivity from './user-sidebar-activity';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const activities = [
  {
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    id: 'a-1',
    key: 'video-completed',
    organizationId: 'org-acme',
    organizationLabel: 'Acme',
    userId: 'user-1',
    value: '',
  },
  {
    createdAt: new Date(Date.now() - 120_000).toISOString(),
    id: 'a-2',
    key: 'image-completed',
    organizationId: 'org-acme',
    organizationLabel: 'Acme',
    userId: 'user-1',
    value: '',
  },
  {
    createdAt: new Date(Date.now() - 180_000).toISOString(),
    id: 'a-3',
    key: 'image-completed',
    organizationId: 'org-globex',
    organizationLabel: 'Globex',
    userId: 'user-1',
    value: '',
  },
  {
    createdAt: new Date(Date.now() - 240_000).toISOString(),
    id: 'a-4',
    key: 'image-completed',
    organizationId: 'org-initech',
    organizationLabel: 'Initech',
    userId: 'someone-else',
    value: '',
  },
];

// Behaves like the activities list for the user filter the sidebar sends.
vi.mock('@genfeedai/services/social/activities.service', () => ({
  ActivitiesService: {
    getInstance: () => ({
      findAllPage: async ({ userId }: { userId?: string }) => {
        const items = activities.filter(
          (activity) => activity.userId === userId,
        );
        return { items, total: items.length, totalPages: 1 };
      },
    }),
  },
}));

describe('UserSidebarActivity', () => {
  it("lists the user's latest activity and ranks their organizations by it", async () => {
    render(<UserSidebarActivity userId="user-1" />, {
      wrapper: queryClientWrapper(),
    });

    expect(await screen.findByText('Generated a video')).toBeVisible();
    expect(screen.getAllByText('Generated an image')).toHaveLength(2);
    expect(
      screen.getByRole('heading', {
        name: 'Organizations, last 50 activities',
      }),
    ).toBeVisible();
    expect(screen.getByText('Globex')).toBeVisible();
    expect(screen.queryByText('Initech')).not.toBeInTheDocument();
  });

  it('says so when the user has no activity', async () => {
    render(<UserSidebarActivity userId="user-without-activity" />, {
      wrapper: queryClientWrapper(),
    });

    expect(await screen.findByText('No activity recorded yet')).toBeVisible();
    expect(screen.getByText('No organization activity yet')).toBeVisible();
  });
});
