import '@testing-library/jest-dom/vitest';
import type { Subscription } from '@models/billing/subscription.model';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionsList from './subscriptions-list';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token-1'),
}));

vi.mock('@services/billing/subscriptions.service', () => ({
  SubscriptionsService: {
    getInstance: () => ({
      findAll: mocks.findAll,
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

vi.mock('@components/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: () => <div>Refresh</div>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    columns,
    items,
  }: {
    columns: Array<{
      header: string;
      key: string;
      render?: (item: Subscription) => ReactNode;
    }>;
    items: Subscription[];
  }) => (
    <div>
      {items.map((item) => (
        <div key={item.id}>
          {columns.map((column) => (
            <div key={column.key} data-testid={`${column.key}-${item.id}`}>
              {column.render ? column.render(item) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('@components/lazy/lazy-modal.admin', () => ({
  LazyModalSubscription: () => null,
}));

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    category: 'org',
    currentPeriodEnd: null,
    id: 'sub-1',
    organization: {
      balance: 42,
      id: 'org-1',
      label: 'Acme',
    },
    status: 'active',
    stripeCustomerId: 'cus_1',
    user: { email: 'owner@example.com' },
    ...overrides,
  } as Subscription;
}

describe('SubscriptionsList', () => {
  beforeEach(() => {
    mocks.findAll.mockReset();
    mocks.useQuery.mockImplementation(() => ({
      data: [makeSubscription(), makeSubscription({ id: 'sub-orphaned' })],
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    }));
  });

  it('renders organization balance when the nested org is missing', () => {
    mocks.useQuery.mockImplementation(() => ({
      data: [
        makeSubscription({
          id: 'sub-orphaned',
          organization: undefined,
        }),
      ],
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    }));

    render(<SubscriptionsList />);

    expect(screen.getByTestId('balance-sub-orphaned')).toHaveTextContent('0');
    expect(screen.getByTestId('organization-sub-orphaned')).toHaveTextContent(
      'N/A',
    );
  });
});
