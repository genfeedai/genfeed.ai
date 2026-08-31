/* @vitest-environment jsdom */

import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import DiscoveryXAdsPage from './page';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@app-components/research/ads/AdsResearchPageClient', () => ({
  default: () => <div data-testid="ads-research-page-client" />,
}));

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/discovery/ads/x/page.tsx',
);

describe('DiscoveryXAdsPage', () => {
  it('shows the DSA Ads Repository notice without interaction', () => {
    render(<DiscoveryXAdsPage />);

    const notice = screen.getByRole('status');

    expect(notice).toHaveTextContent('DSA');
    expect(notice).toHaveTextContent("X's public Ads Repository");
    expect(notice).toHaveTextContent('DSA transparency export');
    expect(notice).toHaveTextContent('not live X reporting');
    expect(screen.getByTestId('ads-research-page-client')).toBeInTheDocument();
  });
});
