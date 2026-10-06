import { AnalyticsMetric } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsTopAccounts from './analytics-top-accounts';

const mocks = vi.hoisted(() => ({
  pathname: '/acme/brand-x/analytics/overview',
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    selectedBrand: { slug: 'stale-brand', organization: { slug: 'acme' } },
  }),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  usePathname: () => mocks.pathname,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getTopAccounts: async () => ({
      accounts: [
        {
          identity: { credentialId: 'account-1', label: 'Account one' },
          metrics: [
            {
              metric: AnalyticsMetric.VIEWS,
              availability: 'observed',
              change: 42,
            },
          ],
        },
      ],
    }),
  }),
}));

describe('AnalyticsTopAccounts navigation', () => {
  beforeEach(() => {
    mocks.pathname = '/acme/brand-x/analytics/overview';
  });
  it.each(['brand-x', 'brand-y', '~'])(
    'preserves %s over the last selected brand',
    async (scope) => {
      mocks.pathname = `/acme/${scope}/analytics/overview`;
      render(<AnalyticsTopAccounts />);
      expect(
        await screen.findByRole('link', { name: 'View all' }),
      ).toHaveAttribute('href', `/acme/${scope}/analytics/accounts`);
      expect(screen.getByRole('link', { name: /Account one/ })).toHaveAttribute(
        'href',
        `/acme/${scope}/analytics/accounts/account-1`,
      );
    },
  );
});
