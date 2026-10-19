import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsOrganizationsList from './analytics-organizations-list';

const mocks = vi.hoisted(() => ({
  getOrganizationsWithStats: vi.fn(),
  setToolbarNode: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: vi.fn(() => ({
    dateRange: {
      endDate: new Date('2026-04-14T00:00:00.000Z'),
      startDate: new Date('2026-04-08T00:00:00.000Z'),
    },
    refreshTrigger: 0,
    setToolbarNode: mocks.setToolbarNode,
  })),
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

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => async () => ({
    getOrganizationsWithStats: mocks.getOrganizationsWithStats,
  })),
}));

vi.mock('@services/analytics/analytics.service', () => ({
  AnalyticsService: {
    getInstance: vi.fn(),
  },
}));

describe('AnalyticsOrganizationsList shell-first loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the table skeleton and hands the sort control to the subbar while loading', () => {
    mocks.getOrganizationsWithStats.mockReturnValueOnce(
      new Promise(() => undefined),
    );

    render(<AnalyticsOrganizationsList />);

    expect(
      screen.queryByRole('heading', { name: /All Organizations/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('skeleton-table')).toBeVisible();
    expect(mocks.setToolbarNode).toHaveBeenCalledWith(expect.anything());
  });

  it('renders the organizations table once loading resolves', async () => {
    mocks.getOrganizationsWithStats.mockResolvedValueOnce({
      data: [],
      pagination: {
        page: 1,
        total: 0,
        totalPages: 0,
      },
    });

    render(<AnalyticsOrganizationsList />);

    await waitFor(() => {
      expect(screen.queryByTestId('skeleton-table')).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole('heading', { name: /All Organizations/ }),
    ).not.toBeInTheDocument();
  });

  it('opens an organization summary in the sidebar from the row while the name stays a link', async () => {
    mocks.getOrganizationsWithStats.mockResolvedValue({
      data: [
        {
          avgEngagementRate: 3.5,
          growth: 4.2,
          id: 'org-1',
          name: 'Acme Inc',
          totalBrands: 3,
          totalEngagement: 900,
          totalMembers: 7,
          totalPosts: 31,
          totalViews: 4200,
        },
      ],
      pagination: { limit: 10, page: 1, total: 1, totalPages: 1 },
    });

    render(<AnalyticsOrganizationsList />);

    const link = await screen.findByRole('link', { name: /Acme Inc/ });
    expect(link).toHaveAttribute(
      'href',
      '/admin/overview/analytics/organizations/org-1',
    );
    fireEvent.click(link);
    expect(screen.queryByTestId('context-sidebar')).not.toBeInTheDocument();

    fireEvent.click(within(link.closest('tr') as HTMLElement).getByText('31'));

    const sidebar = screen.getByTestId('context-sidebar');
    expect(sidebar).toHaveAttribute('data-kind', 'organization');
    expect(
      within(sidebar).getByRole('link', {
        name: 'Open organization analytics',
      }),
    ).toHaveAttribute('href', '/admin/overview/analytics/organizations/org-1');
  });
});
