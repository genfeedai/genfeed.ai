// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { BatchItemStatus } from '@genfeedai/enums';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockQueryResult {
  data?: unknown;
  isError?: boolean;
  isLoading: boolean;
}

interface MockQueryOptions {
  enabled?: boolean;
  queryKey: readonly unknown[];
}

const mocks = vi.hoisted(() => ({
  brandId: 'brand-1' as string | undefined,
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

vi.mock('@services/batch/batches.service', () => ({
  BatchesService: { getInstance: vi.fn() },
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: MockQueryOptions) => {
    mocks.queryOptions.push(options);
    return (
      mocks.queryResults[String(options.queryKey[0])] ?? {
        data: undefined,
        isLoading: false,
      }
    );
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('@ui/kpi/kpi-section/KPISection', () => ({
  default: ({
    isLoading,
    items,
  }: {
    isLoading?: boolean;
    items: Array<{ isLoading?: boolean; label: string; value: ReactNode }>;
  }) => (
    <section
      aria-label="Publishing metrics"
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
    mocks.queryOptions = [];
    mocks.queryResults = {
      'publish-overview-batches': { data: [], isLoading: false },
      'publish-overview-not-posted-total': { data: 0, isLoading: false },
      'publish-overview-published-total': { data: 0, isLoading: false },
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

  it('shows honest zero-value empty states when overview queries have no data', () => {
    mocks.queryResults = {
      'publish-overview-batches': {
        data: undefined,
        isError: true,
        isLoading: false,
      },
      'publish-overview-not-posted-total': {
        data: undefined,
        isError: true,
        isLoading: false,
      },
      'publish-overview-published-total': {
        data: undefined,
        isError: true,
        isLoading: false,
      },
    };

    render(<PublishingOverviewPage />);

    expectMetric('Ready to review', 0);
    expectMetric('Not posted', 0);
    expectMetric('Published', 0);
    expectMetric('Failed items', 0);
    expect(screen.getByText('No open batches')).toBeVisible();
    expect(
      screen.getByText(
        'No queue pressure — open Review when the next batch lands.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'No drafts waiting — create a release when you are ready.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Nothing live yet — approved work will land here after publish.',
      ),
    ).toBeVisible();
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
      screen.getByText(
        '2 open batches · 2 still generating · 2 need a decision',
      ),
    ).toBeVisible();
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

  it('disables both publication queries until a brand is available', () => {
    mocks.brandId = undefined;

    render(<PublishingOverviewPage />);

    const notPostedQuery = mocks.queryOptions.find(
      ({ queryKey }) => queryKey[0] === 'publish-overview-not-posted-total',
    );
    const publishedQuery = mocks.queryOptions.find(
      ({ queryKey }) => queryKey[0] === 'publish-overview-published-total',
    );

    expect(notPostedQuery).toMatchObject({ enabled: false });
    expect(publishedQuery).toMatchObject({ enabled: false });
  });
});
