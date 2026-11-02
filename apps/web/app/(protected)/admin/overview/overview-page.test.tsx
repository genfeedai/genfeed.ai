import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OverviewPage from './overview-page';

vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicStub() {
      return null;
    },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('../../../../tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@/hooks/data/analytics/use-admin-stats/use-admin-stats', () => ({
  useAdminStats: () => ({
    isError: false,
    isLoading: false,
    isRefreshing: false,
    leaderboard: [],
    refresh: vi.fn(),
    stats: {
      activeBots: 0,
      activeWorkflows: 146,
      pendingPosts: 1,
      recentActivities: 0,
      totalBrands: 111,
      totalModels: 307,
      totalOrganizations: 88,
      totalPosts: 140,
      totalSubscriptions: 3,
      totalUsers: 93,
    },
    timeseries: [],
  }),
}));

describe('Admin overview page', () => {
  it('opens each admin section from a quick action card that says what it holds', () => {
    render(<OverviewPage />);

    const quickActions = screen.getByTestId('admin-overview-quick-actions');

    expect(
      within(quickActions).getByRole('link', { name: 'Manage Users' }),
    ).toHaveAttribute('href', '/admin/administration/users');
    expect(
      within(quickActions).getByRole('link', { name: 'View Posts' }),
    ).toHaveAttribute('href', '/admin/content/posts');
    expect(
      within(quickActions).getByText('Review accounts, roles and access.'),
    ).toBeInTheDocument();
    expect(
      within(quickActions).getByText('Browse posts across every organization.'),
    ).toBeInTheDocument();
  });

  it.each([
    'Operational Snapshot',
    'Command Deck',
    'Performance Trend',
    'Volume Ranking',
  ])('does not show the %s eyebrow above a section title', (eyebrow) => {
    render(<OverviewPage />);

    expect(screen.queryByText(eyebrow)).not.toBeInTheDocument();
  });

  it('keeps the section titles themselves', () => {
    render(<OverviewPage />);

    expect(
      screen.getByRole('heading', { name: 'Quick Stats' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Quick Actions' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Top Organizations' }),
    ).toBeInTheDocument();
  });
});
