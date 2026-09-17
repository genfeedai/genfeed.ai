import { AnalyticsProvider } from '@contexts/analytics/analytics-context';
import AnalyticsOutliers from '@pages/analytics/outliers/analytics-outliers';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  listPosts: vi.fn(),
  href: vi.fn((path: string) => `/org/brand${path}`),
  organizationId: 'org-1',
  brandId: 'brand-1' as string | undefined,
  pageScope: 'brand' as 'brand' | 'org',
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isCollectionFetchReady: () => true,
  toBrandListParams: ({ brandId }: { brandId?: string }) =>
    brandId ? { brandId } : {},
  useCollectionScope: () => ({
    brandId: mocks.brandId,
    isReady: true,
    organizationId: mocks.organizationId,
    pageScope: mocks.pageScope,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ui/primitives/sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: <T,>({
    columns,
    emptyLabel,
    getRowKey,
    isLoading,
    items,
  }: {
    columns: Array<{ header: string; render?: (item: T) => ReactNode }>;
    emptyLabel?: string;
    getRowKey: (item: T) => string;
    isLoading?: boolean;
    items: T[];
  }) => {
    if (isLoading) return <div data-testid="outliers-loading" />;
    if (!items.length) return <div>{emptyLabel}</div>;
    return (
      <table>
        <tbody>
          {items.map((item) => (
            <tr key={getRowKey(item)}>
              {columns.map((column) => (
                <td key={column.header}>
                  {column.render ? column.render(item) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

describe('AnalyticsOutliers', () => {
  beforeEach(() => {
    mocks.listPosts.mockReset();
    mocks.getService.mockResolvedValue({ listPosts: mocks.listPosts });
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
    expect(screen.getByRole('link', { name: 'Analyze hook' })).toHaveAttribute(
      'href',
      '/org/brand/analytics/hooks?postId=post-1',
    );
    expect(screen.getByRole('link', { name: 'Remix' })).toHaveAttribute(
      'href',
      '/org/brand/publishing/remix?platform=tiktok&postId=post-1',
    );
    expect(mocks.listPosts).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', limit: 50 }),
      expect.any(AbortSignal),
    );
  });

  it('shows insufficient-data empty copy when the ranked list is empty', async () => {
    mocks.listPosts.mockResolvedValue({ docs: [], total: 0 });
    render(
      <AnalyticsProvider>
        <AnalyticsOutliers />
      </AnalyticsProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText('No outlier posts for these filters'),
      ).toBeInTheDocument(),
    );
  });
});
