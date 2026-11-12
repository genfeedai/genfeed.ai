import {
  ContextSidebarHeaderOutlet,
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import { ActivityKey, PageScope } from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActivitiesList from '@/features/activities/activities-list';
import type { ActivitiesListProps } from '@/features/activities/props/activities.props';

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt || ''} />
  ),
}));

const mockRefresh = vi.fn(() => Promise.resolve());
const mockMarkActivitiesAsRead = vi.fn(() => Promise.resolve());
const mockToggleActivityRead = vi.fn(() => Promise.resolve());
const mockOpenIngredientSidebar = vi.fn();
const mockRouterPush = vi.fn();

let mockActivities: IActivity[] = [];
let isLoading = false;

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@/hooks/data/activities/use-activities/use-activities', () => ({
  useActivities: () => ({
    activities: mockActivities,
    pageTotals: { totalDocs: 61, totalPages: 5 },
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

vi.mock(
  '@/hooks/ui/ingredient/use-ingredient-sidebar/use-ingredient-sidebar',
  () => ({
    useIngredientSidebar: () => ({
      closeIngredientSidebar: vi.fn(),
      openIngredientSidebar: mockOpenIngredientSidebar,
    }),
  }),
);

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({
    totals,
  }: {
    totals?: { totalDocs: number; totalPages: number };
  }) => (
    <nav
      aria-label="pagination"
      data-total-docs={totals?.totalDocs}
      data-total-pages={totals?.totalPages}
    />
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/activities',
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    activeHref: (path: string) => `/acme/news${path}`,
    href: (path: string) => `/acme/news${path}`,
    orgHref: (path: string) => `/acme/~${path}`,
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/** Body rows only: skips the header row and the day-group heading rows. */
function getActivityRows(): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .filter(
      (row) =>
        row.querySelector('td') !== null && !row.querySelector('td[colspan]'),
    );
}

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

function renderWithSidebar(scope: ActivitiesListProps['scope']) {
  return render(
    <ContextSidebarProvider>
      <ActivitiesList
        scope={scope}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />
      <ContextSidebarHeaderOutlet testId="rail-header" />
      <ContextSidebarOutlet testId="rail" />
    </ContextSidebarProvider>,
  );
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

  it('shows what a credit paid for with a singular cost', () => {
    mockActivities = [
      buildActivity({
        key: ActivityKey.CREDITS_REMOVE,
        value: JSON.stringify({
          description: 'Onboarding preview image',
          value: 1,
        }),
      }),
    ];
    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );
    expect(screen.getByText('Onboarding preview image')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveAttribute('data-total-docs', '61');
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveAttribute('data-total-pages', '5');
    expect(screen.getByText('−1')).toBeInTheDocument();
    expect(screen.queryByText('−1 credit')).not.toBeInTheDocument();
  });

  it('shows the settled cost on a generation row', () => {
    mockActivities = [
      buildActivity({
        key: ActivityKey.IMAGE_GENERATED,
        value: JSON.stringify({ credits: 4, resultId: 'img-1' }),
      }),
    ];
    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );
    expect(screen.getByText('−4')).toBeInTheDocument();
  });

  it('shows a dash when a generation has no recorded charge', () => {
    mockActivities = [
      buildActivity({
        key: ActivityKey.IMAGE_GENERATED,
        value: JSON.stringify({ resultId: 'img-1' }),
      }),
    ];
    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('leads with a UTC clock and groups rows under a day heading', () => {
    mockActivities = [
      buildActivity({
        createdAt: '2026-01-02T09:30:15.000Z',
        id: 'newer',
        value: JSON.stringify({
          completedAt: '2026-01-02T09:31:57.000Z',
          startedAt: '2026-01-02T09:30:15.000Z',
        }),
      }),
      buildActivity({ createdAt: '2026-01-01T00:00:00.000Z', id: 'older' }),
    ];
    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    expect(screen.getByText('Fri, Jan 2 · UTC')).toBeInTheDocument();
    expect(screen.getByText('Thu, Jan 1 · UTC')).toBeInTheDocument();
    expect(screen.getByText('09:30:15')).toBeInTheDocument();
    expect(screen.getByText('ran 1m 42s')).toBeInTheDocument();
    expect(screen.queryByText(/ago$/)).not.toBeInTheDocument();
    expect(screen.getByText('00:00:00')).toBeInTheDocument();
  });

  it('offers no sort controls on any column header', () => {
    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    for (const header of screen.getAllByRole('columnheader')) {
      expect(within(header).queryByRole('button')).not.toBeInTheDocument();
    }
  });

  it('reads a post transition in words and shows the state it moved to', () => {
    mockActivities = [
      buildActivity({
        key: ActivityKey.POST_LIFECYCLE_TRANSITION,
        value: JSON.stringify({ from: 'scheduled', to: 'publishing' }),
      }),
    ];
    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    expect(
      screen.getByText('Post moved from Scheduled to Publishing'),
    ).toBeInTheDocument();
  });

  it('shows a dash instead of a status for rows that record none', () => {
    mockActivities = [
      buildActivity({
        key: ActivityKey.POST_LIFECYCLE_TRANSITION,
        value: 'not json',
      }),
    ];
    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    expect(
      within(getActivityRows()[0]).getAllByText('—').length,
    ).toBeGreaterThan(0);
    expect(within(getActivityRows()[0]).queryByText(/pending/i)).toBeNull();
  });

  it('renders no thumbnail column or media without a real preview', () => {
    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    expect(
      screen.queryByRole('columnheader', { name: 'Organization' }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
        .filter(Boolean),
    ).toEqual(['When', 'Description', 'Status', 'Credits']);
    expect(getActivityRows()[0].querySelector('img, video')).toBeNull();
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

  it('shows the generated asset from the ingredient id', () => {
    mockActivities = [
      buildActivity({
        entityId: 'ing-42',
        entityModel: 'Ingredient',
        id: 'generating-image',
        key: ActivityKey.IMAGE_PROCESSING,
        value: JSON.stringify({ ingredientId: 'ing-42', type: 'generation' }),
      }),
    ];

    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    expect(
      screen.getByRole('img', { name: /activity asset/i }),
    ).toHaveAttribute(
      'src',
      `${EnvironmentService.ingredientsEndpoint}/images/ing-42`,
    );
  });

  it('opens a failed generation from the row and the explicit link', () => {
    mockActivities = [
      buildActivity({
        entityId: 'ing-9',
        entityModel: 'Ingredient',
        id: 'failed-image',
        key: ActivityKey.IMAGE_FAILED,
        value: JSON.stringify({
          error:
            'Provider timed out: {"ingredientId":"private-id","secret":"fixture-secret"}',
        }),
      }),
    ];

    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    expect(
      screen.getByText(/The provider timed out\. Try again\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/fixture-secret|private-id/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /open failed to generate/i }),
    ).toHaveAttribute('href', '/acme/news/library/images?asset=ing-9');
  });

  it('opens a disconnected social account on the brand Channels page', () => {
    mockActivities = [
      buildActivity({
        id: 'social-disconnected',
        key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
        value: 'Twitter credential requires reconnection',
      }),
    ];

    render(
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />,
    );

    expect(screen.getAllByRole('link')[0]).toHaveAttribute(
      'href',
      '/acme/news/connectors/channels',
    );
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

  describe('row sidebar', () => {
    it('opens the sidebar from a row and keeps the name as the link', async () => {
      const user = userEvent.setup();
      mockActivities = [
        buildActivity({
          entityId: 'ing-9',
          entityModel: 'Ingredient',
          id: 'failed-image',
          key: ActivityKey.IMAGE_FAILED,
          value: JSON.stringify({ error: 'Provider timed out' }),
        }),
      ];
      renderWithSidebar(PageScope.ORGANIZATION);

      await user.click(
        screen.getByText(/The provider timed out\. Try again\./),
      );

      const rail = screen.getByTestId('rail');
      const panel = await within(rail).findByTestId('activity-detail-panel');
      expect(within(panel).getByRole('link', { name: 'Open' })).toHaveAttribute(
        'href',
        '/acme/news/library/images?asset=ing-9',
      );
      expect(
        screen.getAllByRole('link', { name: /failed to generate/i })[0],
      ).toHaveAttribute('href', expect.stringContaining('asset=ing-9'));
    });

    it('moves read state into the rail header and leads the details with status', async () => {
      const user = userEvent.setup();
      mockActivities = [
        buildActivity({
          id: 'unread-published',
          organizationId: 'org-123',
          organizationLabel: 'Acme Studio',
          value: JSON.stringify({
            platform: 'instagram',
            url: 'https://instagram.com/p/abc',
          }),
        }),
      ];
      renderWithSidebar(PageScope.ORGANIZATION);

      await user.click(getActivityRows()[0]);

      const panel = await screen.findByTestId('activity-detail-panel');
      const header = screen.getByTestId('rail-header');
      const toggle = within(header).getByTestId('activity-toggle-read');
      expect(toggle).toHaveAccessibleName('Mark as read');
      expect(
        within(panel).queryByTestId('activity-toggle-read'),
      ).not.toBeInTheDocument();

      const terms = panel.querySelectorAll('dt');
      expect(terms[0]).toHaveTextContent('Status');
      expect(terms[1]).toHaveTextContent('Organization');

      await user.click(toggle);
      expect(mockToggleActivityRead).toHaveBeenCalledWith('unread-published');
    });

    it('offers Mark as unread for a read activity', async () => {
      const user = userEvent.setup();
      mockActivities = [buildActivity({ id: 'read-one', isRead: true })];
      renderWithSidebar(PageScope.ORGANIZATION);

      await user.click(getActivityRows()[0]);

      await screen.findByTestId('activity-detail-panel');
      expect(
        within(screen.getByTestId('rail-header')).getByTestId(
          'activity-toggle-read',
        ),
      ).toHaveAccessibleName('Mark as unread');
    });

    it('plays a completed video at the top of the details', async () => {
      const user = userEvent.setup();
      mockActivities = [
        buildActivity({
          entityId: 'vid-1',
          entityModel: 'Ingredient',
          id: 'video-done',
          key: ActivityKey.VIDEO_GENERATED,
          value: JSON.stringify({ ingredientId: 'vid-1', type: 'generation' }),
        }),
      ];
      renderWithSidebar(PageScope.ORGANIZATION);

      await user.click(getActivityRows()[0]);

      const panel = await screen.findByTestId('activity-detail-panel');
      const video = panel.querySelector('video');
      expect(video).toHaveAttribute(
        'src',
        `${EnvironmentService.ingredientsEndpoint}/videos/vid-1`,
      );
    });

    it('shows the still for a completed image', async () => {
      const user = userEvent.setup();
      mockActivities = [
        buildActivity({
          entityId: 'img-1',
          entityModel: 'Ingredient',
          id: 'image-done',
          key: ActivityKey.IMAGE_GENERATED,
          value: JSON.stringify({ ingredientId: 'img-1', type: 'generation' }),
        }),
      ];
      renderWithSidebar(PageScope.ORGANIZATION);

      await user.click(getActivityRows()[0]);

      const panel = await screen.findByTestId('activity-detail-panel');
      expect(panel.querySelector('video')).toBeNull();
      expect(within(panel).getByRole('img')).toHaveAttribute(
        'src',
        `${EnvironmentService.ingredientsEndpoint}/images/img-1`,
      );
    });

    it('shows no media while a generation is running or after it failed', async () => {
      const user = userEvent.setup();
      mockActivities = [
        buildActivity({
          entityId: 'vid-2',
          entityModel: 'Ingredient',
          id: 'video-running',
          key: ActivityKey.VIDEO_PROCESSING,
          value: JSON.stringify({ ingredientId: 'vid-2', type: 'generation' }),
        }),
        buildActivity({
          entityId: 'img-2',
          entityModel: 'Ingredient',
          id: 'image-failed',
          key: ActivityKey.IMAGE_FAILED,
          value: JSON.stringify({ error: 'Provider timed out' }),
        }),
      ];
      renderWithSidebar(PageScope.ORGANIZATION);

      for (const row of [1, 2]) {
        await user.click(getActivityRows()[row - 1]);
        const panel = await screen.findByTestId('activity-detail-panel');
        expect(panel.querySelector('video')).toBeNull();
        expect(within(panel).queryByRole('img')).not.toBeInTheDocument();
      }
    });

    it('shows credits as the plain signed number', async () => {
      const user = userEvent.setup();
      mockActivities = [
        buildActivity({
          key: ActivityKey.CREDITS_REMOVE,
          value: JSON.stringify({ description: 'Image generation', value: 4 }),
        }),
      ];
      renderWithSidebar(PageScope.ORGANIZATION);

      await user.click(getActivityRows()[0]);

      const panel = await screen.findByTestId('activity-detail-panel');
      const term = within(panel).getByText('Credits');
      expect(term.nextElementSibling).toHaveTextContent(/^−4$/);
    });
  });

  describe('admin scope', () => {
    function renderAdmin() {
      return renderWithSidebar(PageScope.SUPERADMIN);
    }

    it('shows the organization name in its own column', () => {
      mockActivities = [
        buildActivity({
          organizationLabel: 'Acme Studio',
        } as Partial<IActivity>),
        buildActivity({ id: 'no-org' }),
      ];
      renderAdmin();

      expect(
        screen.getByRole('columnheader', { name: 'Organization' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Acme Studio')).toBeInTheDocument();
    });

    it('never links into the activity owner’s account', () => {
      mockActivities = [
        buildActivity({
          entityId: 'ing-9',
          entityModel: 'Ingredient',
          id: 'failed-image',
          key: ActivityKey.IMAGE_FAILED,
          value: JSON.stringify({ error: 'Provider timed out' }),
        }),
      ];
      renderAdmin();

      expect(
        screen.queryByRole('link', { name: /open failed to generate/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /library\/assets/ }),
      ).not.toBeInTheDocument();
    });

    it('offers no Open link in the sidebar', async () => {
      const user = userEvent.setup();
      mockActivities = [
        buildActivity({
          entityId: 'ing-9',
          entityModel: 'Ingredient',
          id: 'failed-image',
          key: ActivityKey.IMAGE_FAILED,
          value: JSON.stringify({ error: 'Provider timed out' }),
        }),
      ];
      renderAdmin();

      await user.click(
        screen.getByText(/The provider timed out\. Try again\./),
      );

      const panel = await screen.findByTestId('activity-detail-panel');
      expect(
        within(panel).queryByRole('link', { name: 'Open' }),
      ).not.toBeInTheDocument();
    });

    it('opens the activity detail when a row is clicked', async () => {
      const user = userEvent.setup();
      mockActivities = [
        buildActivity({
          id: 'failed-image',
          key: ActivityKey.IMAGE_FAILED,
          organizationId: 'org-123',
          organizationLabel: 'Acme Studio',
          userId: 'user-456',
          userLabel: 'Dana Fox',
          value: JSON.stringify({ error: 'Provider timed out' }),
        }),
      ];
      renderAdmin();

      await user.click(
        screen.getByText(/The provider timed out\. Try again\./),
      );

      const dialog = await screen.findByTestId('activity-detail-panel');
      expect(within(dialog).getByText('Acme Studio')).toBeInTheDocument();
      expect(within(dialog).getByText('Dana Fox')).toBeInTheDocument();
      expect(within(dialog).queryByText('org-123')).not.toBeInTheDocument();
      expect(within(dialog).queryByText('user-456')).not.toBeInTheDocument();
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Provider timed out',
      );
    });

    it('keeps the live post link on its network inside the detail', async () => {
      const user = userEvent.setup();
      mockActivities = [
        buildActivity({
          id: 'published',
          value: JSON.stringify({
            platform: 'instagram',
            url: 'https://instagram.com/p/abc',
          }),
        }),
      ];
      renderAdmin();

      await user.click(getActivityRows()[0]);

      const dialog = await screen.findByTestId('activity-detail-panel');
      expect(
        within(dialog).getByRole('link', { name: /view on instagram/i }),
      ).toHaveAttribute('href', 'https://instagram.com/p/abc');
    });
  });
  describe('names and the post behind a breakout', () => {
    const breakoutPreview = {
      authorHandle: 'vincentshipsit',
      authorName: 'Vincent Ships It',
      kind: 'post' as const,
      metrics: { likes: 38, replies: 6, reposts: 4, views: 9400 },
      platform: 'twitter',
      publishedAt: '2026-11-09T11:48:00.000Z',
      ratio: 6.8,
      remixQuery: 'remixPostId=post-1',
      text: 'Is AI not supposed to use all of the water on Earth??',
      url: 'https://x.com/vincentshipsit/status/123',
    };

    function breakoutActivity(overrides: Partial<IActivity> = {}) {
      return buildActivity({
        brandId: 'brand-id-1',
        brandLabel: 'Vincent Ships It',
        entityId: 'response-id-1',
        entityModel: 'BreakoutResponse',
        id: 'breakout',
        key: ActivityKey.BREAKOUT_REMIX_OFFERED,
        organizationId: 'org-id-1',
        organizationLabel: 'Genfeed.Ai',
        origin: 'workflow',
        preview: breakoutPreview,
        source: 'breakout-detection',
        userId: 'user-id-1',
        userLabel: 'Vincent',
        value: '“Is AI not supposed…” is outperforming your usual X posts',
        ...overrides,
      } as Partial<IActivity>);
    }

    it('reads names and plain words in the detail, with the ids behind a toggle', async () => {
      const user = userEvent.setup();
      mockActivities = [breakoutActivity()];
      renderWithSidebar(PageScope.BRAND);

      await user.click(getActivityRows()[0]);

      const panel = await screen.findByTestId('activity-detail-panel');
      const detail = (term: string) =>
        within(panel).getByText(term).nextElementSibling;
      expect(detail('User')).toHaveTextContent('Vincent');
      expect(detail('Organization')).toHaveTextContent('Genfeed.Ai');
      expect(detail('Brand')).toHaveTextContent('Vincent Ships It');
      expect(detail('Activity')).toHaveTextContent('Breakout remix offered');
      expect(detail('Source')).toHaveTextContent('Breakout detection');
      expect(detail('Origin')).toHaveTextContent('Workflow');
      expect(detail('Entity')).toHaveTextContent('Breakout response');
      expect(within(panel).queryByText('org-id-1')).not.toBeInTheDocument();
      expect(
        within(panel).queryByText('response-id-1'),
      ).not.toBeInTheDocument();

      await user.click(within(panel).getByText('Technical details'));
      expect(within(panel).getByText('org-id-1')).toBeInTheDocument();
      expect(within(panel).getByText('response-id-1')).toBeInTheDocument();
    });

    it('shows the post itself with its source and a remix, not only the stored sentence', async () => {
      const user = userEvent.setup();
      mockActivities = [breakoutActivity()];
      renderWithSidebar(PageScope.BRAND);

      await user.click(getActivityRows()[0]);

      const card = await screen.findByTestId('activity-post-preview');
      expect(
        within(card).getByText(
          'Is AI not supposed to use all of the water on Earth??',
        ),
      ).toBeInTheDocument();
      expect(within(card).getByText('@vincentshipsit')).toBeInTheDocument();
      expect(within(card).getByText('Nov 9, 2026')).toBeInTheDocument();
      expect(within(card).getByText('6.8× usual')).toBeInTheDocument();
      expect(
        within(card).getByRole('link', { name: 'View on X' }),
      ).toHaveAttribute('href', 'https://x.com/vincentshipsit/status/123');
      expect(
        within(card).getByRole('link', { name: 'Remix this post' }),
      ).toHaveAttribute(
        'href',
        expect.stringMatching(/\/analytics\/posts\?remixPostId=post-1$/),
      );
    });

    it('offers no remix to an operator, who cannot open the account', async () => {
      const user = userEvent.setup();
      mockActivities = [breakoutActivity()];
      renderWithSidebar(PageScope.SUPERADMIN);

      await user.click(getActivityRows()[0]);

      const card = await screen.findByTestId('activity-post-preview');
      expect(
        within(card).queryByRole('link', { name: 'Remix this post' }),
      ).not.toBeInTheDocument();
    });

    it('shows the post in a hover card on the row', async () => {
      const user = userEvent.setup();
      mockActivities = [breakoutActivity()];
      render(
        <ActivitiesList
          scope={PageScope.BRAND}
          isStatsEnabled={false}
          isFiltersEnabled={false}
        />,
      );

      await user.hover(screen.getByText('A post is breaking out. Remix it'));

      expect(
        await screen.findByTestId('activity-post-preview'),
      ).toHaveTextContent('Is AI not supposed to use all of the water');
    });
  });
});
