import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PrivacyContent from './privacy-content';

vi.mock('@web-hooks/ui/use-marketing-entrance', () => ({
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

describe('PrivacyContent Meta and TikTok disclosures', () => {
  it('describes Instagram Direct message handling and links the Meta policy', () => {
    render(<PrivacyContent />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Facebook and Instagram Data',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the Instagram Direct conversations of that account/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Meta Privacy Policy' }),
    ).toHaveAttribute('href', 'https://www.facebook.com/privacy/policy/');
  });

  it('states that TikTok direct messages are not read', () => {
    render(<PrivacyContent />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'TikTok Data' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/We do not read or send TikTok direct messages/),
    ).toBeInTheDocument();
  });

  it('gives data deletion instructions at a linkable anchor', () => {
    render(<PrivacyContent />);

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Deleting Data from Connected Platforms',
    });
    expect(heading.parentElement).toHaveAttribute('id', 'data-deletion');
    expect(screen.getAllByText(/privacy@genfeed\.ai/).length).toBeGreaterThan(
      0,
    );
  });
});
