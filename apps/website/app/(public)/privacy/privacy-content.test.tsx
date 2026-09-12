import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PrivacyContent from './privacy-content';

vi.mock('@hooks/ui/use-marketing-entrance', () => ({
  useMarketingEntrance: () => ({ current: null }),
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({ children, title }: { children: ReactNode; title: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

describe('PrivacyContent Google user data disclosure', () => {
  it('states the Limited Use commitment required for Google OAuth verification', () => {
    render(<PrivacyContent />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Google and YouTube Data',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /adheres to the Google API Services User Data Policy, including the Limited Use requirements/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/train generalized AI or machine learning models/),
    ).toBeInTheDocument();
  });

  it('links the Google and YouTube policies and the revocation page', () => {
    render(<PrivacyContent />);

    expect(
      screen.getByRole('link', {
        name: 'Google API Services User Data Policy',
      }),
    ).toHaveAttribute(
      'href',
      'https://developers.google.com/terms/api-services-user-data-policy',
    );
    expect(
      screen.getByRole('link', { name: 'YouTube Terms of Service' }),
    ).toHaveAttribute('href', 'https://www.youtube.com/t/terms');
    expect(
      screen.getByRole('link', { name: 'Google Privacy Policy' }),
    ).toHaveAttribute('href', 'https://policies.google.com/privacy');
    expect(
      screen.getByRole('link', { name: 'Google Account permissions' }),
    ).toHaveAttribute(
      'href',
      'https://security.google.com/settings/security/permissions',
    );
  });
});
