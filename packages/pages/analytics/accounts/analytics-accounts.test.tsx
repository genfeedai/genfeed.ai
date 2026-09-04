import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsAccounts from './analytics-accounts';

const requestState = vi.hoisted(() => ({ listError: false }));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({ dateRange: {}, filters: {} }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getAccountAnalytics: vi.fn(() =>
      requestState.listError
        ? Promise.reject(new Error('request failed'))
        : Promise.resolve({
            accounts: [],
            limit: 50,
            page: 1,
            total: 0,
            totalPages: 1,
            unattributedPostCount: 0,
          }),
    ),
    getFleetEvaluationPolicy: vi.fn().mockResolvedValue({}),
    saveFleetEvaluationPolicy: vi.fn(),
  }),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ brandId: 'brand-1' }),
}));

describe('AnalyticsAccounts', () => {
  beforeEach(() => {
    requestState.listError = false;
  });

  it('renders the accounts table', async () => {
    render(<AnalyticsAccounts />);
    expect(screen.getByLabelText('Search accounts')).toBeInTheDocument();
    expect(
      await screen.findByText('No connected accounts'),
    ).toBeInTheDocument();
  });

  it('renders an error and exits the loading state when requests fail', async () => {
    requestState.listError = true;

    render(<AnalyticsAccounts />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Account analytics could not be loaded.',
    );
  });
});
