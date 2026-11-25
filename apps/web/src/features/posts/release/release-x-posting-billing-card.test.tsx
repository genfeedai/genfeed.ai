import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ReleaseXPostingBillingCard from './release-x-posting-billing-card';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/acme/~${path}` }),
}));

describe('ReleaseXPostingBillingCard', () => {
  it('tells an empty wallet to buy credits, and offers the plans', () => {
    render(<ReleaseXPostingBillingCard />);

    expect(
      screen.getByText('Not enough credits to post to X'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buy credits' })).toHaveAttribute(
      'href',
      '/acme/~/settings/credits',
    );
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute(
      'href',
      '/acme/~/settings/subscription',
    );
  });
});
