import { fireEvent, render, screen } from '@testing-library/react';
import type { DiscoveryDeskItem } from '@/features/trends/props/discovery-desk.props';
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

vi.mock('@hooks/navigation/use-org-url', async () => {
  const { createBrandAppRoute, createOrganizationAppRoute } = await import(
    '@genfeedai/contracts/constants'
  );
  const orgHref = (path: string) => createOrganizationAppRoute('org-1', path);

  return {
    useOrgUrl: () => ({
      activeHref: (path: string) =>
        mocks.brandSlug
          ? createBrandAppRoute('org-1', mocks.brandSlug, path)
          : orgHref(path),
      brandSlug: mocks.brandSlug,
      href: (path: string) =>
        mocks.brandSlug
          ? createBrandAppRoute('org-1', mocks.brandSlug, path)
          : orgHref(path),
      orgHref,
    }),
  };
});

vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => ({ hasCanonicalBreadcrumb: true }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/org-1/brand-1/discovery/feed',
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

vi.mock('@/features/research/work-surface/ResearchWorkSurfaceProvider', () => ({
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

vi.mock('@/features/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () => ({ openRemix: mocks.openRemix }),
}));

vi.mock('@/features/trends/desk/use-discovery-desk-items', () => ({
  useDiscoveryDeskItems: () => mocks.useDiscoveryDeskItems(),
}));

vi.mock('@/features/trends/desk/desk-empty-states', () => ({
  DeskEmptyState: ({
    onFollowCreators,
    publishingHref,
    sourceHealthHref,
  }: {
    onFollowCreators: () => void;
    publishingHref: string;
    sourceHealthHref: string;
  }) => (
    <div
      data-testid="desk-empty-state"
      data-publishing-href={publishingHref}
      data-source-health-href={sourceHealthHref}
    >
      <button onClick={onFollowCreators} type="button">
        follow-creators
      </button>
    </div>
  ),
  DiscoveryReadinessCards: () => (
    <div data-testid="discovery-readiness-cards" />
  ),
}));

vi.mock('@/features/trends/desk/desk-filter-rail', () => ({
  default: ({
    onSourceChange,
    source,
  }: {
    onSourceChange: (value: string) => void;
    source: string;
  }) => (
    <div data-source={source} data-testid="desk-filter-rail">
      {['all', 'trends', 'imported'].map((value) => (
        <button key={value} onClick={() => onSourceChange(value)} type="button">
          {`source ${value}`}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/features/trends/desk/desk-sources-menu', () => ({
  default: () => <div data-testid="desk-sources-menu" />,
}));

vi.mock('@/features/trends/following/FollowSourceModal', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="follow-source-modal" /> : null,
}));

interface MockViewProps {
  items: DiscoveryDeskItem[];
  onCursor: (key: string) => void;
  onToggleSelect: (key: string) => void;
}

vi.mock('@/features/trends/desk/desk-table-view', () => ({
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

vi.mock('@/features/trends/desk/desk-light-table-view', () => ({
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

function selectSource(value: string) {
  fireEvent.click(screen.getByRole('button', { name: `source ${value}` }));
}

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
      'data-source-health-href',
      '/org-1/brand-1/discovery/trends',
    );
    expect(screen.getByTestId('discovery-readiness-cards')).toBeInTheDocument();
  });

  it.each([
    ['acme-studio', '/org-1/acme-studio/settings/profile'],
    ['north-star', '/org-1/north-star/settings/profile'],
  ])(
    'points the connection setup action at the active brand %s',
    (brandSlug, expectedHref) => {
      mocks.brandSlug = brandSlug;
      mocks.useDiscoveryDeskItems.mockReturnValue({
        ...mocks.useDiscoveryDeskItems(),
        items: [],
      });
      render(<DiscoveryDesk />);
      expect(screen.getByTestId('desk-empty-state')).toHaveAttribute(
        'data-publishing-href',
        expectedHref,
      );
    },
  );

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

  it('filters visible rows from the Source filter and records the URL source', () => {
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

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('Workflow demo clip')).toBeInTheDocument();
    expect(screen.getByText('Creator collab teaser')).toBeInTheDocument();

    selectSource('trends');

    expect(mocks.setParamState).toHaveBeenCalledWith('source', 'trends');
    expect(screen.getByText('Workflow demo clip')).toBeInTheDocument();
    expect(screen.queryByText('Creator collab teaser')).not.toBeInTheDocument();

    selectSource('imported');

    expect(mocks.setParamState).toHaveBeenCalledWith('source', 'imported');
    expect(screen.getByTestId('desk-empty-state')).toBeInTheDocument();
    expect(screen.queryByText('Workflow demo clip')).not.toBeInTheDocument();

    selectSource('all');

    expect(mocks.setParamState).toHaveBeenCalledWith('source', 'all');
    expect(screen.getByText('Workflow demo clip')).toBeInTheDocument();
    expect(screen.getByText('Creator collab teaser')).toBeInTheDocument();
  });

  it('keeps the active source after the URL source is restored', () => {
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

    expect(screen.getByText('Workflow demo clip')).toBeInTheDocument();
    expect(screen.queryByText('Creator collab teaser')).not.toBeInTheDocument();
    expect(screen.getByTestId('desk-filter-rail')).toHaveAttribute(
      'data-source',
      'trends',
    );
  });

  it('keeps search on the left of the topbar when filtered to following', () => {
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

  it('shows followed creators in the one feed when the source is following', () => {
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
    mocks.useDiscoveryDeskItems.mockReturnValue({
      ...mocks.useDiscoveryDeskItems(),
      items: [trendsItem, followingItem],
    });
    mocks.paramState.source = 'following';

    render(<DiscoveryDesk />);

    expect(screen.getByText('Followed creator signal')).toBeInTheDocument();
    expect(screen.queryByText('Public trend signal')).not.toBeInTheDocument();
  });

  it('opens the follow dialog from the empty state', () => {
    mocks.useDiscoveryDeskItems.mockReturnValue({
      ...mocks.useDiscoveryDeskItems(),
      items: [],
      sources: [],
    });

    render(<DiscoveryDesk />);

    expect(screen.queryByTestId('follow-source-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'follow-creators' }));

    expect(screen.getByTestId('follow-source-modal')).toBeInTheDocument();
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
