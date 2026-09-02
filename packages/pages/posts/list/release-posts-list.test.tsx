import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CredentialPlatform,
  PageScope,
  ReleaseStatus,
} from '@genfeedai/contracts';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReleasePostsList from './release-posts-list';

function release(overrides: Partial<IReleaseGroup> = {}): IReleaseGroup {
  return {
    id: 'release-1',
    scheduledAt: '2026-08-02T09:00:00.000Z',
    status: ReleaseStatus.SCHEDULED,
    targets: [
      {
        executionState: 'scheduled',
        id: 'target-1',
        platform: CredentialPlatform.INSTAGRAM,
      },
    ],
    timezone: 'UTC',
    title: 'Campaign release',
    ...overrides,
  } as IReleaseGroup;
}

const releases = [
  release(),
  release({ id: 'release-2', title: 'Second release' }),
];

let searchParams = new URLSearchParams('');
const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/genfeed-ai/paperclip/publishing/posts',
  useRouter: () => ({
    push: vi.fn(),
    replace: replaceMock,
  }),
  useSearchParams: () => searchParams,
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/genfeed-ai/paperclip${path}`,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@contexts/posts/posts-layout-context', () => ({
  usePostsLayout: () => ({
    setFiltersNode: vi.fn(),
    setRefresh: vi.fn(),
    setViewToggleNode: vi.fn(),
  }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      pagination: {
        page: 1,
        pageSize: 12,
        total: releases.length,
        totalPages: 1,
      },
      releases,
    },
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@pages/posts/rail/release-rail-accounts', () => ({
  __esModule: true,
  default: () => <div>Accounts</div>,
}));

vi.mock('@pages/posts/rail/release-rail-segments', () => ({
  __esModule: true,
  default: () => <div>Segments</div>,
}));

vi.mock('@pages/posts/rail/release-rail-row', () => ({
  __esModule: true,
  default: ({
    onActivate,
    release: rowRelease,
  }: {
    onActivate: () => void;
    release: IReleaseGroup;
  }) => (
    <button onClick={onActivate} type="button">
      {rowRelease.title}
    </button>
  ),
}));

vi.mock('@pages/posts/release/release-detail-drawer', () => ({
  __esModule: true,
  RELEASE_RESCHEDULE_ACTION: 'release:reschedule',
  default: ({ release: selected }: { release: IReleaseGroup | null }) => (
    <div data-testid="drawer">{selected ? selected.id : 'closed'}</div>
  ),
  targetRescheduleAction: (targetId: string) => `target:reschedule:${targetId}`,
  targetRetryAction: (targetId: string) => `target:retry:${targetId}`,
}));

describe('ReleasePostsList selection from the release URL param', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams('');
    replaceMock.mockClear();
  });

  it('renders no release selected when the URL carries no release param', () => {
    render(
      <ReleasePostsList
        scope={PageScope.PUBLISHING}
        search=""
        sort="createdAt: -1"
      />,
    );

    expect(screen.getByTestId('drawer')).toHaveTextContent('closed');
  });

  it('derives the selected release from the release search param', () => {
    searchParams = new URLSearchParams('release=release-2');

    render(
      <ReleasePostsList
        scope={PageScope.PUBLISHING}
        search=""
        sort="createdAt: -1"
      />,
    );

    expect(screen.getByTestId('drawer')).toHaveTextContent('release-2');
  });

  it('sets the release param when a row is activated', () => {
    render(
      <ReleasePostsList
        scope={PageScope.PUBLISHING}
        search=""
        sort="createdAt: -1"
      />,
    );

    screen.getByText('Second release').click();

    expect(replaceMock).toHaveBeenCalledWith(
      expect.stringContaining('release=release-2'),
      expect.objectContaining({ scroll: false }),
    );
  });
});

describe('ReleasePostsList', () => {
  const source = readFileSync(
    join(process.cwd(), 'posts/list/release-posts-list.tsx'),
    'utf8',
  );

  it('reads only the canonical release list service', () => {
    expect(source).toContain('ReleaseGroupsService');
    expect(source).toContain('findAllPage');
    expect(source).not.toContain('PostsService');
    expect(source).not.toContain('findBrandPostsPage');
  });

  it('renders the rail row component instead of inline per-target JSX', () => {
    expect(source).toContain('ReleaseRailRow');
    expect(source).toContain('browserTimezone={browserTimezone}');
    expect(source).not.toContain('target.executionState');
    expect(source).not.toContain('buildSourcePostVariationsHref');
  });

  it('wires the rail segments control into the filters toolbar', () => {
    expect(source).toContain('ReleaseRailSegments');
    expect(source).toContain('deriveRailSegment');
    expect(source).toContain('applyRailSegment');
    expect(source).toContain('viewNode=');
  });

  it('wires account chips filtering by credentialIds', () => {
    expect(source).toContain('ReleaseRailAccounts');
    expect(source).toContain('credentialIds');
    expect(source).toContain('handleAccountToggle');
    expect(source).toContain('PUBLISHING_POSTS_QUERY_KEYS.ACCOUNT');
  });

  it('wires keyboard navigation across the rail rows', () => {
    expect(source).toContain('useRailKeys');
    expect(source).toContain('registerItem');
    expect(source).toContain('activeIndex');
    expect(source).toContain('onOpen');
    expect(source).toContain('onRefresh');
  });

  it('streams without required initial data and keeps loading inside the data region', () => {
    expect(source).toContain('initialPagination?: ReleaseListPagination');
    expect(source).toContain('initialReleases?: IReleaseGroup[]');
    expect(source).toContain('isLoading && data.releases.length === 0');
  });

  it('resolves user-visible copy through the host pages catalog', () => {
    expect(source).toContain("useTranslations('pages.posts.list')");
    expect(source).toContain("useTranslations('pages.posts.list.rail')");
    expect(source).not.toContain('const POSTS_LOAD_ERROR');
    expect(source).not.toContain('function viewCopy');
  });

  it('round trips the view mode through the URL, defaulting unknown values to list', () => {
    expect(source).toContain('parsePublishingPostsViewMode');
    expect(source).toContain(
      'searchParams?.get(PUBLISHING_POSTS_QUERY_KEYS.VIEW)',
    );
    expect(source).toContain('PUBLISHING_POSTS_QUERY_KEYS.VIEW');
    expect(source).toContain("nextMode === 'list'");
  });

  it('persists the chosen view per brand and offers list, board, and grid', () => {
    expect(source).toContain('usePublishingPostsViewPreference');
    expect(source).toContain('storeView(nextMode)');
    expect(source).toContain('getStoredView()');
    expect(source).toContain('ViewType.LIST');
    expect(source).toContain('ViewType.KANBAN');
    expect(source).toContain('ViewType.GRID');
  });

  it('renders the Kanban board only in board view mode, leaving list view untouched', () => {
    expect(source).toContain(
      "import ReleaseBoard from '@pages/posts/board/release-board'",
    );
    expect(source).toContain("viewMode === 'board'");
    expect(source).toContain('<ReleaseBoard');
    expect(source).toContain('releases={data.releases}');
    expect(source).toContain("viewMode === 'list' && data.releases.length > 0");
  });

  it('renders the account grid only in grid view mode', () => {
    expect(source).toContain(
      "import AccountGrid from '@pages/posts/grid/account-grid'",
    );
    expect(source).toContain("viewMode === 'grid'");
    expect(source).toContain('<AccountGrid');
    expect(source).toContain('onSelectRelease={selectRelease}');
    expect(source).toContain('selectedCredentialIds={credentialIds ?? []}');
  });
});
