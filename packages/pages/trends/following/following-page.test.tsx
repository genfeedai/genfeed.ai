import '@testing-library/jest-dom/vitest';
import { SocialSourcePlatform, SourcePostActionType } from '@genfeedai/enums';
import type {
  ISocialSource,
  ISourcePost,
  SocialSourcesResponse,
} from '@genfeedai/interfaces';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FollowingPage, { getSafeExternalUrl } from './following-page';

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  deleteSource: vi.fn(),
  invalidateQueries: vi.fn(),
  isRemixAvailable: true,
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  openRemix: vi.fn(),
  refetch: vi.fn(),
  routerPush: vi.fn(),
  syncBrand: vi.fn(),
  syncSource: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { alt, ...rest } = props;
    const safeProps = Object.fromEntries(
      Object.entries(rest).filter(
        ([, value]) => typeof value !== 'boolean' || value !== true,
      ),
    );
    return <img {...safeProps} alt={alt || ''} />;
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: () => ({ brandSlug: 'brand-1', orgSlug: 'org-1' }),
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) => {
      const messages: Record<string, string> = {
        'actions.createDraft': 'Create draft',
        'actions.openSource': 'Open source',
        'actions.quote': 'Quote',
        'actions.reply': 'Reply',
        'actions.repost': 'Repost',
        'actions.sendToAgent': 'Send to agent',
        'errors.load': 'Failed to load the following feed.',
        'filters.allPlatforms': 'All platforms',
        'manage.empty': 'No followed sources yet.',
        'manage.imported': 'Imported',
        'manage.summary': '{active} active of {total} sources',
        'manage.title': 'Manage sources',
      };
      return (messages[key] ?? key).replace(
        /\{(\w+)\}/g,
        (_match, name: string) => String(values?.[name] ?? ''),
      );
    },
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
  useBrandId: () => 'brand-1',
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org-1/brand-1${path}` }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token'),
}));

vi.mock('@hooks/utils/use-debounce/use-debounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock('@pages/research/work-surface/ResearchWorkSurfaceProvider', () => ({
  useOptionalResearchWorkSurface: () => null,
  useResearchPagination: <T,>(items: readonly T[]) => ({
    pageItems: items,
    pagination: null,
  }),
  useResearchQueryState: () => ['', vi.fn()],
  useResearchSearchParamState: <T,>({ defaultValue }: { defaultValue: T }) => [
    defaultValue,
    vi.fn(),
  ],
  useRestoreResearchFinding: vi.fn(),
}));

vi.mock('@pages/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () =>
    mocks.isRemixAvailable ? { openRemix: mocks.openRemix } : null,
}));

vi.mock('@pages/trends/following/FollowSourceModal', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="follow-source-modal" /> : null,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notifyError,
      success: mocks.notifySuccess,
    }),
  },
}));

vi.mock('@services/social/social-sources.service', () => ({
  SocialSourcesService: {
    getInstance: () => ({
      delete: mocks.deleteSource,
      syncBrand: mocks.syncBrand,
      syncSource: mocks.syncSource,
    }),
  },
}));

vi.mock('@services/social/source-posts.service', () => ({
  SourcePostsService: {
    getInstance: () => ({
      createDraft: mocks.createDraft,
    }),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mocks.useQuery(...args),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

function makePost(overrides: Partial<ISourcePost> = {}): ISourcePost {
  return {
    authorHandle: 'builder',
    contentType: 'tweet',
    externalId: 'ext-1',
    id: 'post-1',
    mediaUrls: [],
    metrics: { comments: 4, likes: 120, shares: 2, views: 5000 },
    platform: SocialSourcePlatform.TWITTER,
    publishedAt: '2026-08-01T10:00:00.000Z',
    sourceUrl: 'https://x.com/builder/status/1',
    text: 'Agents are eating the content stack.',
    thumbnailUrl: null,
    ...overrides,
  } as ISourcePost;
}

function makeSource(overrides: Partial<ISocialSource> = {}): ISocialSource {
  return {
    displayName: 'Builder',
    handle: 'builder',
    id: 'source-1',
    lastSyncedAt: '2026-08-01T09:00:00.000Z',
    lastSyncStatus: 'success',
    platform: SocialSourcePlatform.TWITTER,
    ...overrides,
  } as ISocialSource;
}

function makeFeed(
  overrides: Partial<SocialSourcesResponse> = {},
): SocialSourcesResponse {
  const posts = overrides.posts ?? [makePost()];
  const sources = overrides.sources ?? [makeSource()];
  return {
    posts,
    sources,
    summary: {
      activeSources: sources.length,
      lastSyncedAt: '2026-08-01T09:00:00.000Z',
      totalPosts: posts.length,
      totalSources: sources.length,
      ...overrides.summary,
    },
  } as SocialSourcesResponse;
}

function setFeed(
  feed: SocialSourcesResponse,
  extra: { isError?: boolean; isFetching?: boolean } = {},
) {
  mocks.useQuery.mockReturnValue({
    data: feed,
    isError: extra.isError ?? false,
    isFetching: extra.isFetching ?? false,
    refetch: mocks.refetch,
  });
}

describe('getSafeExternalUrl', () => {
  it('accepts http and https urls', () => {
    expect(getSafeExternalUrl('https://x.com/a')).toBe('https://x.com/a');
    expect(getSafeExternalUrl('http://x.com/a')).toBe('http://x.com/a');
  });

  it('rejects other protocols, invalid urls, and empty values', () => {
    expect(getSafeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(getSafeExternalUrl('not a url')).toBeNull();
    expect(getSafeExternalUrl(null)).toBeNull();
    expect(getSafeExternalUrl(undefined)).toBeNull();
  });
});

describe('FollowingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRemixAvailable = true;
    mocks.refetch.mockResolvedValue(undefined);
    mocks.invalidateQueries.mockResolvedValue(undefined);
    mocks.syncBrand.mockResolvedValue({ count: 2, failures: [] });
    mocks.syncSource.mockResolvedValue({ count: 1 });
    mocks.deleteSource.mockResolvedValue(undefined);
    mocks.createDraft.mockResolvedValue({ id: 'draft-1' });
    setFeed(makeFeed());
  });

  it('renders the topbar summary and post cards with metrics', () => {
    render(<FollowingPage />);

    expect(screen.getByText('Following')).toBeInTheDocument();
    expect(
      screen.getByText('1 posts · 1 active of 1 sources'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Agents are eating the content stack.'),
    ).toBeInTheDocument();
    expect(screen.getByText('5.0k views')).toBeInTheDocument();
    expect(screen.getByText('120 likes')).toBeInTheDocument();
    expect(screen.getByText('4 comments')).toBeInTheDocument();
    expect(screen.getByText('2 shares')).toBeInTheDocument();
  });

  it('shows the empty state and opens the follow modal when no sources exist', async () => {
    const user = userEvent.setup();
    setFeed(
      makeFeed({
        posts: [],
        sources: [],
        summary: { activeSources: 0, totalPosts: 0, totalSources: 0 },
      }),
    );
    render(<FollowingPage />);

    expect(
      screen.getByText('Follow sources for this brand'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Follow accounts once — see every platform here'),
    ).toBeInTheDocument();

    await user.click(
      screen.getAllByRole('button', { name: /follow source/i })[0],
    );
    expect(screen.getByTestId('follow-source-modal')).toBeInTheDocument();
  });

  it('renders the error alert and retries the query', async () => {
    const user = userEvent.setup();
    setFeed(makeFeed(), { isError: true });
    render(<FollowingPage />);

    expect(
      screen.getByText('Failed to load the following feed.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('syncs all sources from the topbar and reports the result', async () => {
    const user = userEvent.setup();
    render(<FollowingPage />);

    await user.click(screen.getByRole('button', { name: 'Sync' }));

    await waitFor(() => {
      expect(mocks.syncBrand).toHaveBeenCalledWith({
        brandId: 'brand-1',
        limit: 25,
      });
      expect(mocks.notifySuccess).toHaveBeenCalledWith('Synced 2 posts');
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['social-sources-feed'],
      });
    });
  });

  it('reports failures and zero-post syncs', async () => {
    const user = userEvent.setup();
    mocks.syncBrand.mockResolvedValue({
      count: 0,
      failures: [{ sourceId: 'source-1' }],
    });
    render(<FollowingPage />);

    await user.click(screen.getByRole('button', { name: 'Sync' }));

    await waitFor(() => {
      expect(mocks.notifyError).toHaveBeenCalledWith('1 source failed to sync');
    });
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
  });

  it('notifies when sync succeeds with zero posts and no failures', async () => {
    const user = userEvent.setup();
    mocks.syncBrand.mockResolvedValue({ count: 0, failures: [] });
    render(<FollowingPage />);

    await user.click(screen.getByRole('button', { name: 'Sync' }));

    await waitFor(() => {
      expect(mocks.notifyError).toHaveBeenCalledWith(
        'Sync finished with 0 posts — check X API / Apify configuration',
      );
    });
  });

  it('surfaces sync errors from the service', async () => {
    const user = userEvent.setup();
    mocks.syncBrand.mockRejectedValue(new Error('rate limited'));
    render(<FollowingPage />);

    await user.click(screen.getByRole('button', { name: 'Sync' }));

    await waitFor(() => {
      expect(mocks.notifyError).toHaveBeenCalledWith('rate limited');
    });
  });

  it('manages sources: per-source sync and removal from the dialog', async () => {
    const user = userEvent.setup();
    setFeed(
      makeFeed({
        sources: [
          makeSource(),
          makeSource({
            handle: 'flaky',
            id: 'source-2',
            lastSyncedAt: undefined,
            lastSyncError: 'Collector exploded',
            lastSyncStatus: 'failed',
          }),
          makeSource({
            handle: 'quiet',
            id: 'source-3',
            lastSyncStatus: 'empty',
          }),
        ],
        summary: { activeSources: 2, totalPosts: 1, totalSources: 3 },
      }),
    );
    render(<FollowingPage />);

    await user.click(screen.getByRole('button', { name: 'Manage sources' }));

    expect(
      screen.getByRole('heading', { name: 'Manage sources' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('Never synced')).toBeInTheDocument();
    expect(screen.getByText('Collector exploded')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Sync source' })[0]);
    await waitFor(() => {
      expect(mocks.syncSource).toHaveBeenCalledWith('source-1', {
        brandId: 'brand-1',
        limit: 25,
      });
      expect(mocks.notifySuccess).toHaveBeenCalledWith('Synced 1 post');
    });

    await user.click(
      screen.getAllByRole('button', { name: 'Remove source' })[1],
    );
    await waitFor(() => {
      expect(mocks.deleteSource).toHaveBeenCalledWith('source-2');
      expect(mocks.notifySuccess).toHaveBeenCalledWith('Source removed');
    });
  });

  it('warns when a per-source sync stores zero posts', async () => {
    const user = userEvent.setup();
    mocks.syncSource.mockResolvedValue({ count: 0 });
    render(<FollowingPage />);

    await user.click(screen.getByRole('button', { name: 'Manage sources' }));
    await user.click(screen.getAllByRole('button', { name: 'Sync source' })[0]);

    await waitFor(() => {
      expect(mocks.notifyError).toHaveBeenCalledWith(
        expect.stringContaining('Sync finished with 0 posts'),
      );
    });
  });

  it('shows the failed-sync empty state when sources exist without posts', () => {
    setFeed(
      makeFeed({
        posts: [],
        sources: [
          makeSource({
            lastSyncError: 'Bad token',
            lastSyncStatus: 'failed',
          }),
        ],
        summary: { activeSources: 1, totalPosts: 0, totalSources: 1 },
      }),
    );
    render(<FollowingPage />);

    expect(screen.getByText('No collected posts yet')).toBeInTheDocument();
    expect(screen.getByText(/Last sync failed: Bad token/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sync sources' }),
    ).toBeInTheDocument();
  });

  it('routes followed posts to the org- and brand-scoped variation flow on remix', async () => {
    const user = userEvent.setup();
    render(<FollowingPage />);

    await user.click(screen.getByRole('button', { name: 'Remix' }));

    expect(mocks.routerPush).toHaveBeenCalledTimes(1);
    expect(mocks.routerPush).toHaveBeenCalledWith(
      '/org-1/brand-1/publishing/remix?platform=twitter&sourcePostId=post-1',
    );
  });

  it.each([
    [SocialSourcePlatform.INSTAGRAM, 'instagram'],
    ['youtube', 'youtube'],
  ] as const)(
    'opens the shared prefilled brief for followed %s posts',
    async (platform, idSuffix) => {
      const user = userEvent.setup();
      setFeed(
        makeFeed({
          posts: [
            makePost({
              contentType: 'video',
              id: `post-${idSuffix}-1`,
              platform,
              thumbnailUrl: 'https://cdn.example.test/video.jpg',
            }),
          ],
        }),
      );
      render(<FollowingPage />);

      await user.click(screen.getByRole('button', { name: 'Remix' }));

      expect(mocks.openRemix).toHaveBeenCalledWith({
        kind: 'source_post',
        sourcePostId: `post-${idSuffix}-1`,
      });
      expect(mocks.routerPush).not.toHaveBeenCalled();
    },
  );

  it('opens the shared prefilled brief for followed TikTok posts', async () => {
    const user = userEvent.setup();
    setFeed(
      makeFeed({
        posts: [
          makePost({
            contentType: 'video',
            id: 'post-tiktok-1',
            platform: SocialSourcePlatform.TIKTOK,
          }),
        ],
      }),
    );
    render(<FollowingPage />);

    await user.click(screen.getByRole('button', { name: 'Remix' }));

    expect(mocks.openRemix).toHaveBeenCalledWith({
      kind: 'source_post',
      sourcePostId: 'post-tiktok-1',
    });
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });

  it('falls back to the legacy remix route when the provider is missing', async () => {
    mocks.isRemixAvailable = false;
    const user = userEvent.setup();
    setFeed(
      makeFeed({
        posts: [
          makePost({
            contentType: 'video',
            id: 'post-tiktok-1',
            platform: SocialSourcePlatform.TIKTOK,
          }),
        ],
      }),
    );
    render(<FollowingPage />);

    await user.click(screen.getByRole('button', { name: 'Remix' }));

    expect(mocks.openRemix).not.toHaveBeenCalled();
    expect(mocks.routerPush).toHaveBeenCalledWith(
      '/org-1/brand-1/publishing/remix?platform=tiktok&sourcePostId=post-tiktok-1',
    );
  });

  it('creates a reply draft from the post dropdown for twitter posts', async () => {
    const user = userEvent.setup();
    render(<FollowingPage />);

    await user.click(
      screen.getByRole('button', { name: 'More following actions' }),
    );
    await user.click(await screen.findByText('Reply'));

    await waitFor(() => {
      expect(mocks.createDraft).toHaveBeenCalledWith(
        'post-1',
        { actionType: SourcePostActionType.REPLY },
        { brandId: 'brand-1' },
      );
      expect(mocks.notifySuccess).toHaveBeenCalledWith('Draft created');
    });
  });

  it('creates distinct quote and repost drafts for twitter posts', async () => {
    const user = userEvent.setup();
    render(<FollowingPage />);

    await user.click(
      screen.getByRole('button', { name: 'More following actions' }),
    );
    await user.click(await screen.findByText('Quote'));
    await waitFor(() => {
      expect(mocks.createDraft).toHaveBeenCalledWith(
        'post-1',
        { actionType: SourcePostActionType.QUOTE },
        { brandId: 'brand-1' },
      );
    });

    await user.click(
      screen.getByRole('button', { name: 'More following actions' }),
    );
    await user.click(await screen.findByText('Repost'));
    await waitFor(() => {
      expect(mocks.createDraft).toHaveBeenCalledWith(
        'post-1',
        { actionType: SourcePostActionType.REPOST },
        { brandId: 'brand-1' },
      );
    });
  });

  it('sends a post to the agent from the dropdown', async () => {
    const user = userEvent.setup();
    render(<FollowingPage />);

    await user.click(
      screen.getByRole('button', { name: 'More following actions' }),
    );
    await user.click(await screen.findByText('Send to agent'));

    expect(mocks.routerPush).toHaveBeenCalledTimes(1);
  });
});
