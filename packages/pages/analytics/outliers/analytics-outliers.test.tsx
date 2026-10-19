import { AnalyticsProvider } from '@contexts/analytics/analytics-context';
import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import AnalyticsOutliers from '@pages/analytics/outliers/analytics-outliers';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  getSnapshot: vi.fn(),
  listSnapshotPosts: vi.fn(),
  listPosts: vi.fn(),
  href: vi.fn((path: string) => `/org/brand${path}`),
  openRemix: vi.fn(),
  organizationId: 'org-1',
  brandId: 'brand-1' as string | undefined,
  pageScope: 'brand' as 'brand' | 'org',
  scope: {
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'brand',
  },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isCollectionFetchReady: () => true,
  toBrandListParams: ({ brandId }: { brandId?: string }) =>
    brandId ? { brandId } : {},
  useCollectionScope: () => ({ ...mocks.scope }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('@pages/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () => ({ openRemix: mocks.openRemix }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
}));

describe('AnalyticsOutliers', () => {
  beforeEach(() => {
    mocks.listPosts.mockReset();
    mocks.openRemix.mockReset();
    mocks.getSnapshot.mockReset();
    mocks.listSnapshotPosts.mockReset();
    mocks.getSnapshot.mockResolvedValue({
      computedAt: '2026-01-01T00:00:00.000Z',
      medianViews: 30000,
      sampleSize: 20,
      status: 'ready',
      windowSize: 30,
    });
    mocks.listSnapshotPosts.mockResolvedValue([
      {
        exclusionReasons: [],
        id: 'sp1',
        isContributor: true,
        isPinnedUnknown: false,
        isPromotedUnknown: false,
        logicalPostId: 'contributor-post',
        views: 1200,
      },
    ]);
    mocks.getService.mockResolvedValue({
      getSnapshot: mocks.getSnapshot,
      listPosts: mocks.listPosts,
      listSnapshotPosts: mocks.listSnapshotPosts,
    });
    mocks.brandId = 'brand-1';
    mocks.pageScope = 'brand';
  });

  it('ranks the breakout post first with ratio and remix/hook actions', async () => {
    mocks.listPosts.mockResolvedValue({
      docs: [
        {
          id: 'p1',
          logicalPostId: 'post-breakout',
          platform: 'tiktok',
          views: 300000,
          medianViews: 30000,
          sampleSize: 20,
          outlierRatio: 10,
          outlierTier: 'breakout',
          postId: 'post-1',
          sourcePostId: null,
          baselineSnapshotId: 'snap-1',
          exclusionReasons: [],
        },
      ],
      total: 1,
    });

    render(
      <AnalyticsProvider>
        <AnalyticsOutliers />
      </AnalyticsProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('post-breakout')).toBeInTheDocument(),
    );
    expect(screen.getByText('10x')).toBeInTheDocument();
    expect(screen.getByText('breakout')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'analyzeHook' })).toHaveAttribute(
      'href',
      '/org/brand/analytics/hooks?postId=post-1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'remix' }));
    expect(mocks.openRemix).toHaveBeenCalledWith({
      kind: 'owned_post',
      postId: 'post-1',
    });
    expect(mocks.listPosts).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', limit: 20, page: 1 }),
      expect.any(AbortSignal),
    );
  });

  it('opens the baseline in the sidebar on row click and links the name to the post', async () => {
    mocks.listPosts.mockResolvedValue({
      docs: [
        {
          id: 'p1',
          logicalPostId: 'post-breakout',
          platform: 'tiktok',
          views: 300000,
          medianViews: 30000,
          sampleSize: 20,
          outlierRatio: 10,
          outlierTier: 'breakout',
          postId: 'post-1',
          sourcePostId: null,
          baselineSnapshotId: 'snap-1',
          exclusionReasons: [],
        },
      ],
      total: 1,
    });

    render(
      <ContextSidebarProvider>
        <AnalyticsProvider>
          <AnalyticsOutliers />
        </AnalyticsProvider>
        <ContextSidebarOutlet testId="rail" />
      </ContextSidebarProvider>,
    );

    const nameLink = await screen.findByRole('link', { name: 'post-breakout' });
    expect(nameLink).toHaveAttribute(
      'href',
      '/org/brand/publishing/posts/post-1',
    );

    fireEvent.click(screen.getByText('tiktok'));

    const panel = await screen.findByTestId('outlier-baseline-panel');
    expect(screen.getByTestId('rail')).toContainElement(panel);
    await waitFor(() =>
      expect(screen.getByText(/contributor-post/)).toBeInTheDocument(),
    );
    expect(mocks.getSnapshot).toHaveBeenCalledWith(
      'snap-1',
      expect.any(AbortSignal),
    );
    expect(screen.getByRole('link', { name: 'openPost' })).toHaveAttribute(
      'href',
      '/org/brand/publishing/posts/post-1',
    );
  });

  it('shows insufficient-data empty copy when the ranked list is empty', async () => {
    mocks.listPosts.mockResolvedValue({ docs: [], total: 0 });
    render(
      <AnalyticsProvider>
        <AnalyticsOutliers />
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(screen.getByText('empty')).toBeInTheDocument());
  });

  it('reads the list once per scope instead of refetching on every render', async () => {
    mocks.listPosts.mockResolvedValue({ docs: [], total: 0 });
    // A fresh scope object every render, as the real hook returns.
    const { rerender } = render(
      <AnalyticsProvider>
        <AnalyticsOutliers />
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(screen.getByText('empty')).toBeInTheDocument());
    rerender(
      <AnalyticsProvider>
        <AnalyticsOutliers />
      </AnalyticsProvider>,
    );

    expect(mocks.listPosts).toHaveBeenCalledTimes(1);
  });

  it('sends the platform and tier filters from the subbar', async () => {
    mocks.listPosts.mockResolvedValue({ docs: [], total: 0 });
    render(
      <AnalyticsProvider>
        <AnalyticsOutliers platform="tiktok" tier="breakout" />
      </AnalyticsProvider>,
    );

    await waitFor(() =>
      expect(mocks.listPosts).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          platform: 'tiktok',
          tier: 'breakout',
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('shows an error state instead of an empty list when the read fails', async () => {
    mocks.listPosts.mockRejectedValue(new Error('boom'));
    render(
      <AnalyticsProvider>
        <AnalyticsOutliers />
      </AnalyticsProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('loadError')).toBeInTheDocument(),
    );
  });
});
