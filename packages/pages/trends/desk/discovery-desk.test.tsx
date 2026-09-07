import type { DiscoveryDeskItem } from '@props/trends/discovery-desk.props';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
    href: (path: string) => `/org-1/brand-1${path}`,
    orgHref: (path: string) => `/org-1${path}`,
  }),
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
  DeskEmptyState: () => <div data-testid="desk-empty-state" />,
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

  it('renders the table view by default', () => {
    render(<DiscoveryDesk />);

    expect(screen.getByTestId('desk-table-view')).toBeInTheDocument();
    expect(
      screen.queryByTestId('desk-light-table-view'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('First signal')).toBeInTheDocument();
    expect(screen.getByText('Second signal')).toBeInTheDocument();
  });

  it('renders the light table view when ?view=grid', () => {
    mocks.paramState.view = 'grid';

    render(<DiscoveryDesk />);

    expect(screen.getByTestId('desk-light-table-view')).toBeInTheDocument();
    expect(screen.queryByTestId('desk-table-view')).not.toBeInTheDocument();
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
    expect(
      screen.getByRole('button', { name: /Add a column/ }),
    ).toBeInTheDocument();
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
  it('shows unavailable health alongside retained signals after a health failure', () => {
    mocks.useDiscoveryDeskItems.mockReturnValue({
      ...mocks.useDiscoveryDeskItems(),
      healthError: new Error('internal health error'),
    });
    render(<DiscoveryDesk />);
    expect(screen.getByText('Trend corpus unavailable')).toBeInTheDocument();
    expect(screen.getByText('First signal')).toBeInTheDocument();
    expect(screen.getByTestId('desk-table-view')).toBeInTheDocument();
    expect(screen.queryByText('internal health error')).not.toBeInTheDocument();
  });

  it('scopes the source health panel to the platform URL filter', () => {
    mocks.paramState.platform = 'reddit';
    render(<DiscoveryDesk />);
    expect(screen.getByRole('group', { name: 'Reddit' })).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'X / Twitter' }),
    ).not.toBeInTheDocument();
  });
});
