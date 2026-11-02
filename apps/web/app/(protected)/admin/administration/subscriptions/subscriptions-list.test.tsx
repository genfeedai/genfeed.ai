import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { SubscriptionStatus } from '@genfeedai/contracts';
import type { IOrganizationBilling } from '@genfeedai/contracts/interfaces';

import { render, screen, waitFor } from '@testing-library/react';
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
  queryString: 'page=2',
  tableProps: {
    current: undefined as
      | {
          getRowLink?: (item: never) => unknown;
          rowSidebar?: unknown;
        }
      | undefined,
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

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

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.queryString),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({ totals }: { totals?: { totalDocs: number } }) => (
    <nav aria-label="pagination">{totals?.totalDocs ?? '?'} organizations</nav>
  ),
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

function makeBilling(
  overrides: Partial<IOrganizationBilling> = {},
): IOrganizationBilling {
  return {
    balance: 30_000,
    currentPeriodEnd: null,
    hasPaygPurchase: false,
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

/** The billing read, recording its totals the way the service does. */
function mockRows(rows: IOrganizationBilling[], totalDocs = rows.length) {
  mocks.getAdminBilling.mockImplementation(async () => {
    return {
      data: rows,
      limit: 15,
      page: 2,
      success: true,
      totalDocs,
      totalPages: 1,
    };
  });
}

function renderList() {
  return render(<SubscriptionsList />, { wrapper: queryClientWrapper() });
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
    mocks.queryString = 'page=2';
  });

  it('lists an organization without a subscription as free, with dashes instead of N/A', async () => {
    mockRows([makeBilling()]);

    renderList();

    expect(
      await screen.findByTestId('organizationName-org-1'),
    ).toHaveTextContent('Acme');
    expect(screen.getByTestId('ownerEmail-org-1')).toHaveTextContent(
      'owner@example.com',
    );
    expect(screen.getByTestId('tier-org-1')).toHaveTextContent('free');
    expect(screen.getByTestId('status-org-1')).toHaveTextContent('-');
    expect(screen.getByTestId('stripeCustomerId-org-1')).toHaveTextContent('-');
    expect(screen.getByTestId('currentPeriodEnd-org-1')).toHaveTextContent('-');
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });

  it('marks a PAYG buyer without a subscription as free plus PAYG', async () => {
    mockRows([makeBilling({ hasPaygPurchase: true, organizationId: 'org-3' })]);

    renderList();

    expect(await screen.findByTestId('tier-org-3')).toHaveTextContent('free');
    expect(screen.getByTestId('tier-org-3')).toHaveTextContent('planPayg');
    expect(screen.getByTestId('status-org-3')).toHaveTextContent('-');
  });

  it('renders a status badge, usage and the customer id for a subscribed organization', async () => {
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

    renderList();

    expect(await screen.findByTestId('status-org-2')).toHaveTextContent(
      'Trialing',
    );
    expect(screen.getByTestId('usedPercent-org-2')).toHaveTextContent('95%');
    expect(screen.getByTestId('isMaxedOut-org-2')).toHaveTextContent(
      'flagMaxedOut',
    );
    expect(screen.getByTestId('stripeCustomerId-org-2')).toHaveTextContent(
      'cus_123',
    );
  });

  it('links the organization name to its analytics page and summarises it in the sidebar', async () => {
    const billing = makeBilling({ stripeCustomerId: 'cus_123', tier: 'scale' });
    mockRows([billing]);

    renderList();

    await screen.findByTestId('organizationName-org-1');
    const { getRowLink, rowSidebar } = getTableProps();
    expect(getRowLink?.(billing)).toEqual({
      href: '/admin/organizations/org-1',
      label: 'openNamed',
    });
    expect(rowSidebar?.kind).toBe('record');
    expect(rowSidebar?.getTitle(billing)).toBe('Acme');

    render(<div>{rowSidebar?.render(billing)}</div>);
    const summary = screen.getByTestId('table-row-summary');
    expect(summary).toHaveTextContent('owner@example.com');
    expect(summary).toHaveTextContent('cus_123');
  });

  it('requests the page named in the URL', async () => {
    mockRows([]);

    renderList();

    await waitFor(() =>
      expect(mocks.getAdminBilling).toHaveBeenCalledWith({
        limit: 15,
        page: 2,
      }),
    );
  });

  it('searches organizations server-side with the term in the URL', async () => {
    mocks.queryString = 'q=acme';
    mockRows([]);

    renderList();

    await waitFor(() =>
      expect(mocks.getAdminBilling).toHaveBeenCalledWith({
        limit: 15,
        page: 1,
        search: 'acme',
      }),
    );
  });

  it.each([
    ['organizationName', 'organizationName: 1'],
    ['-ownerEmail', 'ownerEmail: -1'],
  ])(
    'sorts organizations server-side by ?sort=%s',
    async (urlSort, apiSort) => {
      mocks.queryString = `sort=${urlSort}`;
      mockRows([]);

      renderList();

      await waitFor(() =>
        expect(mocks.getAdminBilling).toHaveBeenCalledWith({
          limit: 15,
          page: 1,
          sort: apiSort,
        }),
      );
    },
  );

  it('ignores a sort on a column the API cannot order by', async () => {
    mocks.queryString = 'sort=-balance';
    mockRows([]);

    renderList();

    await waitFor(() =>
      expect(mocks.getAdminBilling).toHaveBeenCalledWith({
        limit: 15,
        page: 1,
      }),
    );
  });
  it('paints the cached page with its own footer total when coming back', async () => {
    mockRows([makeBilling()], 42);
    const client = createTestQueryClient();
    const firstVisit = render(<SubscriptionsList />, {
      wrapper: queryClientWrapper(client),
    });
    expect(await screen.findByTestId('organizationName-org-1')).toBeVisible();
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveTextContent('42 organizations');
    firstVisit.unmount();

    mocks.getAdminBilling.mockReturnValue(new Promise(() => {}));
    render(<SubscriptionsList />, { wrapper: queryClientWrapper(client) });

    expect(screen.getByTestId('organizationName-org-1')).toHaveTextContent(
      'Acme',
    );
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toHaveTextContent('42 organizations');
  });
});
