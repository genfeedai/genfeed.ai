import type { DiscoveryDeskItem } from '@props/trends/discovery-desk.props';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  brandSlug: 'brand-1',
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
  openRemix: vi.fn().mockResolvedValue(undefined),
  paramState: {} as Record<string, string>,
  setParamState: vi.fn((key: string, value: string) => {
    mocks.paramState[key] = value;
  }),
  useDiscoveryDeskItems: vi.fn(),
}));

function buildItem(
  overrides: Partial<DiscoveryDeskItem> = {},
): DiscoveryDeskItem {
  const key = overrides.key ?? 'trend:default';
  return {
    authorHandle: 'builderx',
    contentType: 'post',
    engagement: 100,
    id: key,
    key,
    kind: 'trend',
    matchedTrends: ['#AIAgents'],
    metrics: { likes: 100 },
    platform: 'twitter',
    raw: {
      item: {
        id: key,
        platform: 'twitter',
        text: 'AI agents keep shipping',
        title: 'AI agents keep shipping',
        trendTopic: '#AIAgents',
        trendViralityScore: 80,
      },
      kind: 'trend',
    },
    remixSelector: {
      kind: 'trend_reference',
      sourceReferenceId: `ref-${key}`,
      trendId: `trend-${key}`,
    },
    source: 'trends',
    text: 'AI agents keep shipping',
    title: 'AI agents keep shipping',
    trendTopic: '#AIAgents',
    velocity: 10,
    virality: 80,
    ...overrides,
  } as DiscoveryDeskItem;
}

const ITEM_ONE = buildItem({ key: 'trend:one', title: 'First signal' });
const ITEM_TWO = buildItem({ key: 'trend:two', title: 'Second signal' });

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
  useBrandId: () => 'brand-1',
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    brandSlug: mocks.brandSlug,
    href: (path: string) => `/org-1/${mocks.brandSlug || '~'}${path}`,
    orgHref: (path: string) => `/org-1/~${path}`,
  }),
}));

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => ({ hasCanonicalBreadcrumb: true }),
}));

vi.mock('@genfeedai/contexts/ui/page-help-context', () => ({
  usePageHelp: () => null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/org-1/brand-1/discovery/overview',
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@pages/research/work-surface/ResearchWorkSurfaceProvider', () => ({
  useOptionalResearchWorkSurface: () => null,
  useResearchQueryState: () => ['', vi.fn()],
  useResearchSearchParamState: ({
    defaultValue,
    key,
  }: {
    defaultValue: string;
    key: string;
  }) => [
    mocks.paramState[key] ?? defaultValue,
    (value: string) => mocks.setParamState(key, value),
  ],
  useRestoreResearchFinding: vi.fn(),
}));

vi.mock('@pages/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () => ({ openRemix: mocks.openRemix }),
}));

vi.mock('@pages/trends/desk/use-discovery-desk-items', () => ({
  useDiscoveryDeskItems: () => mocks.useDiscoveryDeskItems(),
}));

vi.mock('@pages/trends/desk/desk-empty-states', () => ({
  DeskEmptyState: ({
    followingHref,
    publishingHref,
    sourceHealthHref,
  }: {
    followingHref: string;
    publishingHref: string;
    sourceHealthHref: string;
  }) => (
    <div
      data-testid="desk-empty-state"
      data-following-href={followingHref}
      data-publishing-href={publishingHref}
      data-source-health-href={sourceHealthHref}
    />
  ),
  DiscoveryReadinessCards: () => (
    <div data-testid="discovery-readiness-cards" />
  ),
}));

vi.mock('@pages/trends/desk/desk-filter-rail', () => ({
  default: () => <div data-testid="desk-filter-rail" />,
}));

vi.mock('@pages/trends/desk/desk-heat-strip', () => ({
  default: () => <div data-testid="desk-heat-strip" />,
}));

vi.mock('@pages/trends/desk/desk-sources-menu', () => ({
  default: () => <div data-testid="desk-sources-menu" />,
}));

vi.mock('@pages/trends/following/FollowSourceModal', () => ({
  default: () => null,
}));

