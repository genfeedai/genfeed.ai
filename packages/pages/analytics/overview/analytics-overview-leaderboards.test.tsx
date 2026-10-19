import '@testing-library/jest-dom/vitest';
import { PageScope } from '@genfeedai/contracts';
import AnalyticsOverviewLeaderboards from '@pages/analytics/overview/analytics-overview-leaderboards';
import type {
  IBrandWithStats,
  IOrgLeaderboardItem,
} from '@services/analytics/analytics.service';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt || ''} />
  ),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/moonrise${path}` }),
}));

vi.mock('@ui/analytics/top-posts/TopPostsSection', () => ({
  default: () => <div />,
}));

vi.mock('@contexts/ui/context-sidebar-context', () => ({
  ContextSidebarPanel: ({
    children,
    selection,
  }: {
    children: ReactNode;
    selection: { kind: string; title: string } | null;
  }) =>
    selection ? (
      <aside data-kind={selection.kind} data-testid="context-sidebar">
        <h2>{selection.title}</h2>
        {children}
      </aside>
    ) : null,
}));

const brand = {
  activePlatforms: ['twitter'],
  avgEngagementRate: 4.2,
  growth: 5,
  id: 'brand-1',
  logo: '',
  name: 'Acme',
  organizationName: 'Acme Inc',
  totalEngagement: 900,
  totalPosts: 12,
  totalViews: 4200,
} as unknown as IBrandWithStats;

const organization = {
  organization: { id: 'org-1', logo: '', name: 'Acme Inc' },
  rank: 1,
  totalEngagement: 5000,
  totalPosts: 31,
} as unknown as IOrgLeaderboardItem;

function renderLeaderboards(scope: PageScope) {
  return render(
    <AnalyticsOverviewLeaderboards
      basePath="/analytics"
      brandsLeaderboard={[brand]}
      hasBrandLeaderboard
      hasOrgLeaderboard
      hasTopPosts={false}
      isLeaderboardLoading={false}
      isTopPostsLoading={false}
      orgsLeaderboard={[organization]}
      scope={scope}
      topPosts={[]}
    />,
  );
}

describe('AnalyticsOverviewLeaderboards', () => {
  it('opens a brand summary in the sidebar from the row while the name stays a link', () => {
    renderLeaderboards(PageScope.BRAND);

    const link = screen.getByRole('link', { name: /Acme/ });
    expect(link).toHaveAttribute(
      'href',
      '/acme/moonrise/analytics/brands/brand-1',
    );
    fireEvent.click(link);
    expect(screen.queryByTestId('context-sidebar')).not.toBeInTheDocument();

    fireEvent.click(within(link.closest('tr') as HTMLElement).getByText('12'));

    const sidebar = screen.getByTestId('context-sidebar');
    expect(sidebar).toHaveAttribute('data-kind', 'brand');
    expect(
      within(sidebar).getByRole('link', { name: 'Open analytics' }),
    ).toHaveAttribute('href', '/acme/moonrise/analytics/brands/brand-1');
  });

  it('opens an organization summary for super admins', () => {
    renderLeaderboards(PageScope.SUPERADMIN);

    const link = screen.getByRole('link', { name: /Acme Inc/ });
    expect(link).toHaveAttribute('href', '/analytics/organizations/org-1');

    fireEvent.click(within(link.closest('tr') as HTMLElement).getByText('31'));

    const sidebar = screen.getByTestId('context-sidebar');
    expect(sidebar).toHaveAttribute('data-kind', 'organization');
    expect(
      within(sidebar).getByRole('link', {
        name: 'Open organization analytics',
      }),
    ).toHaveAttribute('href', '/analytics/organizations/org-1');
  });
});
