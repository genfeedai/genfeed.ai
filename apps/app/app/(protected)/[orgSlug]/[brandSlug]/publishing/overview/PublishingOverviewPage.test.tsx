// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { BatchItemStatus } from '@genfeedai/contracts';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockQueryResult {
  data?: unknown;
  error?: Error | null;
  isError?: boolean;
  isLoading: boolean;
  refetch?: ReturnType<typeof vi.fn>;
}

interface MockQueryOptions {
  enabled?: boolean;
  queryKey: readonly unknown[];
}

const mocks = vi.hoisted(() => ({
  brandId: 'brand-1' as string | undefined,
  pageScope: 'brand' as 'brand' | 'org',
  queryOptions: [] as MockQueryOptions[],
  queryResults: {} as Record<string, MockQueryResult>,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: mocks.brandId }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/main${path}`,
  }),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isBrandResourceReady: ({
    brandId,
    isReady,
    organizationId,
  }: {
    brandId?: string;
    isReady: boolean;
    organizationId: string;
  }) => Boolean(brandId && isReady && organizationId),
  isCollectionFetchReady: ({
    brandId,
    isReady,
    organizationId,
    pageScope,
  }: {
    brandId?: string;
    isReady: boolean;
    organizationId: string;
    pageScope: 'brand' | 'org';
  }) =>
    Boolean(
      isReady && organizationId && (pageScope === 'org' || Boolean(brandId)),
    ),
  toBrandListParams: ({ brandId }: { brandId?: string }) =>
    brandId ? { brandId } : {},
  useCollectionScope: () => ({
    brandId: mocks.brandId,
    isReady: true,
    organizationId: 'org-1',
    pageScope: mocks.pageScope,
  }),
}));

vi.mock('@services/batch/batches.service', () => ({
  BatchesService: { getInstance: vi.fn() },
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));

vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: { getInstance: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: MockQueryOptions) => {
    mocks.queryOptions.push(options);
    return {
      data: undefined,
      error: null,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
      ...mocks.queryResults[String(options.queryKey[0])],
    };
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('@ui/kpi/kpi-section/KPISection', () => ({
  default: ({
    error,
    isLoading,
    items,
  }: {
    error?: string | null;
    isLoading?: boolean;
    items: Array<{ isLoading?: boolean; label: string; value: ReactNode }>;
  }) => (
    <section
      aria-label="Publishing metrics"
      data-error={error ?? ''}
      data-loading={String(Boolean(isLoading))}
    >
      {items.map((item) => (
        <div data-loading={String(Boolean(item.isLoading))} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </section>
  ),
}));

vi.mock('@ui/overview/OverviewLayout', () => ({
  default: ({
    cards,
    header,
  }: {
    cards: Array<{
      description: string;
      href: string;
      id: string;
      label: string;
    }>;
    header: ReactNode;
  }) => (
    <main>
      {header}
      <section aria-label="Publishing destinations">
        {cards.map((card) => (
          <article key={card.id}>
            <h2>{card.label}</h2>
            <p>{card.description}</p>
            <a href={card.href}>Open {card.label}</a>
          </article>
        ))}
      </section>
    </main>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('./components/Next24hQueueSection', () => ({
  default: ({ state }: { state: { data?: unknown[]; status: string } }) => (
    <div data-testid="next-24h-queue">
      {state.status === 'success' ? state.data?.length : state.status}
    </div>
  ),
}));

vi.mock('./components/BlockedTargetsSection', () => ({
  default: ({ state }: { state: { data?: unknown[]; status: string } }) => (
    <div data-testid="blocked-targets">
      {state.status === 'success' ? state.data?.length : state.status}
    </div>
  ),
}));

vi.mock('./components/CadenceGapsSection', () => ({
  default: ({ state }: { state: { data?: unknown[]; status: string } }) => (
    <div data-testid="cadence-gaps">
      {state.status === 'success' ? state.data?.length : state.status}
    </div>
  ),
}));

vi.mock('./components/AccountHealthSection', () => ({
  default: ({ state }: { state: { data?: unknown[]; status: string } }) => (
    <div data-testid="account-health">
      {state.status === 'success' ? state.data?.length : state.status}
    </div>
  ),
}));

import PublishingOverviewPage from './PublishingOverviewPage';

function expectMetric(label: string, value: number): void {
  const metrics = screen.getByRole('region', { name: 'Publishing metrics' });
  const metric = within(metrics).getByText(label).closest('div');
  expect(metric).toHaveTextContent(`${label}${value}`);
}

describe('PublishingOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandId = 'brand-1';
    mocks.pageScope = 'brand';
    mocks.queryOptions = [];
    mocks.queryResults = {
      'publish-overview-account-health': { data: [], isLoading: false },
      'publish-overview-batches': { data: [], isLoading: false },
      'publish-overview-failed': { data: [], isLoading: false },
      'publish-overview-not-posted-total': { data: 0, isLoading: false },
      'publish-overview-posted-recent': { data: [], isLoading: false },
      'publish-overview-published-total': { data: 0, isLoading: false },
      'publish-overview-upcoming': { data: [], isLoading: false },
    };
  });

  it('keeps every KPI loading while any overview source is loading', () => {
    mocks.queryResults['publish-overview-batches'] = {
      data: [],
      isLoading: true,
    };

    render(<PublishingOverviewPage />);

    const metrics = screen.getByRole('region', { name: 'Publishing metrics' });
    expect(metrics).toHaveAttribute('data-loading', 'true');
    for (const metric of Array.from(metrics.children)) {
      expect(metric).toHaveAttribute('data-loading', 'true');
    }
  });

  it('shows failures instead of presenting unavailable totals as zero', () => {
    mocks.queryResults = {
      'publish-overview-batches': {
        isError: true,
        isLoading: false,
      },
      'publish-overview-not-posted-total': {
        isError: true,
        isLoading: false,
      },
      'publish-overview-published-total': {
        isError: true,
        isLoading: false,
      },
    };

    render(<PublishingOverviewPage />);

    expect(
      screen.getByRole('region', { name: 'Publishing metrics' }),
    ).toHaveAttribute('data-error', 'Publishing metrics could not be loaded.');
    expect(screen.getByText('Review queue could not be loaded.')).toBeVisible();
    expect(
      screen.getByText('Not-posted posts could not be loaded.'),
    ).toBeVisible();
    expect(
      screen.getByText('Published posts could not be loaded.'),
    ).toBeVisible();
  });

  it('keeps overview section failures independent and lets cadence errors win', () => {
    mocks.queryResults['publish-overview-failed'] = {
      isError: true,
      isLoading: false,
    };
    mocks.queryResults['publish-overview-account-health'] = {
      isError: true,
      isLoading: false,
    };
    mocks.queryResults['publish-overview-posted-recent'] = {
      data: [],
      isLoading: true,
    };

    render(<PublishingOverviewPage />);

    expect(screen.getByTestId('next-24h-queue')).toHaveTextContent('0');
    expect(screen.getByTestId('blocked-targets')).toHaveTextContent('error');
    expect(screen.getByTestId('account-health')).toHaveTextContent('error');
    expect(screen.getByTestId('cadence-gaps')).toHaveTextContent('error');
  });

  it('aggregates mixed batch statuses without counting reviewed items as ready', () => {
    mocks.queryResults = {
      'publish-overview-batches': {
        data: [
          {
            id: 'batch-1',
            items: [
              { id: 'ready-1', status: BatchItemStatus.COMPLETED },
              {
                id: 'approved-1',
                reviewDecision: 'approved',
                status: BatchItemStatus.COMPLETED,
              },
              { id: 'failed-1', status: BatchItemStatus.FAILED },
              { id: 'pending-1', status: BatchItemStatus.PENDING },
            ],
          },
          {
            id: 'batch-2',
            items: [
              { id: 'ready-2', status: BatchItemStatus.COMPLETED },
              { id: 'processing-1', status: BatchItemStatus.PROCESSING },
            ],
          },
        ],
        isLoading: false,
      },
      'publish-overview-not-posted-total': { data: 3, isLoading: false },
      'publish-overview-published-total': { data: 12, isLoading: false },
    };

    render(<PublishingOverviewPage />);

    expectMetric('Ready to review', 2);
    expectMetric('Not posted', 3);
    expectMetric('Published', 12);
    expectMetric('Failed items', 1);
    expect(
      screen.getByText('2 items ready to approve or reject.'),
    ).toBeVisible();
    expect(
      screen.getByText('3 draft or scheduled posts in the pipeline.'),
    ).toBeVisible();
    expect(
      screen.getByText('12 live posts across destinations.'),
    ).toBeVisible();
  });

  it('loads organization-wide publishing data without a selected brand', () => {
    mocks.brandId = undefined;
    mocks.pageScope = 'org';

    render(<PublishingOverviewPage />);

    const organizationQueryKeys = [
      'publish-overview-batches',
      'publish-overview-not-posted-total',
      'publish-overview-published-total',
      'publish-overview-upcoming',
      'publish-overview-failed',
      'publish-overview-posted-recent',
    ];

    for (const key of organizationQueryKeys) {
      const query = mocks.queryOptions.find(
        ({ queryKey }) => queryKey[0] === key,
      );
      expect(query).toMatchObject({ enabled: true });
    }

    expect(
      mocks.queryOptions.find(
        ({ queryKey }) => queryKey[0] === 'publish-overview-account-health',
      ),
    ).toMatchObject({ enabled: false });
    expect(screen.queryByTestId('account-health')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cadence-gaps')).not.toBeInTheDocument();
  });

  it('passes the derived next-24h queue, blocked groups, cadence gaps, and health rows to their sections', () => {
    mocks.queryResults['publish-overview-upcoming'] = {
      data: [
        {
          id: 'release-1',
          targets: [
            {
              credentialId: 'credential-1',
              executionState: 'scheduled',
              id: 'target-1',
              platform: 'instagram',
              scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            },
          ],
          title: 'Launch post',
        },
      ],
      isLoading: false,
    };
    mocks.queryResults['publish-overview-failed'] = {
      data: [
        {
          id: 'release-2',
          targets: [
            {
              credentialId: 'credential-2',
              error: { code: 'RATE_LIMITED', message: 'Too many requests' },
              executionState: 'failed',
              id: 'target-2',
              platform: 'x',
            },
          ],
          title: 'Failed post',
        },
      ],
      isLoading: false,
    };
    mocks.queryResults['publish-overview-account-health'] = {
      data: [
        {
          credentialId: 'credential-3',
          holdPublishing: false,
          label: 'Brand Instagram',
          override: { isActive: false },
          platform: 'instagram',
          riskLevel: 'low',
          score: 90,
          signals: {
            connectedDays: 12,
            profileSignals: 2,
            publishedPosts: 4,
            recentFailures: 0,
          },
          state: 'healthy',
        },
      ],
      isLoading: false,
    };

    render(<PublishingOverviewPage />);

    expect(screen.getByTestId('next-24h-queue')).toHaveTextContent('1');
    expect(screen.getByTestId('blocked-targets')).toHaveTextContent('1');
    expect(screen.getByTestId('cadence-gaps')).toHaveTextContent('1');
    expect(screen.getByTestId('account-health')).toHaveTextContent('1');
  });
});
