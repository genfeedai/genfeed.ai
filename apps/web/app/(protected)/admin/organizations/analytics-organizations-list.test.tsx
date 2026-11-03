import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsOrganizationsList from './analytics-organizations-list';

const mocks = vi.hoisted(() => ({
  getOrganizationsWithStats: vi.fn(),
  publishSearch: vi.fn(),
  setFilter: vi.fn(),
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
    filters: {},
    refreshTrigger: 0,
    setFilter: mocks.setFilter,
  })),
  useAnalyticsSearch: (node: ReactNode) => mocks.publishSearch(node),
}));

vi.mock('@contexts/ui/context-sidebar-context', () => ({
  useContextSidebar: () => null,
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

vi.mock(
  '@app/(protected)/admin/organizations/components/concierge/concierge-handoff',
  () => ({
    default: ({ conciergeId }: { conciergeId: string }) => (
      <div>Concierge handoff {conciergeId}</div>
    ),
  }),
);

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

  it('renders the table skeleton and hands the search to the subbar while loading', () => {
    mocks.getOrganizationsWithStats.mockReturnValueOnce(
      new Promise(() => undefined),
    );

    render(<AnalyticsOrganizationsList />);

    expect(
      screen.queryByRole('heading', { name: /All Organizations/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('skeleton-table')).toBeVisible();
    expect(mocks.publishSearch).toHaveBeenCalledWith(expect.anything());
  });

  it('publishes a search field that writes the typed query to the analytics filters', () => {
    mocks.getOrganizationsWithStats.mockReturnValueOnce(
      new Promise(() => undefined),
    );

    render(<AnalyticsOrganizationsList />);
    const searchNode = mocks.publishSearch.mock.calls.at(-1)?.[0] as ReactNode;
    render(<>{searchNode}</>);

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search organizations' }),
      { target: { value: 'acme' } },
    );

    expect(mocks.setFilter).toHaveBeenCalledWith('query', 'acme');
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

  it('links each row to its release access page when asked', async () => {
    mocks.getOrganizationsWithStats.mockResolvedValue({
      data: [
        {
          avgEngagementRate: 3.5,
          growth: 4.2,
          id: 'org-1',
          name: 'Acme Inc',
          ownerEmailClass: 'unknown',
          status: 'free',
          totalGenerations: 0,
          totalBrands: 3,
          totalEngagement: 900,
          totalMembers: 7,
          totalPosts: 31,
          totalViews: 4200,
        },
      ],
      pagination: { limit: 10, page: 1, total: 1, totalPages: 1 },
    });

    render(
      <AnalyticsOrganizationsList
        getReleaseAccessHref={(id) => `/admin/organizations/${id}`}
      />,
    );

    expect(
      await screen.findByRole('link', {
        name: 'Open release access for Acme Inc',
      }),
    ).toHaveAttribute('href', '/admin/organizations/org-1');
    // A row action, not a column of its own.
    expect(
      screen.queryByRole('columnheader', { name: 'Release access' }),
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
          ownerEmailClass: 'unknown',
          status: 'free',
          totalGenerations: 0,
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
    expect(link).toHaveAttribute('href', '/admin/organizations/org-1');
    fireEvent.click(link);
    expect(screen.queryByTestId('context-sidebar')).not.toBeInTheDocument();

    fireEvent.click(within(link.closest('tr') as HTMLElement).getByText('31'));

    const sidebar = screen.getByTestId('context-sidebar');
    expect(sidebar).toHaveAttribute('data-kind', 'organization');
    expect(
      within(sidebar).getByRole('link', {
        name: 'Open organization analytics',
      }),
    ).toHaveAttribute('href', '/admin/organizations/org-1');
  });

  it('shows each organization owner as a link to the user page', async () => {
    mocks.getOrganizationsWithStats.mockResolvedValue({
      data: [
        {
          avgEngagementRate: 0,
          growth: 0,
          id: 'org-1',
          logo: 'https://cdn.test/acme.png',
          name: 'Acme Inc',
          owner: {
            email: 'ada@example.com',
            id: 'user-9',
            name: 'Ada Lovelace',
          },
          ownerEmailClass: 'unknown',
          status: 'free',
          totalGenerations: 0,
          totalBrands: 1,
          totalEngagement: 0,
          totalMembers: 1,
          totalPosts: 0,
          totalViews: 0,
        },
        {
          avgEngagementRate: 0,
          growth: 0,
          id: 'org-2',
          name: 'Orphan',
          ownerEmailClass: 'unknown',
          status: 'free',
          totalGenerations: 0,
          totalBrands: 1,
          totalEngagement: 0,
          totalMembers: 0,
          totalPosts: 0,
          totalViews: 0,
        },
      ],
      pagination: { limit: 10, page: 1, total: 2, totalPages: 1 },
    });

    render(<AnalyticsOrganizationsList />);

    expect(
      await screen.findByRole('columnheader', { name: 'Owner' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open user Ada Lovelace' }),
    ).toHaveAttribute('href', '/admin/users/user-9');
    expect(screen.getAllByRole('link', { name: /Open user/ })).toHaveLength(1);
    expect(screen.getByText('ada@example.com')).toBeVisible();
  });

  it('does not repeat the email when it is the only name the owner has', async () => {
    mocks.getOrganizationsWithStats.mockResolvedValue({
      data: [
        {
          avgEngagementRate: 0,
          growth: 0,
          id: 'org-1',
          name: 'Gateway Ventures',
          owner: {
            email: 'poya@vitae.ai',
            id: 'user-3',
            name: 'poya@vitae.ai',
          },
          ownerEmailClass: 'unknown',
          status: 'free',
          totalGenerations: 0,
          totalBrands: 1,
          totalEngagement: 0,
          totalMembers: 1,
          totalPosts: 0,
          totalViews: 0,
        },
      ],
      pagination: { limit: 10, page: 1, total: 1, totalPages: 1 },
    });

    render(<AnalyticsOrganizationsList />);

    expect(
      await screen.findByRole('link', { name: 'Open user poya@vitae.ai' }),
    ).toBeVisible();
    expect(screen.getAllByText('poya@vitae.ai')).toHaveLength(1);
  });

  it('highlights a work email, and shows what each organization declared and generated', async () => {
    mocks.getOrganizationsWithStats.mockResolvedValue({
      data: [
        {
          avgEngagementRate: 0,
          growth: 0,
          id: 'org-work',
          name: 'Gateway Ventures',
          owner: { email: 'poya@vitae.ai', id: 'user-3', name: 'Poya' },
          ownerEmailClass: 'company',
          status: 'free',
          totalBrands: 1,
          totalEngagement: 0,
          totalGenerations: 12,
          totalMembers: 1,
          totalPosts: 0,
          totalViews: 0,
          type: 'AGENCY',
        },
        {
          avgEngagementRate: 0,
          growth: 0,
          id: 'org-personal',
          name: 'Personal',
          owner: { email: 'a@gmail.com', id: 'user-4', name: 'A' },
          ownerEmailClass: 'personal',
          status: 'free',
          totalBrands: 1,
          totalEngagement: 0,
          totalGenerations: 0,
          totalMembers: 1,
          totalPosts: 0,
          totalViews: 0,
        },
      ],
      pagination: { limit: 10, page: 1, total: 2, totalPages: 1 },
    });

    render(<AnalyticsOrganizationsList />);

    const workRow = (
      await screen.findByRole('link', { name: /Gateway Ventures/ })
    ).closest('tr') as HTMLElement;
    const personalRow = screen
      .getByRole('link', { name: /Personal/ })
      .closest('tr') as HTMLElement;
    expect(within(workRow).getByText('Work email')).toBeVisible();
    expect(within(workRow).getByText('Agency')).toBeVisible();
    expect(within(workRow).getByText('12')).toBeVisible();
    expect(within(personalRow).getByText('Personal email')).toBeVisible();
    // The default category says nothing: no declared type reads as not set.
    expect(within(personalRow).getByText('Not set')).toBeVisible();
  });

  it('shows the owner email and usage in the row sidebar', async () => {
    mocks.getOrganizationsWithStats.mockResolvedValue({
      data: [
        {
          avgEngagementRate: 0,
          growth: 0,
          id: 'org-work',
          lastActiveAt: '2026-11-01T09:30:00.000Z',
          name: 'Gateway Ventures',
          owner: { email: 'poya@vitae.ai', id: 'user-3', name: 'Poya' },
          ownerEmailClass: 'company',
          status: 'free',
          totalBrands: 1,
          totalEngagement: 0,
          totalGenerations: 12,
          totalMembers: 1,
          totalPosts: 0,
          totalViews: 0,
        },
      ],
      pagination: { limit: 10, page: 1, total: 1, totalPages: 1 },
    });

    render(<AnalyticsOrganizationsList />);

    const row = (
      await screen.findByRole('link', { name: /Gateway Ventures/ })
    ).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByText('Work email'));

    const sidebar = screen.getByTestId('context-sidebar');
    expect(within(sidebar).getByText('Generations')).toBeVisible();
    expect(within(sidebar).getByText('Posts')).toBeVisible();
    expect(within(sidebar).getByText('Nov 1, 2026')).toBeVisible();
    expect(within(sidebar).getByText('poya@vitae.ai')).toBeVisible();
  });

  describe('lifecycle status and concierge', () => {
    const baseOrg = {
      avgEngagementRate: 0,
      growth: 0,
      ownerEmailClass: 'company',
      totalBrands: 1,
      totalEngagement: 0,
      totalGenerations: 0,
      totalMembers: 1,
      totalPosts: 0,
      totalViews: 0,
    };
    const page = {
      data: [
        {
          ...baseOrg,
          concierge: { id: 'warm-1', status: 'INVITED' },
          id: 'org-concierge',
          name: 'Vitae',
          owner: { email: 'poya@vitae.ai', id: 'user-3', name: 'Poya' },
          status: 'onboarding',
        },
        {
          ...baseOrg,
          id: 'org-paid',
          name: 'Acme Inc',
          plan: 'SCALE',
          status: 'subscribed',
        },
      ],
      pagination: { limit: 10, page: 1, total: 2, totalPages: 1 },
      totals: {
        growth: 12.5,
        totalEngagement: 2300,
        totalPosts: 41,
        totalViews: 9800,
      },
    };

    it('shows where each organization stands, and the concierge stage beside the name', async () => {
      mocks.getOrganizationsWithStats.mockResolvedValue(page);

      render(<AnalyticsOrganizationsList />);

      const conciergeRow = (
        await screen.findByRole('link', { name: /Vitae/ })
      ).closest('tr') as HTMLElement;
      const paidRow = screen
        .getByRole('link', { name: /Acme Inc/ })
        .closest('tr') as HTMLElement;
      expect(
        within(screen.getByRole('table')).getByRole('columnheader', {
          name: 'Status',
        }),
      ).toBeVisible();
      expect(within(conciergeRow).getByText('Onboarding')).toBeVisible();
      expect(within(conciergeRow).getByText('Invited')).toBeVisible();
      expect(within(paidRow).getByText('Subscribed')).toBeVisible();
      expect(within(paidRow).queryByText('Invited')).not.toBeInTheDocument();
    });

    it('shows the period totals of every match above the table', async () => {
      mocks.getOrganizationsWithStats.mockResolvedValue(page);

      render(<AnalyticsOrganizationsList />);

      expect(await screen.findByText('9.8K')).toBeVisible();
      expect(screen.getByText('2.3K')).toBeVisible();
      expect(screen.getByText('41')).toBeVisible();
    });

    it('holds the concierge handoff, owner and release access in the sidebar of a concierge organization', async () => {
      mocks.getOrganizationsWithStats.mockResolvedValue(page);

      render(
        <AnalyticsOrganizationsList
          getReleaseAccessHref={(id) => `/admin/organizations/${id}/settings`}
        />,
      );

      const row = (await screen.findByText('Vitae')).closest(
        'tr',
      ) as HTMLElement;
      fireEvent.click(within(row).getByText('Work email'));

      const sidebar = screen.getByTestId('context-sidebar');
      expect(
        within(sidebar).getByText('Concierge handoff warm-1'),
      ).toBeVisible();
      expect(
        within(sidebar).getByRole('link', { name: 'Open owner' }),
      ).toHaveAttribute('href', '/admin/users/user-3');
      expect(
        within(sidebar).getByRole('link', { name: 'Release access' }),
      ).toHaveAttribute('href', '/admin/organizations/org-concierge/settings');
    });

    it('shows no concierge handoff and the plan for a self-serve organization', async () => {
      mocks.getOrganizationsWithStats.mockResolvedValue(page);

      render(<AnalyticsOrganizationsList />);

      const row = (
        await screen.findByRole('link', { name: /Acme Inc/ })
      ).closest('tr') as HTMLElement;
      fireEvent.click(within(row).getByText('Subscribed'));

      const sidebar = screen.getByTestId('context-sidebar');
      expect(within(sidebar).getByText('SCALE')).toBeVisible();
      expect(
        within(sidebar).queryByText(/Concierge handoff/),
      ).not.toBeInTheDocument();
    });
  });

  describe('server-side ordering and type filter', () => {
    // One row, so the table renders its column headers.
    const onePage = {
      data: [
        {
          avgEngagementRate: 0,
          growth: 0,
          id: 'org-1',
          name: 'Acme Inc',
          ownerEmailClass: 'unknown',
          status: 'free',
          totalGenerations: 0,
          totalBrands: 1,
          totalEngagement: 0,
          totalMembers: 1,
          totalPosts: 0,
          totalViews: 0,
        },
      ],
      pagination: { limit: 10, page: 1, total: 1, totalPages: 1 },
    };
    const lastRequest = () =>
      mocks.getOrganizationsWithStats.mock.calls.at(-1)?.[0];

    it('asks the API for the clicked metric, ascending then descending', async () => {
      const user = userEvent.setup();
      mocks.getOrganizationsWithStats.mockResolvedValue(onePage);

      render(<AnalyticsOrganizationsList />);
      await waitFor(() => {
        expect(lastRequest()).toMatchObject({
          order: 'desc',
          sort: 'engagement',
        });
      });

      const viewsHeader = await screen.findByRole('columnheader', {
        name: /Views/,
      });
      await user.click(within(viewsHeader).getByRole('button'));
      await waitFor(() => {
        expect(lastRequest()).toMatchObject({ order: 'asc', sort: 'views' });
      });

      await user.click(
        within(screen.getByRole('columnheader', { name: /Views/ })).getByRole(
          'button',
        ),
      );
      await waitFor(() => {
        expect(lastRequest()).toMatchObject({ order: 'desc', sort: 'views' });
      });
    });

    it('does not offer sorting on columns the API cannot order by', async () => {
      mocks.getOrganizationsWithStats.mockResolvedValue(onePage);

      render(<AnalyticsOrganizationsList />);

      const brandsHeader = await screen.findByRole('columnheader', {
        name: 'Brands',
      });
      expect(
        within(brandsHeader).queryByRole('button'),
      ).not.toBeInTheDocument();
    });

    it('filters by organization type and drops the filter again on All types', async () => {
      const user = userEvent.setup();
      mocks.getOrganizationsWithStats.mockResolvedValue(onePage);

      render(<AnalyticsOrganizationsList />);
      await waitFor(() => {
        expect(mocks.getOrganizationsWithStats).toHaveBeenCalled();
      });
      expect(lastRequest()).not.toHaveProperty('type');

      const searchNode = mocks.publishSearch.mock.calls.at(
        -1,
      )?.[0] as ReactNode;
      render(<>{searchNode}</>);
      await user.click(screen.getByRole('button', { name: /^Filters/ }));
      screen.getByRole('menuitem', { name: /Type/ }).focus();
      await user.keyboard('{ArrowRight}');
      await user.click(
        await screen.findByRole('menuitemradio', { name: 'Agency' }),
      );

      await waitFor(() => {
        expect(lastRequest()).toMatchObject({ page: 1, type: 'AGENCY' });
      });
    });

    it('asks the API for generations when that header is clicked', async () => {
      const user = userEvent.setup();
      mocks.getOrganizationsWithStats.mockResolvedValue(onePage);

      render(<AnalyticsOrganizationsList />);

      const generationsHeader = await screen.findByRole('columnheader', {
        name: /Generations/,
      });
      await user.click(within(generationsHeader).getByRole('button'));
      await waitFor(() => {
        expect(lastRequest()).toMatchObject({
          order: 'asc',
          sort: 'generations',
        });
      });
    });

    it.each([
      ['Owner email', 'Work email', { emailClass: 'company' }],
      ['Owner email', 'Personal email', { emailClass: 'personal' }],
      ['Usage', 'Generated or published', { usage: 'active' }],
      ['Usage', 'No activity', { usage: 'inactive' }],
      ['Status', 'Onboarding', { status: 'onboarding' }],
      ['Status', 'Past due', { status: 'past_due' }],
      ['Source', 'Concierge', { source: 'concierge' }],
      ['Source', 'Self-serve', { source: 'self_serve' }],
    ])('filters by %s: %s', async (facet, option, expected) => {
      const user = userEvent.setup();
      mocks.getOrganizationsWithStats.mockResolvedValue(onePage);

      render(<AnalyticsOrganizationsList />);
      await waitFor(() => {
        expect(mocks.getOrganizationsWithStats).toHaveBeenCalled();
      });
      expect(lastRequest()).not.toHaveProperty('emailClass');
      expect(lastRequest()).not.toHaveProperty('usage');
      expect(lastRequest()).not.toHaveProperty('status');
      expect(lastRequest()).not.toHaveProperty('source');

      const searchNode = mocks.publishSearch.mock.calls.at(
        -1,
      )?.[0] as ReactNode;
      render(<>{searchNode}</>);
      await user.click(screen.getByRole('button', { name: /^Filters/ }));
      screen.getByRole('menuitem', { name: new RegExp(facet) }).focus();
      await user.keyboard('{ArrowRight}');
      await user.click(
        await screen.findByRole('menuitemradio', { name: option }),
      );

      await waitFor(() => {
        expect(lastRequest()).toMatchObject({ page: 1, ...expected });
      });
    });
  });
});
