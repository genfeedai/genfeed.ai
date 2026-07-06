import type { IOrganizationCreditUsage } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SubscriptionStatus } from '@genfeedai/enums';
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
  tier: 'pro',
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

vi.mock('@services/billing/subscriptions.service', () => ({
  SubscriptionsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
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
  })),
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
});
