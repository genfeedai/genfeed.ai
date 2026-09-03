import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnalyticsAccounts from './analytics-accounts';

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({ filters: {} }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getAccountAnalytics: vi.fn().mockResolvedValue({
      accounts: [],
      limit: 50,
      page: 1,
      total: 0,
      totalPages: 1,
      unattributedPostCount: 0,
    }),
    getFleetEvaluationPolicy: vi.fn().mockResolvedValue({}),
    saveFleetEvaluationPolicy: vi.fn(),
  }),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ brandId: 'brand-1' }),
}));

describe('AnalyticsAccounts', () => {
  it('renders the accounts table', () => {
    render(<AnalyticsAccounts />);
    expect(screen.getByLabelText('Search accounts')).toBeInTheDocument();
  });
});