interface MockViewProps {
  items: DiscoveryDeskItem[];
  onCursor: (key: string) => void;
  onToggleSelect: (key: string) => void;
}

vi.mock('@pages/trends/desk/desk-table-view', () => ({
  default: ({ items, onCursor, onToggleSelect }: MockViewProps) => (
    <div data-testid="desk-table-view">
      {items.map((item) => (
        <div key={item.key}>
          <button onClick={() => onCursor(item.key)} type="button">
            {item.title}
          </button>
          <button
            aria-label={`select-${item.key}`}
            onClick={() => onToggleSelect(item.key)}
            type="button"
          >
            select
          </button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@pages/trends/desk/desk-light-table-view', () => ({
  default: ({ items }: MockViewProps) => (
    <div data-testid="desk-light-table-view">
      {items.map((item) => (
        <span key={item.key}>{item.title}</span>
      ))}
    </div>
  ),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notifyError,
      info: mocks.notifyInfo,
    }),
  },
}));

import DiscoveryDesk from './discovery-desk';

describe('DiscoveryDesk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paramState = {};
    mocks.brandSlug = 'brand-1';
    mocks.openRemix.mockResolvedValue(undefined);

    mocks.useDiscoveryDeskItems.mockReturnValue({
      error: null,
      isLoading: false,
      isRefreshing: false,
      items: [ITEM_ONE, ITEM_TWO],
      refresh: vi.fn().mockResolvedValue(undefined),
      sources: [],
      summary: {
        connectedPlatforms: ['twitter'],
        lockedPlatforms: [],
        totalItems: 2,
        totalTrends: 2,
      },
    });
  });

  it('renders setup actions alongside readiness when no observed posts exist', () => {
    mocks.useDiscoveryDeskItems.mockReturnValue({
      ...mocks.useDiscoveryDeskItems(),
      items: [],
    });
    render(<DiscoveryDesk />);
    expect(screen.getByTestId('desk-empty-state')).toHaveAttribute(
      'data-following-href',
      '/org-1/brand-1/discovery/following',
    );
    expect(screen.getByTestId('desk-empty-state')).toHaveAttribute(
      'data-publishing-href',
      '/org-1/brand-1/settings/connected-accounts',
    );
    expect(screen.getByTestId('desk-empty-state')).toHaveAttribute(
      'data-source-health-href',
      '/org-1/brand-1/discovery/trends',
    );
    expect(screen.getByTestId('discovery-readiness-cards')).toBeInTheDocument();
  });

  it('offers brand selection for organization connection setup', () => {
    mocks.brandSlug = '';
    mocks.useDiscoveryDeskItems.mockReturnValue({
      ...mocks.useDiscoveryDeskItems(),
      items: [],
    });
    render(<DiscoveryDesk />);
    expect(screen.getByTestId('desk-empty-state')).toHaveAttribute(
      'data-publishing-href',
      '/org-1/~/settings/brands',
    );
  });

  it('puts search on the left of the module topbar', () => {
    render(<DiscoveryDesk />);

    const search = screen.getByPlaceholderText('Search the Desk');
    expect(
      search.closest('[data-testid="section-topbar-leading"]'),
    ).not.toBeNull();
    expect(
      screen.getByTestId('container-header-actions').contains(search),
    ).toBe(false);
  });

  it('filters visible rows from the source tabs and records the URL source', () => {
    const trendsItem = buildItem({
      key: 'trend:public',
      source: 'trends',
      title: 'Workflow demo clip',
    });
    const followingItem = buildItem({
      key: 'post:followed',
      source: 'following',
      title: 'Creator collab teaser',
    });
    mocks.useDiscoveryDeskItems.mockReturnValue({
      ...mocks.useDiscoveryDeskItems(),
      items: [trendsItem, followingItem],
    });

    render(<DiscoveryDesk />);

    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByText('Workflow demo clip')).toBeInTheDocument();
    expect(screen.getByText('Creator collab teaser')).toBeInTheDocument();

    const trendsTab = screen.getByRole('tab', { name: 'Public trends' });
    fireEvent.mouseDown(trendsTab, { button: 0, ctrlKey: false });

    expect(trendsTab).toHaveAttribute('data-state', 'active');
    expect(mocks.setParamState).toHaveBeenCalledWith('source', 'trends');
    expect(screen.getByText('Workflow demo clip')).toBeInTheDocument();
    expect(screen.queryByText('Creator collab teaser')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'My accounts' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(mocks.setParamState).toHaveBeenCalledWith('source', 'owned');
    expect(screen.getByTestId('desk-empty-state')).toBeInTheDocument();
    expect(screen.queryByText('Workflow demo clip')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'All' }), {
      button: 0,
      ctrlKey: false,
    });

    expect(mocks.setParamState).toHaveBeenCalledWith('source', 'all');
    expect(screen.getByText('Workflow demo clip')).toBeInTheDocument();
    expect(screen.getByText('Creator collab teaser')).toBeInTheDocument();
  });

  it('activates a source tab from the keyboard', () => {
    render(<DiscoveryDesk />);

    const trendsTab = screen.getByRole('tab', { name: 'Public trends' });
    fireEvent.keyDown(trendsTab, { key: 'Enter' });

    expect(trendsTab).toHaveAttribute('data-state', 'active');
    expect(mocks.setParamState).toHaveBeenCalledWith('source', 'trends');
  });

  it('keeps the active source tab after the URL source is restored', () => {
    mocks.paramState.source = 'trends';
    const trendsItem = buildItem({
      key: 'trend:public',
      source: 'trends',
      title: 'Workflow demo clip',
    });
    const followingItem = buildItem({
      key: 'post:followed',
      source: 'following',
      title: 'Creator collab teaser',
    });
    mocks.useDiscoveryDeskItems.mockReturnValue({
      ...mocks.useDiscoveryDeskItems(),
      items: [trendsItem, followingItem],
    });

    render(<DiscoveryDesk />);

    expect(screen.getByRole('tab', { name: 'Public trends' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByText('Workflow demo clip')).toBeInTheDocument();
    expect(screen.queryByText('Creator collab teaser')).not.toBeInTheDocument();
  });

  it('keeps search on the left of the Following topbar', () => {
    mocks.paramState.source = 'following';

    render(<DiscoveryDesk />);

    const search = screen.getByPlaceholderText('Search the Desk');
    expect(
      search.closest('[data-testid="section-topbar-leading"]'),
    ).not.toBeNull();
  });

  it('renders the table view when explicitly requested', () => {
    mocks.paramState.view = 'table';
    render(<DiscoveryDesk />);

    expect(screen.getByTestId('desk-table-view')).toBeInTheDocument();
    expect(
      screen.queryByTestId('desk-light-table-view'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('First signal')).toBeInTheDocument();
    expect(screen.getByText('Second signal')).toBeInTheDocument();
    expect(screen.queryByText('Source health')).not.toBeInTheDocument();
  });

  it('renders the grid view by default', () => {
    render(<DiscoveryDesk />);

    expect(screen.getByTestId('desk-light-table-view')).toBeInTheDocument();
    expect(screen.queryByTestId('desk-table-view')).not.toBeInTheDocument();
  });

  it('mirrors the light-table grid with skeleton cards while it loads', () => {
    mocks.paramState.view = 'grid';
    mocks.useDiscoveryDeskItems.mockReturnValue({
      ...mocks.useDiscoveryDeskItems(),
      isLoading: true,
      items: [],
    });

    render(<DiscoveryDesk />);

    const skeleton = screen.getByTestId('desk-light-table-skeleton');
    expect(skeleton).toHaveClass('@container');
    expect(skeleton.querySelectorAll('[role="status"]').length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByTestId('desk-light-table-view'),
    ).not.toBeInTheDocument();
  });

  it('keeps the text loading state for the table view', () => {
    mocks.paramState.view = 'table';
    mocks.useDiscoveryDeskItems.mockReturnValue({
      ...mocks.useDiscoveryDeskItems(),
      isLoading: true,
      items: [],
    });

    render(<DiscoveryDesk />);

    expect(
      screen.queryByTestId('desk-light-table-skeleton'),
    ).not.toBeInTheDocument();
  });

  it('renders the Following deck with one column per platform when ?source=following', () => {
    const trendsItem = buildItem({
      key: 'trend:public',
      source: 'trends',
      title: 'Public trend signal',
    });
    const followingItem = buildItem({
      key: 'trend:followed',
      source: 'following',
      title: 'Followed creator signal',
    });
    const linkedinItem = buildItem({
      key: 'trend:linkedin',
      platform: 'linkedin',
      source: 'following',
      title: 'LinkedIn creator signal',
    });
    mocks.useDiscoveryDeskItems.mockReturnValue({
      error: null,
      isLoading: false,
      isRefreshing: false,
      items: [trendsItem, followingItem, linkedinItem],
      refresh: vi.fn().mockResolvedValue(undefined),
      sources: [],
      summary: {
        connectedPlatforms: ['twitter'],
        lockedPlatforms: [],
        totalItems: 3,
        totalTrends: 3,
      },
    });
    mocks.paramState.source = 'following';

    render(<DiscoveryDesk />);

    expect(screen.getByTestId('following-deck')).toBeInTheDocument();
    expect(screen.queryByTestId('desk-table-view')).not.toBeInTheDocument();
    expect(screen.getByText('Followed creator signal')).toBeInTheDocument();
    expect(screen.getByText('LinkedIn creator signal')).toBeInTheDocument();
    expect(screen.queryByText('Public trend signal')).not.toBeInTheDocument();
    // Trend corpus health is about public trends, not followed creators.
    expect(screen.queryByText('Source health')).not.toBeInTheDocument();

    const columns = screen.getAllByTestId('following-deck-column');
    expect(columns.map((column) => column.getAttribute('aria-label'))).toEqual([
      'X',
      'LinkedIn',
    ]);
    for (const column of columns) {
      expect(column).toHaveClass('flex-1');
      expect(column).toHaveClass('min-w-80');
      expect(column).not.toHaveClass('w-80');
    }
    const addColumn = screen.getByRole('button', { name: /Add a column/ });
    expect(addColumn).toBeInTheDocument();
    expect(addColumn).toHaveClass('shrink-0');
    expect(screen.getByTestId('following-deck').firstElementChild).toHaveClass(
      'w-full',
    );
  });

  it('shows the follow-creators empty state on the Following deck without sources', () => {
    mocks.useDiscoveryDeskItems.mockReturnValue({
      ...mocks.useDiscoveryDeskItems(),
      items: [],
      sources: [],
    });
    mocks.paramState.source = 'following';

    render(<DiscoveryDesk />);

    expect(
      screen.getByText('Follow creators to build your deck'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('discovery-readiness-cards'),
    ).not.toBeInTheDocument();
  });

  it('shows the selection bar after selecting a row and batch-remixes sequentially', async () => {
    mocks.paramState.view = 'table';
    render(<DiscoveryDesk />);

    fireEvent.click(screen.getByLabelText('select-trend:one'));
    fireEvent.click(screen.getByLabelText('select-trend:two'));

    expect(screen.getByText('2 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remix 2' }));

    await vi.waitFor(() => {
      expect(mocks.openRemix).toHaveBeenCalledTimes(2);
    });

    expect(mocks.openRemix).toHaveBeenNthCalledWith(1, ITEM_ONE.remixSelector);
    expect(mocks.openRemix).toHaveBeenNthCalledWith(2, ITEM_TWO.remixSelector);
  });

  it('supports J/K to move the cursor, X to select, and R to remix via keyboard', async () => {
    render(<DiscoveryDesk />);

    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'x' });

    expect(screen.getByText('1 selected')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'r' });

    await vi.waitFor(() => {
      expect(mocks.openRemix).toHaveBeenCalledTimes(1);
    });
    expect(mocks.openRemix).toHaveBeenCalledWith(ITEM_ONE.remixSelector);
  });
});
