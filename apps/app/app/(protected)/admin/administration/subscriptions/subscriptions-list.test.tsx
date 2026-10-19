import '@testing-library/jest-dom/vitest';
import { SubscriptionStatus } from '@genfeedai/contracts';
import type { IOrganizationBilling } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionsList from './subscriptions-list';

interface MockRowLink {
  href: string;
  label: string;
}

interface MockRowSidebar {
  getTitle: (item: IOrganizationBilling) => string;
  kind: string;
  render: (item: IOrganizationBilling) => ReactNode;
}

const mocks = vi.hoisted(() => ({
  getAdminBilling: vi.fn(),
  tableProps: {
    current: undefined as
      | {
          getRowLink?: (item: IOrganizationBilling) => MockRowLink;
          rowSidebar?: MockRowSidebar;
        }
      | undefined,
  },
  useQuery: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token-1'),
}));

vi.mock('@services/billing/subscriptions.service', () => ({
  SubscriptionsService: {
    getInstance: () => ({
      getAdminBilling: mocks.getAdminBilling,
    }),
  },
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({
      copyToClipboard: vi.fn(),
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryFn: () => Promise<unknown> }) =>
    mocks.useQuery(options),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('page=2'),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <div>Pager</div>,
}));

vi.mock('./credit-holds-panel', () => ({
  default: () => null,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    columns,
    getRowKey,
    getRowLink,
    items,
    rowSidebar,
  }: {
    columns: Array<{
      header: string;
      key: string;
      render?: (item: IOrganizationBilling) => ReactNode;
    }>;
    getRowKey: (item: IOrganizationBilling) => string;
    getRowLink?: (item: IOrganizationBilling) => MockRowLink;
    items: IOrganizationBilling[];
    rowSidebar?: MockRowSidebar;
  }) => {
    mocks.tableProps.current = { getRowLink, rowSidebar };
    return (
      <div>
        {items.map((item) => (
          <div key={getRowKey(item)}>
            {columns.map((column) => (
              <div
                key={column.key}
                data-testid={`${column.key}-${item.organizationId}`}
              >
                {column.render ? column.render(item) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock('@components/lazy/lazy-modal.admin', () => ({
  LazyModalSubscription: () => null,
}));

function makeBilling(
  overrides: Partial<IOrganizationBilling> = {},
): IOrganizationBilling {
  return {
    balance: 30_000,
    currentPeriodEnd: null,
    hasSubscription: false,
    isMaxedOut: false,
    isUnderUsing: false,
    organizationId: 'org-1',
    organizationName: 'Acme',
    ownerEmail: 'owner@example.com',
    plan: null,
    planLimit: 0,
    remainingPercent: 100,
    status: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    tier: 'free',
    usedCredits: 0,
    usedPercent: 0,
    ...overrides,
  };
}

function mockRows(rows: IOrganizationBilling[]) {
  mocks.useQuery.mockImplementation(() => ({
    data: {
      data: rows,
      limit: 15,
      page: 2,
      success: true,
      totalDocs: rows.length,
      totalPages: 1,
    },
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  }));
}

function getTableProps(): {
  getRowLink?: (item: IOrganizationBilling) => MockRowLink;
  rowSidebar?: MockRowSidebar;
} {
  return (mocks.tableProps.current ?? {}) as ReturnType<typeof getTableProps>;
}

describe('SubscriptionsList', () => {
  beforeEach(() => {
    mocks.getAdminBilling.mockReset();
    mocks.useQuery.mockReset();
  });

  it('lists an organization without a subscription as free, with dashes instead of N/A', () => {
    mockRows([makeBilling()]);

    render(<SubscriptionsList />);

    expect(screen.getByTestId('organizationName-org-1')).toHaveTextContent(
      'Acme',
    );
    expect(screen.getByTestId('ownerEmail-org-1')).toHaveTextContent(
      'owner@example.com',
    );
    expect(screen.getByTestId('tier-org-1')).toHaveTextContent('free');
    expect(screen.getByTestId('status-org-1')).toHaveTextContent('-');
    expect(screen.getByTestId('stripeCustomerId-org-1')).toHaveTextContent('-');
    expect(screen.getByTestId('currentPeriodEnd-org-1')).toHaveTextContent('-');
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });

  it('renders a status badge, usage and the customer id for a subscribed organization', () => {
    mockRows([
      makeBilling({
        hasSubscription: true,
        isMaxedOut: true,
        organizationId: 'org-2',
        planLimit: 60_000,
        status: SubscriptionStatus.TRIALING,
        stripeCustomerId: 'cus_123',
        tier: 'scale',
        usedPercent: 95,
      }),
    ]);

    render(<SubscriptionsList />);

    expect(screen.getByTestId('status-org-2')).toHaveTextContent('Trialing');
    expect(screen.getByTestId('usedPercent-org-2')).toHaveTextContent('95%');
    expect(screen.getByTestId('isMaxedOut-org-2')).toHaveTextContent(
      'flagMaxedOut',
    );
    expect(screen.getByTestId('stripeCustomerId-org-2')).toHaveTextContent(
      'cus_123',
    );
  });

  it('links the organization name to its analytics page and summarises it in the sidebar', () => {
    const billing = makeBilling({ stripeCustomerId: 'cus_123', tier: 'scale' });
    mockRows([billing]);

    render(<SubscriptionsList />);

    const { getRowLink, rowSidebar } = getTableProps();
    expect(getRowLink?.(billing)).toEqual({
      href: '/admin/overview/analytics/organizations/org-1',
      label: 'openNamed',
    });
    expect(rowSidebar?.kind).toBe('record');
    expect(rowSidebar?.getTitle(billing)).toBe('Acme');

    render(<>{rowSidebar?.render(billing)}</>);
    const summary = screen.getByTestId('table-row-summary');
    expect(summary).toHaveTextContent('owner@example.com');
    expect(summary).toHaveTextContent('cus_123');
  });

  it('requests the page named in the URL', async () => {
    mockRows([]);
    mocks.getAdminBilling.mockResolvedValue({ data: [] });

    render(<SubscriptionsList />);

    const options = mocks.useQuery.mock.calls[0]?.[0] as {
      queryFn: () => Promise<unknown>;
      queryKey: unknown[];
    };
    await options.queryFn();

    expect(options.queryKey).toEqual(['admin-subscriptions', 2]);
    expect(mocks.getAdminBilling).toHaveBeenCalledWith({ limit: 15, page: 2 });
  });
});
