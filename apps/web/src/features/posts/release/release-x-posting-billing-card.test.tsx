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
  it('sends a free plan to the plans page', () => {
    render(<ReleaseXPostingBillingCard code="x_posting_requires_paid_plan" />);

    expect(
      screen.getByText('Posting to X needs a paid plan'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a plan' })).toHaveAttribute(
      'href',
      '/acme/~/settings/subscription',
    );
  });

  it('sends an empty wallet to the credits page', () => {
    render(
      <ReleaseXPostingBillingCard code="x_posting_insufficient_credits" />,
    );

    expect(
      screen.getByText('Not enough credits to post to X'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buy credits' })).toHaveAttribute(
      'href',
      '/acme/~/settings/credits',
    );
  });
});
