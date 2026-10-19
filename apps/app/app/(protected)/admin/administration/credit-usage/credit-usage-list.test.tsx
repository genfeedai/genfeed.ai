import type { IOrganizationCreditUsage } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SubscriptionStatus } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';
import CreditUsageList from './credit-usage-list';

const maxedOutRow: IOrganizationCreditUsage = {
  balance: 100,
  currentPeriodEnd: '2026-08-01T00:00:00.000Z',
  isMaxedOut: true,
  isUnderUsing: false,
  organizationId: 'org-maxed',
  organizationName: 'Maxed Org',
  planLimit: 1000,
  status: SubscriptionStatus.ACTIVE,
  tier: 'scale',
  usedCredits: 950,
  usedPercent: 95,
  remainingPercent: 5,
};

const underUsingRow: IOrganizationCreditUsage = {
  balance: 900,
  currentPeriodEnd: '2026-08-01T00:00:00.000Z',
  isMaxedOut: false,
  isUnderUsing: true,
  organizationId: 'org-under',
  organizationName: 'Under Org',
  planLimit: 1000,
  status: SubscriptionStatus.ACTIVE,
  tier: 'starter',
  usedCredits: 50,
  usedPercent: 5,
  remainingPercent: 95,
};

const normalRow: IOrganizationCreditUsage = {
  balance: 500,
  currentPeriodEnd: null,
  isMaxedOut: false,
  isUnderUsing: false,
  organizationId: 'org-normal',
  organizationName: 'Normal Org',
  planLimit: 1000,
  status: null,
  tier: null,
  usedCredits: 500,
  usedPercent: 50,
  remainingPercent: 50,
};

const mockGetCreditUsage = vi.fn().mockResolvedValue({
  data: [maxedOutRow, underUsingRow, normalRow],
  limit: 20,
  page: 1,
  success: true,
  totalDocs: 3,
  totalPages: 1,
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn().mockResolvedValue({
      getCreditUsage: mockGetCreditUsage,
    }),
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});
const navigation = vi.hoisted(() => ({ search: '' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({ totalLabel }: { totalLabel: string }) => (
    <nav aria-label="pagination" data-total-label={totalLabel} />
  ),
}));

vi.mock('@services/billing/subscriptions.service', () => ({
  SubscriptionsService: {
    getInstance: vi.fn(),
  },
}));

const queryState = vi.hoisted(() => ({
  lastOptions: undefined as
    | undefined
    | {
        queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
        queryKey: unknown[];
      },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((options: typeof queryState.lastOptions) => {
    queryState.lastOptions = options;
    return {
      data: {
        data: [maxedOutRow, underUsingRow, normalRow],
        limit: 20,
        page: 1,
        success: true,
        totalDocs: 3,
        totalPages: 1,
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    };
  }),
}));

describe('CreditUsageList', () => {
  it('should render without crashing', () => {
    const { container } = render(<CreditUsageList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render organization rows', () => {
    render(<CreditUsageList />);

    expect(screen.getByText('Maxed Org')).toBeInTheDocument();
    expect(screen.getByText('Under Org')).toBeInTheDocument();
    expect(screen.getByText('Normal Org')).toBeInTheDocument();
  });

  it('should show a "Maxed out" badge for organizations at or above 90% usage', () => {
    render(<CreditUsageList />);

    expect(screen.getByText('Maxed out')).toBeInTheDocument();
  });

  it('should show an "Under-using" badge for organizations at or below 10% usage', () => {
    render(<CreditUsageList />);

    expect(screen.getByText('Under-using')).toBeInTheDocument();
  });

  it('should not show either flag badge for a normal-usage organization', () => {
    render(<CreditUsageList />);

    const maxedOutBadges = screen.getAllByText('Maxed out');
    const underUsingBadges = screen.getAllByText('Under-using');

    expect(maxedOutBadges).toHaveLength(1);
    expect(underUsingBadges).toHaveLength(1);
  });

  it('requests the page from the URL and renders pagination', async () => {
    navigation.search = 'page=2';
    render(<CreditUsageList />);

    await queryState.lastOptions?.queryFn({
      signal: new AbortController().signal,
    });

    expect(mockGetCreditUsage).toHaveBeenCalledWith(
      { limit: 15, page: 2 },
      expect.any(AbortSignal),
    );
    expect(queryState.lastOptions?.queryKey).toEqual(['admin-credit-usage', 2]);
    expect(screen.getByLabelText('pagination')).toHaveAttribute(
      'data-total-label',
      'organizations',
    );
    navigation.search = '';
  });
});
